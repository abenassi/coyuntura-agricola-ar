/**
 * Tu departamento: la historia de un departamento para el cultivo elegido, comparable con otro
 * departamento y, para el rinde, con su provincia.
 *
 * Una consulta a `siia_estimaciones_cultivo` por departamento y cultivo trae toda la serie (desde
 * 1969 cuando hay datos). Cambiar de variable o de rango no consulta nada: se recorta lo que ya
 * vino. La referencia provincial es `siia_evolucion_rendimiento` (30 campañas, el máximo de la
 * tool) y se pide sólo para el rinde, que es lo único comparable entre un departamento y su
 * provincia.
 */

import { CategoryScale, Chart, Legend, LinearScale, LineController, LineElement, PointElement, Tooltip } from "chart.js";
import * as analytics from "../../analytics";
import {
  promedioUltimas,
  recortarRango,
  serieDepartamento,
  variacionPct,
  type PuntoSerie,
  type RangoDepto,
  type VariableDepto,
} from "../../datos/calculos";
import type { Consultas } from "../../datos/consultas";
import { cultivo, type Estimaciones } from "../../datos/tipos";
import { cargarGeometria } from "../../geo/geometria";
import { listaDepartamentos, nombreSiia, type Departamento } from "../../geo/departamentos";
import { McpToolError } from "../../mcp/cliente";
import { buscadorDepartamento, texto } from "../buscador-depto";
import { h, selector } from "../dom";
import { campaniaCorta, hectareas, kgHa, pct, toneladas } from "../formato";
import type { Filtros } from "../filtros";
import { notaFuente } from "./comun";

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend);

const VARIABLES: Record<VariableDepto, { nombre: string; unidad: string; formato: (n: number | null) => string }> = {
  rendimiento: { nombre: "Rinde", unidad: "kg/ha", formato: kgHa },
  produccion: { nombre: "Producción", unidad: "t", formato: toneladas },
  sup_sembrada: { nombre: "Superficie sembrada", unidad: "ha", formato: hectareas },
  sup_cosechada: { nombre: "Superficie cosechada", unidad: "ha", formato: hectareas },
};

const RANGOS: [RangoDepto, string][] = [
  ["10", "10 campañas"],
  ["20", "20 campañas"],
  ["todo", "Toda la serie"],
];

let lista: Promise<Departamento[]> | null = null;
function departamentos(): Promise<Departamento[]> {
  lista ??= cargarGeometria().then(listaDepartamentos);
  lista.catch(() => (lista = null));
  return lista;
}

let grafico: Chart | null = null;

interface Serie {
  etiqueta: string;
  puntos: PuntoSerie[];
  tipo: "a" | "b" | "provincia";
}

