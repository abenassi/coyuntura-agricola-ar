import { afterEach, describe, expect, test, vi } from "vitest";

/** Carga el módulo como si la página estuviera servida desde `hostname`. */
async function cargarEn(hostname: string) {
  vi.resetModules();
  const sendBeacon = vi.fn((_url: string, _cuerpo: Blob) => true);
  const fetch = vi.fn();
  vi.stubGlobal("location", { hostname, pathname: "/", search: "?utm_source=x" });
  vi.stubGlobal("document", { referrer: "" });
  vi.stubGlobal("navigator", { sendBeacon });
  vi.stubGlobal("fetch", fetch);
  vi.stubGlobal("sessionStorage", { getItem: () => "sesion-1", setItem: () => {} });
  const modulo = await import("../src/analytics");
  return { modulo, sendBeacon, fetch };
}

afterEach(() => vi.unstubAllGlobals());

describe("analytics", () => {
  test("en localhost (o en un fork) no manda nada", async () => {
    const { modulo, sendBeacon, fetch } = await cargarEn("localhost");
    modulo.cultivoElegido("maiz");
    expect(sendBeacon).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  test("en producción manda el evento al MCP como texto plano", async () => {
    const { modulo, sendBeacon } = await cargarEn("agro.mymcps.dev");
    modulo.cultivoElegido("maiz");
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [url, blob] = sendBeacon.mock.calls[0]!;
    expect(url).toBe("https://argentinadata.mymcps.dev/api/eventos");
    expect(blob.type).toContain("text/plain");
    const cuerpo = JSON.parse(await blob.text());
    expect(cuerpo).toMatchObject({
      sitio: "coyuntura-agricola",
      evento: "cultivo_elegido",
      sesion: "sesion-1",
      utm_source: "x",
      props: { cultivo: "maiz" },
    });
  });

  test("nunca tira, aunque el navegador no tenga sendBeacon ni fetch", async () => {
    const { modulo } = await cargarEn("agro.mymcps.dev");
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("fetch", () => {
      throw new Error("sin red");
    });
    expect(() => modulo.errorMcp("siia_balance_campania", "red")).not.toThrow();
  });
});
