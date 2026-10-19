/**
 * Evolución del rendimiento en las últimas diez campañas, país o provincia, contra su promedio.
 *
 * Una consulta a `siia_evolucion_rendimiento` por cultivo y provincia. La tool siempre devuelve
 * las campañas más recientes: si la campaña elegida arriba está dentro de la ventana, se resalta.
 */

import { CategoryScale, Chart, LinearScale, LineController, LineElement, PointElement, Tooltip, type Plugin } from "chart.js";
import * as analytics from "../../analytics";
import { variacionPct } from "../../datos/calculos";
import type { Consultas } from "../../datos/consultas";
import { cultivo, type Evolucion } from "../../datos/tipos";
import { h, selector } from "../dom";
import { campaniaCorta, kgHa, numero, pct } from "../formato";
import { PROVINCIAS, type Filtros } from "../filtros";
import { notaFuente, titular, variacion } from "./comun";

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip);

let grafico: Chart | null = null;

export function seccionEvolucion(q: Consultas, filtros: () => Filtros, cambiar: (p: Partial<Filtros>) => void) {
  return {
    clave: () => `${filtros().cultivo} ${filtros().provincia} ${filtros().campania}`,
    controles: () =>
      h(
        "div",
        { class: "controles-seccion" },
        selector("Zona", [["", "Total país"], ...PROVINCIAS.map((p) => [p, p] as const)], filtros().provincia ?? "", (p) => {
          analytics.provinciaElegida(p || null);
          cambiar({ provincia: p || null });
        }),
      ),
    async cargar(cuerpo: HTMLElement, vigente: () => boolean) {
      const { cultivo: c, provincia, campania } = filtros();
      const ev = await q.evolucion(c, provincia);
      if (!vigente()) return;


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

/** La campaña que se comenta: la elegida arriba si está en la ventana, si no la última. */
function destacada(ev: Evolucion, campania: string | null): number {
  const i = ev.evolucion.findIndex((e) => e.campania === campania);
  return i >= 0 ? i : ev.evolucion.length - 1;
}

/** "En 2024/25 el rendimiento fue 2.928 kg/ha, +4,1 % sobre el promedio de las últimas 10 campañas." */
function resumen(ev: Evolucion, campania: string | null, provincia: string | null): HTMLElement {
  const punto = ev.evolucion[destacada(ev, campania)]!;
  const v = variacionPct(punto.rendimiento_kg_ha, ev.promedio_rendimiento_kg_ha);
  const lado = v == null ? "" : v >= 0 ? "sobre" : "bajo";
  return h(
    "div",
    {},
    titular(kgHa(punto.rendimiento_kg_ha), variacion(v), `${campaniaCorta(punto.campania)}, contra el promedio de ${ev.evolucion.length} campañas`),
    h(
    "p",
    { class: "resumen" },
    `En ${campaniaCorta(punto.campania)} el rendimiento en ${provincia ?? "el país"} fue `,
    h("strong", {}, kgHa(punto.rendimiento_kg_ha)),
    v == null ? "." : `, ${pct(Math.abs(v)).replace(/^[+−]/, "")} ${lado} el promedio de las últimas ${ev.evolucion.length} campañas (${kgHa(ev.promedio_rendimiento_kg_ha)}).`,
    ),
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

/**
 * Rótulos sobre el gráfico: qué es la línea punteada y, en un globo, el valor de la campaña
 * destacada contra el promedio. Va como plugin de este gráfico y no con Chart.register, que es
 * global y lo pondría también en el de "Tu departamento".
 */
function rotulos(ev: Evolucion, resaltada: number): Plugin<"line"> {
  return {
    id: "rotulos-evolucion",
    afterDatasetsDraw(chart) {
      const { ctx, chartArea: area, scales } = chart;
      const tinta = color("--texto-secundario");
      const fuente = getComputedStyle(document.body).fontFamily;
      ctx.save();

      const yProm = scales.y!.getPixelForValue(ev.promedio_rendimiento_kg_ha);
      ctx.font = `12px ${fuente}`;
      ctx.fillStyle = tinta;
      ctx.textBaseline = "bottom";
      ctx.fillText(`promedio ${ev.evolucion.length} campañas · ${numero(ev.promedio_rendimiento_kg_ha)}`, area.left + 6, yProm - 4);

      const punto = chart.getDatasetMeta(0).data[resaltada];
      const dato = ev.evolucion[resaltada];
      if (punto && dato) {
        const v = variacionPct(dato.rendimiento_kg_ha, ev.promedio_rendimiento_kg_ha);
        const linea1 = `${campaniaCorta(dato.campania)} · ${kgHa(dato.rendimiento_kg_ha)}`;
        // En un gráfico angosto (celular) el globo va en una línea, para tapar menos la serie.
        const linea2 = v == null || area.width < 420 ? "" : `${pct(v)} ${v >= 0 ? "sobre" : "bajo"} el promedio`;
        ctx.font = `600 12px ${fuente}`;
        const ancho = Math.max(ctx.measureText(linea1).width, ctx.measureText(linea2).width) + 16;
        const alto = linea2 ? 38 : 22;
        const x = Math.min(Math.max(punto.x - ancho / 2, area.left), area.right - ancho);
        const arriba = punto.y - 12 - alto;
        const y = arriba >= area.top ? arriba : punto.y + 12;
        ctx.fillStyle = color("--texto");
        ctx.beginPath();
        ctx.roundRect(x, y, ancho, alto, 6);
        ctx.fill();
        ctx.fillStyle = color("--superficie");
        ctx.textBaseline = "top";
        ctx.fillText(linea1, x + 8, y + 5);
        if (linea2) {
          ctx.font = `12px ${fuente}`;
          ctx.fillText(linea2, x + 8, y + 20);
        }
      }
      ctx.restore();
    },
  };
}

function dibujar(lienzo: HTMLCanvasElement, ev: Evolucion, campania: string | null) {
  grafico?.destroy();
  const etiquetas = ev.evolucion.map((e) => campaniaCorta(e.campania));
  const resaltada = destacada(ev, campania);
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
          pointRadius: ev.evolucion.map((_, i) => (i === resaltada ? 7 : 3)),
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
    plugins: [rotulos(ev, resaltada)],
    options: {
      layout: { padding: { top: 8 } },
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
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${kgHa(ctx.parsed.y)}`,
          },
        },
      },
    },
  });
}
