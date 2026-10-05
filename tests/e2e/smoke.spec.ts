/**
 * Smoke contra el sitio publicado: `SITIO=https://agro.mymcps.dev/ npm run smoke`.
 *
 * Sin cuenta: verifica que la home cargue sin errores, que el botón de ingreso arme un pedido
 * OAuth válido (PKCE S256, el client_id configurado, la vuelta a esta misma URL) y que el MCP
 * muestre su pantalla de autorización para ese cliente, sin advertencia de destino desconocido.
 */

import { expect, test } from "@playwright/test";
import { CLIENT_ID } from "../../src/config";

test("la home carga y el ingreso lleva a la autorización del MCP", async ({ page, baseURL }) => {
  const errores: string[] = [];
  // El proxy de Cloudflare inyecta su script de Web Analytics en el HTML. La CSP lo bloquea a
  // propósito (el token del visitante vive en el navegador: nada de scripts de terceros), así que
  // ese bloqueo es esperado y no cuenta como error.
  const esperado = (t: string) => t.includes("static.cloudflareinsights.com") && t.includes("Content Security Policy");
  page.on("console", (m) => m.type() === "error" && !esperado(m.text()) && errores.push(m.text()));
  page.on("pageerror", (e) => errores.push(e.message));

  await page.goto("./");
  await expect(page.getByRole("button", { name: "Ver el informe completo" }).first()).toBeVisible();
  expect(errores).toEqual([]);

  await page.getByRole("button", { name: "Ver el informe completo" }).first().click();
  await page.waitForURL(/argentinadata\.mymcps\.dev\/authorize/);
  const url = new URL(page.url());
  expect(url.searchParams.get("client_id")).toBe(CLIENT_ID);
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(url.searchParams.get("redirect_uri")).toBe(baseURL);

  await expect(page.getByText("Iniciar sesion con Google")).toBeVisible();
  await expect(page.getByText("No reconocemos ese destino")).toHaveCount(0);
});
