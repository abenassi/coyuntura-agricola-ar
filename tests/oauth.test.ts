import { beforeEach, describe, expect, test, vi } from "vitest";
import { cerrarSesion, codeChallenge, completarLogin, iniciarLogin, token } from "../src/mcp/oauth";

/** sessionStorage y history mínimos: los tests corren en node, sin navegador. */
function navegadorFalso() {
  const datos = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, v),
    removeItem: (k: string) => void datos.delete(k),
  });
  const replaceState = vi.fn();
  vi.stubGlobal("history", { replaceState });
  return { datos, replaceState };
}

const REDIRECT = "https://agro.mymcps.dev/";
const CLIENT = "cliente-de-prueba";

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("codeChallenge", () => {
  test("coincide con el vector de prueba del RFC 7636 (apéndice B)", async () => {
    expect(await codeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });
});

describe("iniciarLogin", () => {
  test("arma la URL de /authorize con PKCE y guarda verifier y state", async () => {
    const { datos } = navegadorFalso();
    const url = new URL(await iniciarLogin(REDIRECT, CLIENT));
    expect(url.origin + url.pathname).toBe("https://argentinadata.mymcps.dev/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe(CLIENT);
    expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    const verifier = datos.get("oauth-verifier")!;
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(url.searchParams.get("code_challenge")).toBe(await codeChallenge(verifier));
    expect(url.searchParams.get("state")).toBe(datos.get("oauth-state"));
  });

  test("sin client_id configurado tira un error que explica qué falta", async () => {
    navegadorFalso();
    await expect(iniciarLogin(REDIRECT, "")).rejects.toThrow(/registrar-cliente/);
  });
});

describe("completarLogin", () => {
  async function volverDelLogin(state?: string) {
    const nav = navegadorFalso();
    const autorizar = new URL(await iniciarLogin(REDIRECT, CLIENT));
    const vuelta = new URL(REDIRECT);
    vuelta.searchParams.set("code", "el-code");
    vuelta.searchParams.set("state", state ?? autorizar.searchParams.get("state")!);
    return { ...nav, vuelta };
  }

  test("sin code en la URL no hace nada", async () => {
    navegadorFalso();
    const f = vi.fn();
    expect(await completarLogin(new URL(REDIRECT), REDIRECT, CLIENT, f)).toBe("sin_code");
    expect(f).not.toHaveBeenCalled();
  });

  test("canjea el code por el token y limpia la URL", async () => {
    const { vuelta, replaceState, datos } = await volverDelLogin();
    const verifier = datos.get("oauth-verifier");
    const f = vi.fn(async (_u: RequestInfo | URL, _i?: RequestInit) =>
      Response.json({ access_token: "adm_abc", token_type: "Bearer" }),
    );
    expect(await completarLogin(vuelta, REDIRECT, CLIENT, f)).toBe("ok");
    expect(token()).toBe("adm_abc");
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("https://argentinadata.mymcps.dev/token");
    const cuerpo = new URLSearchParams(init!.body as string);
    expect(cuerpo.get("grant_type")).toBe("authorization_code");
    expect(cuerpo.get("code")).toBe("el-code");
    expect(cuerpo.get("code_verifier")).toBe(verifier);
    expect(cuerpo.get("redirect_uri")).toBe(REDIRECT);
    expect(cuerpo.get("client_id")).toBe(CLIENT);
    expect(replaceState).toHaveBeenCalled();
    expect(String(replaceState.mock.calls[0]![2])).not.toContain("code=");
    expect(datos.has("oauth-verifier")).toBe(false);
  });

  test("con un state que no coincide no canjea el code", async () => {
    const { vuelta, replaceState } = await volverDelLogin("otro-state");
    const f = vi.fn();
    expect(await completarLogin(vuelta, REDIRECT, CLIENT, f)).toBe("state_invalido");
    expect(f).not.toHaveBeenCalled();
    expect(token()).toBeNull();
    expect(replaceState).toHaveBeenCalled();
  });

  test("la misma URL de vuelta no sirve dos veces", async () => {
    const { vuelta } = await volverDelLogin();
    const f = vi.fn(async () => Response.json({ access_token: "adm_abc" }));
    expect(await completarLogin(vuelta, REDIRECT, CLIENT, f)).toBe("ok");
    expect(await completarLogin(vuelta, REDIRECT, CLIENT, f)).toBe("state_invalido");
    expect(f).toHaveBeenCalledTimes(1);
  });

  test("si /token falla no guarda nada", async () => {
    const { vuelta } = await volverDelLogin();
    const f = vi.fn(async () => Response.json({ error: "invalid_grant" }, { status: 400 }));
    expect(await completarLogin(vuelta, REDIRECT, CLIENT, f)).toBe("error");
    expect(token()).toBeNull();
  });

  test("si la red falla devuelve error en vez de tirar", async () => {
    const { vuelta } = await volverDelLogin();
    const f = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await completarLogin(vuelta, REDIRECT, CLIENT, f)).toBe("error");
  });

  test("el MCP devolvió error en el redirect (por ejemplo, el usuario canceló)", async () => {
    navegadorFalso();
    const vuelta = new URL(REDIRECT);
    vuelta.searchParams.set("error", "access_denied");
    expect(await completarLogin(vuelta, REDIRECT, CLIENT, vi.fn())).toBe("error");
  });
});

test("cerrarSesion borra el token", async () => {
  const { datos } = navegadorFalso();
  datos.set("oauth-token", "adm_abc");
  expect(token()).toBe("adm_abc");
  cerrarSesion();
  expect(token()).toBeNull();
});
