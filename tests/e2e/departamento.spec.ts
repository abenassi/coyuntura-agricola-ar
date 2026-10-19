/** "Tu departamento" en un navegador real, con el MCP simulado desde respuestas reales. */

import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { conSesion, erroresDeConsola, simularMcp, sse, type Simulacion } from "./mcp-simulado";

const historias = (sim: Simulacion) =>
  (sim.detalle ?? []).filter((d) => d.tool === "siia_estimaciones_cultivo" && d.args.departamento);

async function abrir(page: Page, url = "./") {
  await page.goto(url);
  await page.getByRole("tab", { name: "Tu departamento" }).click();
}

test("se elige con el buscador predictivo y muestra la historia contra la provincia", async ({ page }) => {
  const sim: Simulacion = { llamadas: [], detalle: [] };
  await simularMcp(page, sim);
  await conSesion(page);
  const errores = erroresDeConsola(page);
  await abrir(page);
  await expect(page.locator("#departamento")).toContainText("Elegí un departamento");
  expect(historias(sim)).toHaveLength(0);

  const buscador = page.getByRole("combobox", { name: "Departamento" });
  await buscador.fill("general lop");
  await expect(page.locator(".sugerencias [role=option]").first()).toContainText("General López");
  await buscador.press("Enter");

  await expect(page.locator("#departamento .resumen")).toContainText("General López, Santa Fe");
  await expect(page.locator("#departamento .resumen")).toContainText("3.168 kg/ha");
  await expect(page.locator("#departamento .grafico canvas")).toBeVisible();
  await expect(page).toHaveURL(/depto=82042/);
  expect(historias(sim).map((d) => d.args)).toEqual([
    { cultivo: "soja total", provincia: "Santa Fe", departamento: "General López", limit: 500 },
  ]);
  expect(sim.detalle!.filter((d) => d.tool === "siia_evolucion_rendimiento" && d.args.campanias === 30)).toHaveLength(1);
  expect(errores).toEqual([]);
});

test("comparar suma una consulta; cambiar variable o período no consulta nada", async ({ page }) => {
  const sim: Simulacion = { llamadas: [], detalle: [] };
  await simularMcp(page, sim);
  await conSesion(page);
  await abrir(page, "./?depto=82042");
  await expect(page.locator("#departamento .grafico canvas")).toBeVisible();

  const comparar = page.getByRole("combobox", { name: "Comparar con" });
  await comparar.fill("caseros");
  // "caseros" también sugiere Monte Caseros (Corrientes): elegir el de Santa Fe.
  await page.locator(".sugerencias [role=option]").filter({ hasText: "Santa Fe" }).filter({ hasText: "Caseros" }).click();
  await expect(page).toHaveURL(/vs_depto=82014/);
  await expect(page.locator("#departamento .resumen")).toContainText("Caseros, Santa Fe");
  await expect(page.locator("#departamento .resumen")).toContainText("3.763 kg/ha");
  expect(historias(sim)).toHaveLength(2);

  const antes = sim.detalle!.length;
  await page.getByLabel("Variable").selectOption("produccion");
  await expect(page.locator("#departamento .resumen")).toContainText("1.870.873 t");
  await page.getByRole("button", { name: "Toda la serie" }).click();
  await expect(page).toHaveURL(/rango=todo/);
  await expect(page.locator("#departamento table tbody tr")).toHaveCount(56);
  // Producción y período salen de lo que ya vino: ninguna consulta nueva al MCP.
  expect(sim.detalle!.slice(antes).filter((d) => d.tool.startsWith("siia_"))).toEqual([]);
});

