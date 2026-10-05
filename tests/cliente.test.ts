import { describe, expect, test, vi } from "vitest";
import {
  crearCliente,
  McpToolError,
  desenmarcarSse,
  McpAuthError,
  McpCuotaError,
  McpError,
} from "../src/mcp/cliente";

/** Arma la respuesta HTTP como la manda el MCP: SSE con el JSON-RPC adentro, y el dato doblemente serializado. */
function respuestaMcp(dato: unknown, extra: Record<string, unknown> = {}, status = 200): Response {
  const sobre = {
    jsonrpc: "2.0",
    id: 1,
    result: { content: [{ type: "text", text: JSON.stringify(dato) }], ...extra },
  };
  return new Response(`event: message\ndata: ${JSON.stringify(sobre)}\n\n`, { status });
}

function clienteCon(fetchFalso: typeof fetch, token: string | null = "tok") {
  return crearCliente({ endpoint: "https://mcp.test/mcp", token: () => token, fetch: fetchFalso, esperasMs: [0, 0] });
}

describe("desenmarcarSse", () => {
  test("extrae el payload de una respuesta SSE", () => {
    expect(desenmarcarSse('event: message\ndata: {"a":1}\n\n')).toBe('{"a":1}');
  });
  test("acepta JSON pelado", () => {
    expect(desenmarcarSse(' {"a":1} ')).toBe('{"a":1}');
  });
  test("tira con un cuerpo irreconocible", () => {
    expect(() => desenmarcarSse("<html>")).toThrow(McpError);
  });
});

