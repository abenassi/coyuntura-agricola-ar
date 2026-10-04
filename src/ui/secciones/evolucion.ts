/**
 * Evolución del rendimiento en las últimas diez campañas, país o provincia, contra su promedio.
 *
 * Una consulta a `siia_evolucion_rendimiento` por cultivo y provincia. La tool siempre devuelve
 * las campañas más recientes: si la campaña elegida arriba está dentro de la ventana, se resalta.
 */

import { CategoryScale, Chart, LinearScale, LineController, LineElement, PointElement, Tooltip } from "chart.js";
import * as analytics from "../../analytics";
import { variacionPct } from "../../datos/calculos";
import type { Consultas } from "../../datos/consultas";
import { cultivo, type Evolucion } from "../../datos/tipos";
import { h, selector } from "../dom";
import { campaniaCorta, kgHa, pct } from "../formato";
import { PROVINCIAS, type Filtros } from "../filtros";
import { notaFuente } from "./comun";

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip);

let grafico: Chart | null = null;

export function seccionEvolucion(q: Consultas, filtros: () => Filtros, cambiar: (p: Partial<Filtros>) => void) {
  return {
    clave: () => `${filtros().cultivo} ${filtros().provincia} ${filtros().campania}`,
    async cargar(cuerpo: HTMLElement) {
      const { cultivo: c, provincia, campania } = filtros();
      const ev = await q.evolucion(c, provincia);

      const control = selector(
        "Zona",
        [["", "Total país"], ...PROVINCIAS.map((p) => [p, p] as const)],
        provincia ?? "",
        (p) => {
          analytics.provinciaElegida(p || null);
          cambiar({ provincia: p || null });
        },
      );
      cuerpo.append(h("div", { class: "controles-seccion" }, control));

      if (!ev.evolucion?.length) {
        cuerpo.append(h("p", { class: "aviso" }, `No hay datos de ${cultivo(c).nombre.toLowerCase()} para ${provincia ?? "el país"}.`), notaFuente(ev));
        return;
      }

      const lienzo = h("canvas", { role: "img", "aria-label": descripcion(ev, c, provincia) });
      cuerpo.append(
        resumen(ev, campania, provincia),
        h("div", { class: "grafico" }, lienzo),
        tablaAccesible(ev),
        notaFuente(ev),
      );
      dibujar(lienzo, ev, campania);
    },
  };
}

function descripcion(ev: Evolucion, c: Filtros["cultivo"], provincia: string | null): string {
  return `Rendimiento de ${cultivo(c).nombre.toLowerCase()} en ${provincia ?? "el país"}, campañas ${campaniaCorta(ev.evolucion[0]!.campania)} a ${campaniaCorta(ev.evolucion.at(-1)!.campania)}`;
}

/** "En 2024/25 el rendimiento fue 2.928 kg/ha, +4,1 % sobre el promedio de las últimas 10 campañas." */
function resumen(ev: Evolucion, campania: string | null, provincia: string | null): HTMLElement {
  const punto = ev.evolucion.find((e) => e.campania === campania) ?? ev.evolucion.at(-1)!;
  const v = variacionPct(punto.rendimiento_kg_ha, ev.promedio_rendimiento_kg_ha);
  const lado = v == null ? "" : v >= 0 ? "sobre" : "bajo";
  return h(
    "p",
    { class: "resumen" },
    `En ${campaniaCorta(punto.campania)} el rendimiento en ${provincia ?? "el país"} fue `,
    h("strong", {}, kgHa(punto.rendimiento_kg_ha)),
    v == null ? "." : `, ${pct(Math.abs(v)).replace(/^[+−]/, "")} ${lado} el promedio de las últimas ${ev.evolucion.length} campañas (${kgHa(ev.promedio_rendimiento_kg_ha)}).`,
  );
}

function tablaAccesible(ev: Evolucion): HTMLElement {
  return h(
    "details",
    { class: "ver-tabla" },
    h("summary", {}, "Ver los datos en una tabla"),
    h(
      "table",
      {},
      h("thead", {}, h("tr", {}, h("th", {}, "Campaña"), h("th", { class: "num" }, "Rendimiento"), h("th", { class: "num" }, "Variación"))),
      h(
        "tbody",
        {},
        ev.evolucion.map((e) =>
          h("tr", {}, h("td", {}, campaniaCorta(e.campania)), h("td", { class: "num" }, kgHa(e.rendimiento_kg_ha)), h("td", { class: "num" }, pct(e.variacion_pct))),
        ),
      ),
    ),
  );
}

function color(variable: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
}

function dibujar(lienzo: HTMLCanvasElement, ev: Evolucion, campania: string | null) {
  grafico?.destroy();
  const etiquetas = ev.evolucion.map((e) => campaniaCorta(e.campania));
  const resaltada = ev.evolucion.findIndex((e) => e.campania === campania);
  const serie = color("--serie-1");
  const tinta = color("--texto-secundario");
  const grilla = color("--grilla");

  grafico = new Chart(lienzo, {
    type: "line",
    data: {
      labels: etiquetas,
      datasets: [
        {
          label: "Rendimiento",
          data: ev.evolucion.map((e) => e.rendimiento_kg_ha),
          borderColor: serie,
          backgroundColor: serie,
          borderWidth: 2,
          pointRadius: ev.evolucion.map((_, i) => (i === resaltada ? 6 : 4)),
          pointBorderColor: color("--superficie"),
          pointBorderWidth: 2,
          pointHoverRadius: 7,
          tension: 0,
        },
        {
          label: "Promedio",
          data: ev.evolucion.map(() => ev.promedio_rendimiento_kg_ha),
          borderColor: tinta,
          borderDash: [4, 4],
          borderWidth: 1,
          pointRadius: 0,
          pointHoverRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { ticks: { color: tinta }, grid: { display: false } },
        y: {
          ticks: { color: tinta, callback: (v) => `${Number(v).toLocaleString("es-AR")}` },
          grid: { color: grilla },
          title: { display: true, text: "kg/ha", color: tinta },
        },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${kgHa(ctx.parsed.y)}`,
          },
        },
      },
    },
  });
}