export function seccionDepartamento(q: Consultas, filtros: () => Filtros, cambiar: (p: Partial<Filtros>) => void) {
  return {
    clave: () => {
      const f = filtros();
      return `${f.cultivo} ${f.depto} ${f.vsDepto} ${f.variableDepto} ${f.rangoDepto}`;
    },

    controles: () => {
      const f = filtros();
      const caja = h("div", { class: "controles-seccion controles-depto" }, h("p", { class: "cargando" }, "Cargando departamentos…"));
      const llenar = () => departamentos().then((todos) => {
        const porCodigo = new Map(todos.map((d) => [d.codigo, d]));
        const a = f.depto ? (porCodigo.get(f.depto) ?? null) : null;
        const b = f.vsDepto ? (porCodigo.get(f.vsDepto) ?? null) : null;
        const hijos: (HTMLElement | null)[] = [
          buscadorDepartamento({
            etiqueta: "Departamento",
            placeholder: "Escribí un departamento o partido…",
            lista: todos,
            elegido: a,
            alElegir: (d) => {
              analytics.departamentoElegido("buscador", d.codigo);
              cambiar({ depto: d.codigo, vsDepto: filtros().vsDepto === d.codigo ? null : filtros().vsDepto });
            },
          }),
          a
            ? buscadorDepartamento({
                etiqueta: "Comparar con",
                placeholder: "Otro departamento (opcional)",
                lista: todos.filter((d) => d.codigo !== a.codigo),
                elegido: b,
                alElegir: (d) => {
                  analytics.departamentoComparado(d.codigo);
                  cambiar({ vsDepto: d.codigo });
                },
                alQuitar: () => cambiar({ vsDepto: null }),
              })
            : null,
          a
            ? selector(
                "Variable",
                Object.entries(VARIABLES).map(([v, x]) => [v, x.nombre] as const),
                f.variableDepto,
                (v) => {
                  analytics.metricaElegida("departamento", v);
                  cambiar({ variableDepto: v as VariableDepto });
                },
              )
            : null,
          a
            ? h(
                "div",
                { class: "rangos", role: "group", "aria-label": "Período" },
                RANGOS.map(([r, t]) =>
                  h(
                    "button",
                    {
                      type: "button",
                      "aria-pressed": r === f.rangoDepto ? "true" : "false",
                      onclick: () => {
                        if (r === filtros().rangoDepto) return;
                        analytics.metricaElegida("departamento_rango", r);
                        cambiar({ rangoDepto: r });
                      },
                    },
                    t,
                  ),
                ),
              )
            : null,
        ];
        caja.replaceChildren(...hijos.filter((x): x is HTMLElement => x !== null));
      }, () => {
        // Sin la lista no hay buscador: se avisa y se deja reintentar (la caché ya se vació).
        caja.replaceChildren(
          h("p", { class: "aviso" }, "No pudimos cargar la lista de departamentos. ",
            h("button", { type: "button", class: "reintentar", onclick: () => {
              caja.replaceChildren(h("p", { class: "cargando" }, "Cargando departamentos…"));
              void llenar();
            } }, "Reintentar")),
        );
      });
      void llenar();
      return caja;
    },

    async cargar(cuerpo: HTMLElement, vigente: () => boolean) {
      const f = filtros();
      if (!f.depto) {
        cuerpo.append(
          h(
            "p",
            { class: "resumen" },
            "Elegí un departamento para ver cómo le fue campaña tras campaña: escribí su nombre arriba o tocalo en el mapa. ",
            "Después podés compararlo con otro.",
          ),
        );
        return;
      }

      const todos = await departamentos();
      const porCodigo = new Map(todos.map((d) => [d.codigo, d]));
      const a = porCodigo.get(f.depto);
      if (!a) {
        cuerpo.append(h("p", { class: "aviso" }, "No encontramos ese departamento. Elegí otro arriba."));
        return;
      }
      const b = f.vsDepto ? porCodigo.get(f.vsDepto) : undefined;
      const c = f.cultivo;
      const conProvincia = f.variableDepto === "rendimiento";

      const [ra, rb, rp] = await Promise.allSettled([
        q.historiaDepartamento(c, a.provincia, nombreSiia(a)),
        b ? q.historiaDepartamento(c, b.provincia, nombreSiia(b)) : Promise.resolve(null),
        conProvincia ? q.evolucionProvincia30(c, a.provincia) : Promise.resolve(null),
      ]);
      if (!vigente()) return;

      // El departamento principal manda: si falla, la sección muestra el aviso (o el error) y listo.
      if (ra.status === "rejected") throw ra.reason;
      const avisos: string[] = [];
      const motivo = (r: PromiseRejectedResult) => {
        // Una explicación de la tool (no hay datos) se muestra; cualquier otra falla se propaga.
        if (r.reason instanceof McpToolError) return r.reason.message;
        throw r.reason;
      };

      const series: Serie[] = [];
      // Si el nombre está contenido en el de otro departamento de la provincia, la tool trae los dos.
      const incompleta = (r: Estimaciones, d: Departamento) => {
        if (r.devueltos < r.total) avisos.push(`La serie de ${texto(d)} puede estar incompleta: la consulta trajo ${r.devueltos} de ${r.total} filas.`);
      };
      incompleta(ra.value, a);
      const serieA = serieDepartamento(ra.value.datos, nombreSiia(a), f.variableDepto);
      if (!serieA.length) {
        cuerpo.append(h("p", { class: "aviso" }, `No hay datos de ${cultivo(c).nombre.toLowerCase()} para ${texto(a)}. Probá con otro cultivo.`));
        return;
      }
      series.push({ etiqueta: a.nombre, puntos: serieA, tipo: "a" });

      if (b) {
        if (rb.status === "rejected") avisos.push(motivo(rb));
        else if (rb.value) {
          incompleta(rb.value, b);
          const s = serieDepartamento(rb.value.datos, nombreSiia(b), f.variableDepto);
          if (s.length) series.push({ etiqueta: b.nombre, puntos: s, tipo: "b" });
          else avisos.push(`No hay datos de ${cultivo(c).nombre.toLowerCase()} para ${texto(b)}.`);
        }
      }
      if (conProvincia) {
        if (rp.status === "rejected") avisos.push(motivo(rp));
        else if (rp.value?.evolucion?.length) {
          series.push({
            etiqueta: `${a.provincia} (provincia)`,
            puntos: rp.value.evolucion.map((e) => ({ campania: e.campania, valor: e.rendimiento_kg_ha })),
            tipo: "provincia",
          });
        }
      }

      const recortadas = recortarSeries(series, f.rangoDepto);
      const v = VARIABLES[f.variableDepto];
      const lienzo = h("canvas", {
        role: "img",
        "aria-label": `${v.nombre} de ${cultivo(c).nombre.toLowerCase()} en ${series.map((s) => s.etiqueta).join(", ")}`,
      });
      cuerpo.append(
        resumen(series, f.variableDepto, cultivo(c).nombre, a, b),
        h("div", { class: "grafico grafico-depto" }, lienzo),
        ...(f.rangoDepto === "todo" && conProvincia && series.some((s) => s.tipo === "provincia")
          ? [h("p", { class: "nota" }, "La serie provincial llega hasta 30 campañas atrás, el máximo que publica la tool.")]
          : []),
        ...avisos.map((x) => h("p", { class: "aviso" }, x)),
        tabla(recortadas, v.formato),
        notaFuente(ra.value),
      );
      dibujar(lienzo, recortadas, v.unidad, v.formato);
    },
  };
}

