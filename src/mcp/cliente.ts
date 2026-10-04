/**
 * Cliente mínimo de Argentina Data MCP para el navegador.
 *
 * El endpoint habla JSON-RPC 2.0 por HTTP POST, sin handshake de sesión: se puede llamar
 * `tools/call` directo. La respuesta viene enmarcada como Server-Sent Events
 * (`event: message\ndata: {...}`), y el dato útil está doblemente serializado: el
 * `result.content[0].text` es a su vez un JSON.
 *
 * Cada llamada sale con el token del visitante y consume SU cuota. Por eso el cliente:
 * - no repite una consulta que ya hizo en esta visita (memo en memoria, que muere al
 *   recargar: no es un caché de datos, es no cobrarle dos veces lo mismo a la persona);
 * - no reintenta nada que el servidor haya contestado ni un timeout, sólo las fallas de red;
 * - distingue la cuota agotada (que el MCP devuelve como HTTP 200 con `isError`) de un
 *   error de verdad, para que la interfaz pueda decir qué pasó.
 */

export class McpError extends Error {
  constructor(
    message: string,
    readonly tool?: string,
  ) {
    super(message);
    this.name = "McpError";
  }
}

/** Falta el token o el MCP lo rechazó: hay que volver a ingresar. */
export class McpAuthError extends McpError {
  override name = "McpAuthError";
}

/** El visitante agotó su cuota. `reinicioDiario` es ISO 8601, si el MCP lo informa. */
export class McpCuotaError extends McpError {
  override name = "McpCuotaError";
  constructor(
    message: string,
    tool: string,
    readonly reinicioDiario?: string,
  ) {
    super(message, tool);
  }
}

/** Tools que no consumen cuota y cuyo resultado cambia entre llamadas: no se memorizan. */
const SIN_MEMO = new Set(["consultar_cuota", "data_health"]);

const TIMEOUT_MS = 30_000;
const ESPERAS_MS = [1_500, 4_000];

type RespuestaJsonRpc = {
  result?: {
    content?: { type: string; text: string }[];
    isError?: boolean;
    structuredContent?: { error?: string; resets?: { daily?: string } };
  };
  error?: { code: number; message: string };
};

/** Extrae el primer payload `data:` de una respuesta SSE. Algunos despliegues responden JSON pelado. */
export function desenmarcarSse(cuerpo: string): string {
  for (const linea of cuerpo.split("\n")) {
    if (linea.startsWith("data:")) return linea.slice("data:".length).trim();
  }
  const plano = cuerpo.trim();
  if (plano.startsWith("{")) return plano;
  throw new McpError(`Respuesta del MCP sin payload reconocible: ${cuerpo.slice(0, 120)}`);
}

/** JSON con las claves ordenadas: `{a,b}` y `{b,a}` son la misma consulta. */
function claveDeConsulta(tool: string, args: Record<string, unknown>): string {
  const ordenado = Object.fromEntries(Object.entries(args).sort(([a], [b]) => a.localeCompare(b)));
  return `${tool} ${JSON.stringify(ordenado)}`;
}

const dormir = (ms: number) => new Promise((listo) => setTimeout(listo, ms));

export interface OpcionesCliente {
  endpoint: string;
  /** Devuelve el token vigente, o null si no hay sesión. Se lee en cada llamada. */
  token: () => string | null;
  fetch?: typeof fetch;
  esperasMs?: number[];
}

export interface ClienteMcp {
  llamar<T>(tool: string, args: Record<string, unknown>): Promise<T>;
}

export function crearCliente(opciones: OpcionesCliente): ClienteMcp {
  const hacerFetch = opciones.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const esperas = opciones.esperasMs ?? ESPERAS_MS;
  const memo = new Map<string, Promise<unknown>>();

  /** POST con reintentos sólo ante fallas de red: si el MCP contestó, reintentar no cambia nada y cuesta cuota. */
  async function postear(tool: string, cuerpo: string, token: string): Promise<Response> {
    let ultimaFalla = "";
    for (let intento = 0; intento <= esperas.length; intento++) {
      if (intento > 0) await dormir(esperas[intento - 1]!);
      try {
        return await hacerFetch(opciones.endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
          },
          body: cuerpo,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (e: unknown) {
        // Un timeout no se reintenta: el pedido pudo haber llegado y el MCP pudo haberlo cobrado.
        if (e instanceof DOMException && e.name === "TimeoutError") {
          throw new McpError("El MCP tardó demasiado en responder", tool);
        }
        ultimaFalla = e instanceof Error ? e.message : String(e);
      }
    }
    throw new McpError(`No se pudo conectar con el MCP (${ultimaFalla})`, tool);
  }

  async function llamarSinMemo<T>(tool: string, args: Record<string, unknown>): Promise<T> {
    const token = opciones.token();
    if (!token) throw new McpAuthError("No hay sesión iniciada", tool);

    const cuerpo = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: tool, arguments: args },
    });
    const respuesta = await postear(tool, cuerpo, token);

    if (respuesta.status === 401 || respuesta.status === 403) {
      throw new McpAuthError("El MCP rechazó la sesión", tool);
    }
    if (respuesta.status === 429) {
      throw new McpCuotaError("Demasiadas consultas", tool);
    }
    if (!respuesta.ok) {
      throw new McpError(`El MCP respondió HTTP ${respuesta.status}`, tool);
    }

    const sobre = JSON.parse(desenmarcarSse(await respuesta.text())) as RespuestaJsonRpc;
    if (sobre.error) throw new McpError(`${sobre.error.message} (código ${sobre.error.code})`, tool);

    const resultado = sobre.result;
    const texto = resultado?.content?.[0]?.text;
    if (resultado?.structuredContent?.error === "quota_exceeded") {
      throw new McpCuotaError(texto ?? "Cuota agotada", tool, resultado.structuredContent.resets?.daily);
    }
    if (texto === undefined) throw new McpError("La respuesta no trae contenido", tool);
    if (resultado?.isError) throw new McpError(texto, tool);

    return JSON.parse(texto) as T;
  }

  return {
    llamar<T>(tool: string, args: Record<string, unknown>): Promise<T> {
      if (SIN_MEMO.has(tool)) return llamarSinMemo<T>(tool, args);

      const clave = claveDeConsulta(tool, args);
      const previa = memo.get(clave);
      if (previa) return previa as Promise<T>;

      const promesa = llamarSinMemo<T>(tool, args);
      memo.set(clave, promesa);
      // Un error no se memoriza: la próxima vez que la interfaz la pida, se vuelve a intentar.
      promesa.catch(() => memo.delete(clave));
      return promesa;
    },
  };
}
