/**
 * Ingreso del visitante con su propia cuenta de Argentina Data: OAuth 2.1 con PKCE.
 *
 * Por qué así y no con una API key del sitio: un sitio estático no puede guardar un secreto.
 * Cualquier key que use el navegador la puede copiar cualquiera (ver docs/decisiones/0001).
 * Con PKCE no hay ningún secreto en juego: el sitio es un "cliente público", cada visitante
 * se autentica en el MCP y las consultas salen de su cuota.
 *
 * El flujo, en cuatro pasos:
 * 1. `iniciarLogin` genera un `code_verifier` al azar, guarda su hash (`code_challenge`) en la
 *    URL de /authorize y manda al visitante ahí.
 * 2. El MCP lo autentica (con Google o con su API key) y vuelve a este sitio con `?code=...`.
 * 3. `completarLogin` canjea ese code por el token, presentando el verifier original. Sólo
 *    quien inició el flujo lo conoce, así que un code interceptado no le sirve a nadie más.
 * 4. El token queda en sessionStorage: se borra al cerrar la pestaña.
 */

import { MCP_BASE } from "../config";

const CLAVE_TOKEN = "oauth-token";
const CLAVE_VERIFIER = "oauth-verifier";
const CLAVE_STATE = "oauth-state";

/** base64url sin padding, como pide el RFC 7636. */
function base64url(bytes: Uint8Array): string {
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function azar(cantidadBytes: number): string {
  return base64url(crypto.getRandomValues(new Uint8Array(cantidadBytes)));
}

/** `code_challenge` = base64url(SHA-256(verifier)). */
export async function codeChallenge(verifier: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(hash));
}

/** Prepara el flujo y devuelve la URL de autorización a la que hay que mandar al visitante. */
export async function iniciarLogin(redirectUri: string, clientId: string): Promise<string> {
  if (!clientId) {
    throw new Error("Falta el client_id: corré `npm run registrar-cliente` y completalo en src/config.ts");
  }
  const verifier = azar(32); // 43 caracteres, el mínimo del RFC
  const state = azar(16);
  sessionStorage.setItem(CLAVE_VERIFIER, verifier);
  sessionStorage.setItem(CLAVE_STATE, state);

  const url = new URL(`${MCP_BASE}/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code_challenge", await codeChallenge(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  return url.toString();
}

export type ResultadoLogin = "ok" | "sin_code" | "state_invalido" | "error";

/**
 * Si la URL actual es la vuelta del MCP, canjea el code por el token.
 *
 * Pase lo que pase, borra el verifier y el state y saca `code`/`state` de la barra de
 * direcciones: un code sirve una sola vez, y no tiene que quedar en el historial ni en un
 * link que alguien copie.
 */
export async function completarLogin(
  url: URL,
  redirectUri: string,
  clientId: string,
  hacerFetch: typeof fetch = (...a) => fetch(...a),
): Promise<ResultadoLogin> {
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  if (!code && !error) return "sin_code";

  const verifier = sessionStorage.getItem(CLAVE_VERIFIER);
  const stateEsperado = sessionStorage.getItem(CLAVE_STATE);
  sessionStorage.removeItem(CLAVE_VERIFIER);
  sessionStorage.removeItem(CLAVE_STATE);

  const limpia = new URL(url);
  for (const p of ["code", "state", "error", "error_description"]) limpia.searchParams.delete(p);
  history.replaceState(null, "", limpia.toString());

  if (error) return "error";
  if (!verifier || !stateEsperado || url.searchParams.get("state") !== stateEsperado) return "state_invalido";

  try {
    const respuesta = await hacerFetch(`${MCP_BASE}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code!,
        code_verifier: verifier,
        redirect_uri: redirectUri,
        client_id: clientId,
      }).toString(),
    });
    if (!respuesta.ok) return "error";
    const cuerpo = (await respuesta.json()) as { access_token?: string };
    if (!cuerpo.access_token) return "error";
    sessionStorage.setItem(CLAVE_TOKEN, cuerpo.access_token);
    return "ok";
  } catch {
    return "error";
  }
}

/** Token vigente, o null si el visitante no ingresó. */
export function token(): string | null {
  try {
    return sessionStorage.getItem(CLAVE_TOKEN);
  } catch {
    return null;
  }
}

export function cerrarSesion(): void {
  sessionStorage.removeItem(CLAVE_TOKEN);
}
