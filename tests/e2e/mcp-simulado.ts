/**
 * El MCP simulado para los tests en navegador: cada `tools/call` se contesta con una respuesta
 * real capturada del MCP (tests/fixtures). Lo usan los e2e y el generador de vistas previas.
 */

import { readFileSync } from "node:fs";
import type { Page, Route } from "@playwright/test";

const fixture = (nombre: string) => JSON.parse(readFileSync(`tests/fixtures/${nombre}.json`, "utf8"));

const RESPUESTAS: Record<string, (args: Record<string, unknown>) => unknown> = {
  siia_cultivos_disponibles: () => fixture("cultivos-disponibles"),
  siia_balance_campania: (a) => fixture(a.campania === "2023/2024" ? "balance-2023-2024" : "balance-2024-2025"),
  siia_ranking_provincias: () => fixture("ranking-soja-produccion-2024-2025"),
  siia_evolucion_rendimiento: () => fixture("evolucion-soja-pais"),
  siia_estimaciones_cultivo: () => fixture("estimaciones-soja-2024-2025"),
  consultar_cuota: () => fixture("cuota-free"),
};

export function sse(resultado: unknown) {
  return `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: 1, result: resultado })}\n\n`;
}

export interface Simulacion {
  llamadas: string[];
  agotarEn?: string;
  /** Milisegundos de demora por consulta, para provocar respuestas fuera de orden. */
  demora?: (tool: string, args: Record<string, unknown>) => number;
  /** Reemplaza la respuesta de una tool. */
  respuesta?: (tool: string, args: Record<string, unknown>) => unknown;
}

export async function simularMcp(page: Page, sim: Simulacion) {
  await page.route("https://argentinadata.mymcps.dev/mcp", async (route: Route) => {
    const cuerpo = route.request().postDataJSON() as { params: { name: string; arguments: Record<string, unknown> } };
    const tool = cuerpo.params.name;
    sim.llamadas.push(tool);
    const ms = sim.demora?.(tool, cuerpo.params.arguments) ?? 0;
    if (ms) await new Promise((listo) => setTimeout(listo, ms));
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
    const dato = sim.respuesta?.(tool, cuerpo.params.arguments) ?? RESPUESTAS[tool]?.(cuerpo.params.arguments);
    return route.fulfill({ headers, body: sse({ content: [{ type: "text", text: JSON.stringify(dato) }] }) });
  });
  // El buzón de métricas no debería recibir nada desde localhost; si recibe, el test lo ve.
  await page.route("https://argentinadata.mymcps.dev/api/eventos", (r) => {
    sim.llamadas.push("api/eventos");
    return r.fulfill({ status: 204 });
  });
}

export async function conSesion(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem("oauth-token", "adm_de_prueba"));
}

export function erroresDeConsola(page: Page): string[] {
  const errores: string[] = [];
  page.on("console", (m) => m.type() === "error" && errores.push(m.text()));
  page.on("pageerror", (e) => errores.push(e.message));
  return errores;
}

