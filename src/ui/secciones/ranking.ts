/**
 * Ranking de provincias para el cultivo elegido.
 *
 * Una consulta a `siia_ranking_provincias` por cultivo, campaña y métrica. Para producción y
 * superficie la barra es la participación en el total país; para rendimiento, que no se suma
 * entre provincias, es la comparación contra el promedio nacional (100 = promedio país).
 *
 * Barras en HTML y no en canvas: cada fila es a la vez el gráfico y la tabla, se lee con un
 * lector de pantalla y se puede copiar.
 */

import * as analytics from "../../analytics";
import type { Consultas } from "../../datos/consultas";
import { cultivo, type MetricaRanking, type Ranking } from "../../datos/tipos";
import { h, selector } from "../dom";
import { campaniaCorta, hectareas, kgHa, participacion, toneladas } from "../formato";
import type { Filtros } from "../filtros";
import { notaFuente } from "./comun";

const NOMBRES: Record<MetricaRanking, string> = {
  produccion: "Producción",
  sup_sembrada: "Superficie sembrada",
  rendimiento: "Rendimiento",
};

export function seccionRanking(q: Consultas, filtros: () => Filtros, cambiar: (p: Partial<Filtros>) => void) {
  return {
    clave: () => `${filtros().cultivo} ${filtros().campania} ${filtros().metricaRanking}`,
    controles: () =>
      h(
        "div",
        { class: "controles-seccion" },
        selector("Ordenar por", Object.entries(NOMBRES) as [MetricaRanking, string][], filtros().metricaRanking, (m) => {
          analytics.metricaElegida("ranking", m);
          cambiar({ metricaRanking: m as MetricaRanking });
        }),
      ),
    async cargar(cuerpo: HTMLElement) {
      const { cultivo: c, campania, metricaRanking } = filtros();
      if (!campania) return;
      const r = await q.ranking(c, campania, metricaRanking);

      const titulo = h(
        "p",
        { class: "resumen" },
        `${cultivo(c).nombre}, campaña ${campaniaCorta(campania)}: `,
        metricaRanking === "rendimiento"
          ? "rendimiento de cada provincia contra el promedio del país (100 = promedio)."
          : `participación de cada provincia en el total país.`,
      );

      cuerpo.append(titulo, barras(r), notaFuente(r));
    },
  };
}

function valor(r: Ranking, v: number): string {
  if (r.metrica === "produccion") return toneladas(v);
  if (r.metrica === "sup_sembrada") return hectareas(v);
  return kgHa(v);
}

function barras(r: Ranking): HTMLElement {
  const esRendimiento = r.metrica === "rendimiento";
  const medidas = r.ranking.map((p) => (esRendimiento ? (p.vs_promedio_pais_pct ?? 0) : (p.share_pct ?? 0)));
  const maximo = Math.max(...medidas, esRendimiento ? 100 : 1);

  const filas = r.ranking.map((p, i) => {
    const medida = medidas[i]!;
    const ancho = `${Math.max((medida / maximo) * 100, 0.5).toFixed(2)}%`;
    return h(
      "li",
      { class: "barra" },
      h("span", { class: "barra-nombre" }, `${p.posicion}. ${p.provincia}`),
      h(
        "span",
        { class: "barra-pista" },
        h("span", { class: "barra-relleno", style: `width:${ancho}` }),
        esRendimiento ? h("span", { class: "barra-referencia", style: `left:${((100 / maximo) * 100).toFixed(2)}%` }) : null,
      ),
      h(
        "span",
        { class: "barra-valor" },
        esRendimiento ? `${Math.round(medida)}` : participacion(medida),
        h("small", {}, ` · ${valor(r, p.valor)}`),
      ),
    );
  });

  return h("ol", { class: "barras", "aria-label": `Ranking por ${NOMBRES[r.metrica].toLowerCase()}` }, filas);
}
