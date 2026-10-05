/**
 * El informe completo en un navegador real, con el MCP simulado: cada `tools/call` se contesta
 * con una respuesta real capturada del MCP (tests/fixtures). Prueba lo que los tests unitarios
 * no ven: que las secciones se carguen al abrirse, que el mapa dibuje y que la CSP no bloquee nada.
 */

import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { conSesion, erroresDeConsola, simularMcp, sse, type Simulacion } from "./mcp-simulado";

test("sin sesión muestra la pantalla de ingreso y no consulta el MCP", async ({ page }) => {
  const sim: Simulacion = { llamadas: [] };
  await simularMcp(page, sim);
  const errores = erroresDeConsola(page);
  await page.goto("./");
  await expect(page.getByRole("button", { name: "Ver el informe completo" }).first()).toBeVisible();
  // Las vistas previas cargan (si faltara un archivo, la imagen queda en 0 px de ancho natural).
  for (const img of await page.locator(".previa img").all()) {
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  }
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

test("una respuesta vieja no borra el mapa que ya está a la vista", async ({ page }) => {
  // Maíz tarda más que trigo: si el visitante toca maíz y enseguida trigo, la respuesta de maíz
  // llega última y no corresponde dibujarla.
  const sim: Simulacion = { llamadas: [], demora: (tool, a) => (tool === "siia_estimaciones_cultivo" && a.cultivo === "maíz" ? 1500 : 0) };
  await simularMcp(page, sim);
  await conSesion(page);
  await page.goto("./");
  await page.getByText("Mapa por departamento").click();
  await expect(page.locator(".mapa path.leaflet-interactive").first()).toBeVisible();
  await page.getByRole("button", { name: "Maíz" }).click();
  await page.getByRole("button", { name: "Trigo" }).click();
  await page.waitForTimeout(2500);
  expect(await page.locator("#mapa .mapa path.leaflet-interactive").count()).toBeGreaterThan(500);
});

test("una respuesta vieja no borra el gráfico de evolución", async ({ page }) => {
  const sim: Simulacion = { llamadas: [], demora: (tool, a) => (tool === "siia_evolucion_rendimiento" && a.provincia === "Buenos Aires" && a.cultivo === "soja total" ? 1500 : 0) };
  await simularMcp(page, sim);
  await conSesion(page);
  await page.goto("./");
  await page.getByText("Evolución del rendimiento").click();
  await expect(page.locator(".grafico canvas")).toBeVisible();
  await page.getByLabel("Zona").selectOption("Buenos Aires");
  await page.getByRole("button", { name: "Maíz" }).click();
  await page.waitForTimeout(2500);
  const pintado = await page.locator("#evolucion .grafico canvas").evaluate((c: HTMLCanvasElement) => {
    const datos = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < datos.length; i += 4) if (datos[i]! > 0) return true;
    return false;
  });
  expect(pintado).toBe(true);
});

test("con la cuota ya agotada al entrar, avisa de la cuota y no muestra un error genérico", async ({ page }) => {
  const sim: Simulacion = { llamadas: [], agotarEn: "siia_cultivos_disponibles" };
  await simularMcp(page, sim);
  await conSesion(page);
  await page.goto("./");
  await expect(page.getByText("Llegaste al límite de consultas de tu plan")).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver planes" })).toBeVisible();
  await expect(page.getByText("No se pudo consultar el MCP")).toHaveCount(0);
});

test("los nombres que vienen del MCP se muestran como texto, nunca como HTML", async ({ page }) => {
  // "Unión<!---->" cruza igual con el polígono de Unión (la normalización descarta la puntuación),
  // y como HTML sería un comentario invisible: si el tooltip lo muestra literal, entró como texto.
  const soja = JSON.parse(readFileSync("tests/fixtures/estimaciones-soja-2024-2025.json", "utf8"));
  const sim: Simulacion = {
    llamadas: [],
    respuesta: (tool) =>
      tool === "siia_estimaciones_cultivo"
        ? { ...soja, datos: soja.datos.map((f: { provincia: string; departamento: string }) => (f.provincia === "Córdoba" && f.departamento === "Unión" ? { ...f, departamento: "Unión<!---->" } : f)) }
        : undefined,
  };
  await simularMcp(page, sim);
  await conSesion(page);
  await page.goto("./");
  await page.getByText("Mapa por departamento").click();
  await expect(page.locator(".mapa path.leaflet-interactive").first()).toBeVisible();
  const visto = await page.evaluate(() => {
    // Leaflet guarda la capa en cada path; buscamos la de Unión y le abrimos el tooltip.
    for (const p of document.querySelectorAll<SVGPathElement>(".mapa path.leaflet-interactive")) {
      const r = p.getBoundingClientRect();
      const punto = { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
      p.dispatchEvent(new MouseEvent("mouseover", punto));
      p.dispatchEvent(new MouseEvent("mousemove", punto));
      const union = [...document.querySelectorAll(".leaflet-tooltip")].map((t) => t.textContent ?? "").find((t) => t.startsWith("Unión"));
      if (union) return union;
      p.dispatchEvent(new MouseEvent("mouseout", punto));
    }
    return null;
  });
  expect(visto).toContain("Unión<!---->");
});

test("una provincia sin datos avisa, y después se puede elegir otra", async ({ page }) => {
  const sim: Simulacion = { llamadas: [] };
  await simularMcp(page, sim);
  // La tool contesta con isError y una explicación cuando la provincia no tiene datos.
  await page.route("https://argentinadata.mymcps.dev/mcp", async (route) => {
    const cuerpo = route.request().postDataJSON() as { params: { name: string; arguments: Record<string, unknown> } };
    if (cuerpo.params.name === "siia_evolucion_rendimiento" && cuerpo.params.arguments.provincia === "Tierra del Fuego") {
      return route.fulfill({
        headers: { "access-control-allow-origin": "*", "content-type": "text/event-stream" },
        body: sse({ content: [{ type: "text", text: "Error: No hay datos de rendimiento de 'soja total' para la provincia 'Tierra del Fuego'." }], isError: true }),
      });
    }
    return route.fallback();
  });
  await conSesion(page);
  await page.goto("./");
  await page.getByText("Evolución del rendimiento").click();
  await expect(page.locator("#evolucion .grafico canvas")).toBeVisible();

  await page.getByLabel("Zona").selectOption("Tierra del Fuego");
  await expect(page.locator("#evolucion")).toContainText("No hay datos de rendimiento");
  await expect(page.locator("#evolucion")).not.toContainText("No se pudo cargar");
  await expect(page.getByLabel("Zona")).toHaveValue("Tierra del Fuego");

  await page.getByLabel("Zona").selectOption("Córdoba");
  await expect(page.locator("#evolucion .grafico canvas")).toBeVisible();
  await expect(page).toHaveURL(/provincia=C%C3%B3rdoba/);
});
