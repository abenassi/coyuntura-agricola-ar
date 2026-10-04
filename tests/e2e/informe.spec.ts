/**
 * El informe completo en un navegador real, con el MCP simulado: cada `tools/call` se contesta
 * con una respuesta real capturada del MCP (tests/fixtures). Prueba lo que los tests unitarios
 * no ven: que las secciones se carguen al abrirse, que el mapa dibuje y que la CSP no bloquee nada.
 */

import { readFileSync } from "node:fs";
import { expect, test, type Page, type Route } from "@playwright/test";

const fixture = (nombre: string) => JSON.parse(readFileSync(`tests/fixtures/${nombre}.json`, "utf8"));

const RESPUESTAS: Record<string, (args: Record<string, unknown>) => unknown> = {
  siia_cultivos_disponibles: () => fixture("cultivos-disponibles"),
  siia_balance_campania: (a) => fixture(a.campania === "2023/2024" ? "balance-2023-2024" : "balance-2024-2025"),
  siia_ranking_provincias: () => fixture("ranking-soja-produccion-2024-2025"),
  siia_evolucion_rendimiento: () => fixture("evolucion-soja-pais"),
  siia_estimaciones_cultivo: () => fixture("estimaciones-soja-2024-2025"),
  consultar_cuota: () => fixture("cuota-free"),
};

function sse(resultado: unknown) {
  return `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: 1, result: resultado })}\n\n`;
}

interface Simulacion {
  llamadas: string[];
  agotarEn?: string;
}

async function simularMcp(page: Page, sim: Simulacion) {
  await page.route("https://argentinadata.mymcps.dev/mcp", async (route: Route) => {
    const cuerpo = route.request().postDataJSON() as { params: { name: string; arguments: Record<string, unknown> } };
    const tool = cuerpo.params.name;
    sim.llamadas.push(tool);
    const headers = { "access-control-allow-origin": "*", "content-type": "text/event-stream" };
    if (tool === sim.agotarEn) {
      return route.fulfill({
        headers,
        body: sse({
          content: [{ type: "text", text: "⚠️ Cuota excedida" }],
          structuredContent: { error: "quota_exceeded", resets: { daily: "2026-10-05T03:00:00.000Z" } },
          isError: true,
        }),
      });
    }
    const dato = RESPUESTAS[tool]?.(cuerpo.params.arguments);
    return route.fulfill({ headers, body: sse({ content: [{ type: "text", text: JSON.stringify(dato) }] }) });
  });
  // El buzón de métricas no debería recibir nada desde localhost; si recibe, el test lo ve.
  await page.route("https://argentinadata.mymcps.dev/api/eventos", (r) => {
    sim.llamadas.push("api/eventos");
    return r.fulfill({ status: 204 });
  });
}

async function conSesion(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem("oauth-token", "adm_de_prueba"));
}

function erroresDeConsola(page: Page): string[] {
  const errores: string[] = [];
  page.on("console", (m) => m.type() === "error" && errores.push(m.text()));
  page.on("pageerror", (e) => errores.push(e.message));
  return errores;
}

test("sin sesión muestra la pantalla de ingreso y no consulta el MCP", async ({ page }) => {
  const sim: Simulacion = { llamadas: [] };
  await simularMcp(page, sim);
  const errores = erroresDeConsola(page);
  await page.goto("./");
  await expect(page.getByRole("button", { name: "Ingresar con Argentina Data" })).toBeVisible();
  expect(sim.llamadas).toEqual([]);
  expect(errores).toEqual([]);
});