/** El rango se aplica sobre las campañas del departamento principal, y las demás series se alinean. */
function recortarSeries(series: Serie[], rango: RangoDepto): Serie[] {
  const campanias = new Set(recortarRango(series[0]!.puntos, rango).map((p) => p.campania));
  return series.map((s) => ({ ...s, puntos: s.puntos.filter((p) => campanias.has(p.campania)) }));
}

function frase(s: Serie, variable: VariableDepto, cultivoNombre: string, lugar: string): Node[] {
  const v = VARIABLES[variable];
  const ultimo = s.puntos.at(-1)!;
  const prom = promedioUltimas(s.puntos.slice(0, -1), 10);
  const dif = variacionPct(ultimo.valor, prom);
  const lado = dif == null ? "" : dif >= 0 ? "sobre" : "bajo";
  return [
    document.createTextNode(`En ${campaniaCorta(ultimo.campania)}, ${v.nombre.toLowerCase()} de ${cultivoNombre.toLowerCase()} en ${lugar}: `),
    h("strong", {}, v.formato(ultimo.valor)),
    document.createTextNode(
      dif == null
        ? ". "
        : `, ${pct(Math.abs(dif)).replace(/^[+−]/, "")} ${lado} el promedio de las 10 campañas anteriores (${v.formato(prom)}). `,
    ),
  ];
}

function resumen(series: Serie[], variable: VariableDepto, cultivoNombre: string, a: Departamento, b: Departamento | undefined): HTMLElement {
  const sa = series.find((s) => s.tipo === "a")!;
  const sb = series.find((s) => s.tipo === "b");
  const sp = series.find((s) => s.tipo === "provincia");
  return h(
    "p",
    { class: "resumen" },
    frase(sa, variable, cultivoNombre, texto(a)),
    sb && b ? frase(sb, variable, cultivoNombre, texto(b)) : null,
    provincial(sa, sp),
  );
}

/** El rinde provincial de la misma campaña que el del departamento, para que se puedan comparar. */
function provincial(sa: Serie, sp: Serie | undefined): string | null {
  const c = sa.puntos.at(-1)!.campania;
  const p = sp?.puntos.find((x) => x.campania === c);
  return p ? `El de la provincia en ${campaniaCorta(c)} fue ${kgHa(p.valor)}.` : null;
}

function tabla(series: Serie[], formato: (n: number | null) => string): HTMLElement {
  const campanias = [...new Set(series.flatMap((s) => s.puntos.map((p) => p.campania)))].sort().reverse();
  const valor = (s: Serie, c: string) => s.puntos.find((p) => p.campania === c)?.valor ?? null;
  return h(
    "details",
    { class: "ver-tabla" },
    h("summary", {}, "Ver los datos en una tabla"),
    h(
      "div",
      { class: "tabla-scroll" },
      h(
        "table",
        {},
        h("thead", {}, h("tr", {}, h("th", {}, "Campaña"), series.map((s) => h("th", { class: "num" }, s.etiqueta)))),
        h(
          "tbody",
          {},
          campanias.map((c) => h("tr", {}, h("td", {}, campaniaCorta(c)), series.map((s) => h("td", { class: "num" }, formato(valor(s, c)))))),
        ),
      ),
    ),
  );
}

function color(variable: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
}

function dibujar(lienzo: HTMLCanvasElement, series: Serie[], unidad: string, formato: (n: number | null) => string) {
  grafico?.destroy();
  const campanias = [...new Set(series.flatMap((s) => s.puntos.map((p) => p.campania)))].sort();
  const tinta = color("--texto-secundario");
  const estilo = { a: color("--serie-1"), b: color("--serie-2"), provincia: tinta };

  grafico = new Chart(lienzo, {
    type: "line",
    data: {
      labels: campanias.map(campaniaCorta),
      datasets: series.map((s) => ({
        label: s.etiqueta,
        data: campanias.map((c) => s.puntos.find((p) => p.campania === c)?.valor ?? null),
        borderColor: estilo[s.tipo],
        backgroundColor: estilo[s.tipo],
        borderWidth: s.tipo === "provincia" ? 1.5 : 2,
        borderDash: s.tipo === "provincia" ? [4, 4] : [],
        pointRadius: s.tipo === "provincia" ? 0 : campanias.length > 30 ? 0 : 3,
        pointHoverRadius: 5,
        tension: 0,
        spanGaps: false,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { ticks: { color: tinta, maxRotation: 0, autoSkip: true }, grid: { display: false } },
        y: {
          ticks: { color: tinta, callback: (v) => Number(v).toLocaleString("es-AR") },
          grid: { color: color("--grilla") },
          title: { display: true, text: unidad, color: tinta },
        },
      },
      plugins: {
        legend: { display: series.length > 1, labels: { color: tinta, boxWidth: 12, boxHeight: 2 } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formato(ctx.parsed.y)}` } },
      },
    },
  });
}