describe("crearCliente().llamar", () => {
  test("devuelve el dato deserializado y manda el Bearer", async () => {
    const f = vi.fn(async (_url: string, _init: RequestInit) => respuestaMcp({ campania: "2024/2025" }));
    const dato = await clienteCon(f as unknown as typeof fetch).llamar("siia_balance_campania", {});
    expect(dato).toEqual({ campania: "2024/2025" });
    const init = f.mock.calls[0]![1];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok");
    expect(headers.Accept).toBe("application/json, text/event-stream");
    expect(JSON.parse(init.body as string)).toMatchObject({
      method: "tools/call",
      params: { name: "siia_balance_campania", arguments: {} },
    });
  });

  test("sin token tira McpAuthError sin llamar a la red", async () => {
    const f = vi.fn();
    await expect(clienteCon(f as unknown as typeof fetch, null).llamar("x", {})).rejects.toBeInstanceOf(McpAuthError);
    expect(f).not.toHaveBeenCalled();
  });

  test("un 401 tira McpAuthError y no reintenta", async () => {
    const f = vi.fn(async () => new Response("no", { status: 401 }));
    await expect(clienteCon(f as unknown as typeof fetch).llamar("x", {})).rejects.toBeInstanceOf(McpAuthError);
    expect(f).toHaveBeenCalledTimes(1);
  });

  test("cuota agotada (HTTP 200 + isError + quota_exceeded) tira McpCuotaError con el reinicio", async () => {
    const f = vi.fn(async () =>
      respuestaMcp("⚠️ Cuota excedida", {
        isError: true,
        structuredContent: { error: "quota_exceeded", resets: { daily: "2026-10-05T03:00:00.000Z" } },
      }),
    );
    const error = await clienteCon(f as unknown as typeof fetch).llamar("x", {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(McpCuotaError);
    expect((error as McpCuotaError).reinicioDiario).toBe("2026-10-05T03:00:00.000Z");
    expect(f).toHaveBeenCalledTimes(1);
  });

  test("un HTTP 429 también es cuota agotada", async () => {
    const f = vi.fn(async () => new Response("too many", { status: 429 }));
    await expect(clienteCon(f as unknown as typeof fetch).llamar("x", {})).rejects.toBeInstanceOf(McpCuotaError);
    expect(f).toHaveBeenCalledTimes(1);
  });

  test("un timeout no se reintenta: el MCP pudo haber cobrado la consulta", async () => {
    const f = vi.fn(async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    });
    await expect(clienteCon(f as unknown as typeof fetch).llamar("x", {})).rejects.toBeInstanceOf(McpError);
    expect(f).toHaveBeenCalledTimes(1);
  });

  test("otro error de tool tira McpError con el texto", async () => {
    const f = vi.fn(async () => respuestaMcp("cultivo inválido", { isError: true }));
    const error = await clienteCon(f as unknown as typeof fetch).llamar("x", {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(McpError);
    expect(error).not.toBeInstanceOf(McpCuotaError);
    expect((error as Error).message).toContain("cultivo inválido");
  });

  test("una respuesta de la tool con isError (por ejemplo, sin datos) es McpToolError y no se vuelve a pedir", async () => {
    const f = vi.fn(async () => respuestaMcp("No hay datos de rendimiento de 'soja total' para la provincia 'Tierra del Fuego'.", { isError: true }));
    const c = clienteCon(f as unknown as typeof fetch);
    const error = await c.llamar("siia_evolucion_rendimiento", { provincia: "Tierra del Fuego" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(McpToolError);
    await c.llamar("siia_evolucion_rendimiento", { provincia: "Tierra del Fuego" }).catch(() => {});
    expect(f).toHaveBeenCalledTimes(1);
  });

  test("un error JSON-RPC tira McpError", async () => {
    const f = vi.fn(
      async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: "bad" } })),
    );
    await expect(clienteCon(f as unknown as typeof fetch).llamar("x", {})).rejects.toThrow(/bad/);
  });

  test("reintenta fallas de red y después responde", async () => {
    let n = 0;
    const f = vi.fn(async () => {
      n++;
      if (n < 3) throw new TypeError("fetch failed");
      return respuestaMcp({ ok: true });
    });
    await expect(clienteCon(f as unknown as typeof fetch).llamar("x", {})).resolves.toEqual({ ok: true });
    expect(f).toHaveBeenCalledTimes(3);
  });

  test("después de agotar los reintentos tira McpError", async () => {
    const f = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(clienteCon(f as unknown as typeof fetch).llamar("x", {})).rejects.toBeInstanceOf(McpError);
    expect(f).toHaveBeenCalledTimes(3);
  });

  test("un 500 no se reintenta: el MCP ya contestó", async () => {
    const f = vi.fn(async () => new Response("boom", { status: 500 }));
    await expect(clienteCon(f as unknown as typeof fetch).llamar("x", {})).rejects.toBeInstanceOf(McpError);
    expect(f).toHaveBeenCalledTimes(1);
  });

  test("la misma consulta no se repite, aunque los argumentos vengan en otro orden", async () => {
    const f = vi.fn(async () => respuestaMcp({ ok: true }));
    const c = clienteCon(f as unknown as typeof fetch);
    await c.llamar("x", { a: 1, b: 2 });
    await c.llamar("x", { b: 2, a: 1 });
    expect(f).toHaveBeenCalledTimes(1);
    await c.llamar("x", { a: 1, b: 3 });
    expect(f).toHaveBeenCalledTimes(2);
  });

  test("una consulta que falló se puede volver a pedir", async () => {
    let n = 0;
    const f = vi.fn(async () => (++n === 1 ? new Response("no", { status: 400 }) : respuestaMcp({ ok: true })));
    const c = clienteCon(f as unknown as typeof fetch);
    await expect(c.llamar("x", {})).rejects.toBeInstanceOf(McpError);
    await expect(c.llamar("x", {})).resolves.toEqual({ ok: true });
  });

  test("las meta-tools no se memorizan (la cuota cambia en cada consulta)", async () => {
    const f = vi.fn(async () => respuestaMcp({ ok: true }));
    const c = clienteCon(f as unknown as typeof fetch);
    await c.llamar("consultar_cuota", {});
    await c.llamar("consultar_cuota", {});
    expect(f).toHaveBeenCalledTimes(2);
  });
});