test("desde el mapa: 'Ver su evolución' abre la pestaña con ese departamento", async ({ page }) => {
  const sim: Simulacion = { llamadas: [], detalle: [] };
  await simularMcp(page, sim);
  await conSesion(page);
  await page.goto("./");
  await page.getByRole("tab", { name: "Mapa" }).click();
  await expect.poll(() => page.locator(".mapa path.leaflet-interactive").count()).toBeGreaterThan(500);
  // Abrir el detalle de General López (Santa Fe) con un clic sobre su polígono.
  const ok = await page.evaluate(() => {
    for (const p of document.querySelectorAll<SVGPathElement>(".mapa path.leaflet-interactive")) {
      const r = p.getBoundingClientRect();
      const punto = { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
      p.dispatchEvent(new MouseEvent("mouseover", punto));
      p.dispatchEvent(new MouseEvent("mousemove", punto));
      const t = [...document.querySelectorAll(".leaflet-tooltip")].map((x) => x.textContent ?? "");
      p.dispatchEvent(new MouseEvent("mouseout", punto));
      if (t.some((x) => x.startsWith("General López:"))) {
        p.dispatchEvent(new MouseEvent("click", punto));
        return true;
      }
    }
    return false;
  });
  expect(ok).toBe(true);
  await page.getByRole("button", { name: "Ver su evolución →" }).click();
  await expect(page.getByRole("tab", { name: "Tu departamento" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#departamento")).toBeVisible();
  await expect(page.locator("#departamento .resumen")).toContainText("General López, Santa Fe");
  await expect(page).toHaveURL(/depto=82042/);
});

test("un departamento sin datos avisa y deja elegir otro", async ({ page }) => {
  const sim: Simulacion = { llamadas: [], detalle: [] };
  await simularMcp(page, sim);
  await page.route("https://argentinadata.mymcps.dev/mcp", async (route) => {
    const cuerpo = route.request().postDataJSON() as { params: { name: string; arguments: Record<string, unknown> } };
    if (cuerpo.params.name === "siia_estimaciones_cultivo" && cuerpo.params.arguments.departamento === "Ushuaia") {
      return route.fulfill({
        headers: { "access-control-allow-origin": "*", "content-type": "text/event-stream" },
        body: sse({ content: [{ type: "text", text: "Error: No hay datos de 'soja total' para el departamento 'Ushuaia'." }], isError: true }),
      });
    }
    return route.fallback();
  });
  await conSesion(page);
  await abrir(page);
  const buscador = page.getByRole("combobox", { name: "Departamento" });
  await buscador.fill("ushuaia");
  await buscador.press("Enter");
  await expect(page.locator("#departamento")).toContainText("No hay datos de 'soja total' para el departamento 'Ushuaia'");
  await expect(page.locator("#departamento")).not.toContainText("No se pudo cargar");
  await buscador.fill("general lop");
  await buscador.press("Enter");
  await expect(page.locator("#departamento .resumen")).toContainText("General López, Santa Fe");
});

test("si la consulta vino recortada, avisa que la serie puede estar incompleta", async ({ page }) => {
  const sim: Simulacion = {
    llamadas: [],
    detalle: [],
    // Simula un nombre que coincide con otro departamento: la tool encontró más filas de las que devolvió.
    respuesta: (tool, args) => {
      if (tool !== "siia_estimaciones_cultivo" || args.departamento !== "General López") return undefined;
      const r = JSON.parse(readFileSync("tests/fixtures/estimaciones-soja-general-lopez.json", "utf8"));
      return { ...r, total: 612 };
    },
  };
  await simularMcp(page, sim);
  await conSesion(page);
  await abrir(page, "./?depto=82042");
  await expect(page.locator("#departamento .resumen")).toContainText("El de la provincia en");
  await expect(page.locator("#departamento .aviso")).toContainText("puede estar incompleta: la consulta trajo 56 de 612 filas");
});

test("si no carga la lista de departamentos, avisa y deja reintentar", async ({ page }) => {
  const sim: Simulacion = { llamadas: [] };
  await simularMcp(page, sim);
  let fallar = true;
  await page.route("**/geo/departamentos.topo.json", (route) => (fallar ? route.abort() : route.fallback()));
  await conSesion(page);
  await abrir(page);
  await expect(page.locator("#departamento .aviso")).toContainText("No pudimos cargar la lista de departamentos");
  fallar = false;
  await page.getByRole("button", { name: "Reintentar" }).click();
  await expect(page.getByRole("combobox", { name: "Departamento" })).toBeVisible();
});