test("con sesión: balance al abrir, el resto recién cuando se abre cada sección", async ({ page }) => {
  const sim: Simulacion = { llamadas: [] };
  await simularMcp(page, sim);
  await conSesion(page);
  const errores = erroresDeConsola(page);
  await page.goto("./");

  await expect(page.getByText("En 2024/25 los cuatro cultivos sumaron")).toBeVisible();
  await expect(page.locator("table.balance")).toContainText("51.107.839 t");
  await expect(page.locator(".cuota")).toHaveText("Te quedan 17 de 20 consultas hoy");
  const siia = () => sim.llamadas.filter((t) => t.startsWith("siia_"));
  expect(siia().sort()).toEqual(["siia_balance_campania", "siia_balance_campania", "siia_cultivos_disponibles"]);

  await page.getByText("Provincias líderes").click();
  await expect(page.locator(".barras li").first()).toContainText("Buenos Aires");
  await expect(page.locator(".barras li").first()).toContainText("30,4 %");

  await page.getByText("Evolución del rendimiento").click();
  await expect(page.getByText(/sobre el promedio de las últimas 10 campañas/)).toBeVisible();
  await expect(page.locator(".grafico canvas")).toBeVisible();

  await page.getByText("Mapa por departamento").click();
  await expect(page.locator(".mapa path.leaflet-interactive").first()).toBeVisible();
  expect(await page.locator(".mapa path.leaflet-interactive").count()).toBeGreaterThan(500);
  await expect(page.locator("#mapa .aviso")).toHaveCount(0); // todos los departamentos cruzaron

  expect(siia()).toHaveLength(6);
  expect(sim.llamadas).not.toContain("api/eventos");
  expect(errores).toEqual([]);
  await page.screenshot({ path: "test-results/informe.png", fullPage: true });
});

test("cambiar de métrica en el ranking pide una sola consulta y actualiza la URL", async ({ page }) => {
  const sim: Simulacion = { llamadas: [] };
  await simularMcp(page, sim);
  await conSesion(page);
  await page.goto("./?cultivo=maiz");
  await page.getByText("Provincias líderes").click();
  await expect(page.locator(".barras li").first()).toBeVisible();
  const antes = sim.llamadas.filter((t) => t === "siia_ranking_provincias").length;
  await page.getByLabel("Ordenar por").selectOption("rendimiento");
  await expect(page).toHaveURL(/ranking=rendimiento/);
  await expect(page).toHaveURL(/cultivo=maiz/);
  await expect.poll(() => sim.llamadas.filter((t) => t === "siia_ranking_provincias").length).toBe(antes + 1);
});

test("cuota agotada: la sección lo dice, con link a los planes, y el resto sigue a la vista", async ({ page }) => {
  const sim: Simulacion = { llamadas: [], agotarEn: "siia_ranking_provincias" };
  await simularMcp(page, sim);
  await conSesion(page);
  await page.goto("./");
  await expect(page.locator("table.balance")).toBeVisible();
  await page.getByText("Provincias líderes").click();
  await expect(page.locator("#ranking")).toContainText("Llegaste al límite de consultas de tu plan");
  await expect(page.locator("#ranking a", { hasText: "Ver planes" })).toHaveAttribute("href", /\/upgrade\?source=coyuntura-agricola/);
  await expect(page.locator("table.balance")).toBeVisible();
});

test("parámetros inválidos en la URL caen a los defaults", async ({ page }) => {
  const sim: Simulacion = { llamadas: [] };
  await simularMcp(page, sim);
  await conSesion(page);
  await page.goto("./?cultivo=papa&campania=xx&vs=1900/1901");
  await expect(page.locator("table.balance")).toBeVisible();
  await expect(page.locator(".cultivos button[aria-pressed=true]")).toHaveText("Soja");
  await expect(page.getByLabel("Campaña", { exact: true })).toHaveValue("2024/2025");
});

test("en el celular el informe entra en el ancho de la pantalla", async ({ page }) => {
  const sim: Simulacion = { llamadas: [] };
  await simularMcp(page, sim);
  await conSesion(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await expect(page.locator("table.balance")).toBeVisible();
  await page.getByText("Provincias líderes").click();
  await page.getByText("Mapa por departamento").click();
  await expect(page.locator(".mapa path.leaflet-interactive").first()).toBeVisible();
  const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(desborde).toBeLessThanOrEqual(0);
  // La tabla del balance tampoco puede necesitar scroll: la columna de variación es la que importa.
  const desbordeTabla = await page.locator(".tabla-scroll").evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(desbordeTabla).toBeLessThanOrEqual(0);
  await page.screenshot({ path: "test-results/informe-celular.png", fullPage: true });
});
