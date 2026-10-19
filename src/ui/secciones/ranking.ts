/**
 * Ranking de provincias para el cultivo elegido.
 *
 * Una consulta a `siia_ranking_provincias` por cultivo, campaña y métrica. Para producción y
 * superficie la barra es la participación en el total país; para rendimiento, que no se suma
 * entre provincias, es la comparación contra el promedio nacional (100 = promedio país).
 *
 * Barras en HTML y no en canvas: cada fila es a la vez el gráfico y la tabla, se lee con un
 * lector de pantalla y se puede copiar. Se ven las primeras VISIBLES; el resto (barras de un
 * píxel) se despliega sin consultar nada, porque ya vino en la misma respuesta.
 */

import * as analytics from "../../analytics";
import { concentracion } from "../../datos/calculos";
import type { Consultas } from "../../datos/consultas";
import { cultivo, type MetricaRanking, type Ranking } from "../../datos/tipos";
import { h, selector } from "../dom";
import { campaniaCorta, compacto, hectareas, kgHa, participacion, toneladas } from "../formato";
import type { Filtros } from "../filtros";
import { notaFuente } from "./comun";

const VISIBLES = 5;

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

      cuerpo.append(lasPrimeras(r, cultivo(c).nombre.toLowerCase(), campaniaCorta(campania)) ?? "", titulo, barras(r), notaFuente(r));
    },
  };
}

function valor(r: Ranking, v: number): string {
  if (r.metrica === "produccion") return toneladas(v);
  if (r.metrica === "sup_sembrada") return hectareas(v);
  return kgHa(v);
}

/** "Buenos Aires, Córdoba y Santa Fe produjeron el 81,4 % de la soja 2024/25." */
function lasPrimeras(r: Ranking, nombreCultivo: string, campania: string): HTMLElement | null {
  if (r.metrica === "rendimiento") return null;
  const c = concentracion(r.ranking);
  if (!c) return null;
  const [p1, p2, p3] = c.provincias;
  const verbo = r.metrica === "produccion" ? "produjeron" : "sembraron";
  const que = r.metrica === "produccion" ? `${nombreCultivo === "soja" ? "de la" : "del"} ${nombreCultivo}` : `de la superficie de ${nombreCultivo}`;
  return h(
    "div",
    {},
    h("div", { class: "titular" }, h("span", { class: "titular-cifra" }, participacion(c.share)), h("span", { class: "titular-contexto" }, `en tres provincias`)),
    h("p", { class: "resumen" }, `${p1}, ${p2} y ${p3} ${verbo} el `, h("strong", {}, participacion(c.share)), ` ${que} ${campania}.`),
  );
}

function barras(r: Ranking): HTMLElement {
  const esRendimiento = r.metrica === "rendimiento";
  const medidas = r.ranking.map((p) => (esRendimiento ? (p.vs_promedio_pais_pct ?? 0) : (p.share_pct ?? 0)));
  const maximo = Math.max(...medidas, esRendimiento ? 100 : 1);

  // El número va pegado al final de su barra: la pista deja lugar a la derecha para el de la más larga.
  const filas = r.ranking.map((p, i) => {
    const medida = medidas[i]!;
    const ancho = `${Math.max((medida / maximo) * 100, 0.5).toFixed(2)}%`;
    return h(
      "li",
      { class: "barra", hidden: i >= VISIBLES },
      h("span", { class: "barra-nombre" }, `${p.posicion}. ${p.provincia}`),
      h(
        "span",
        { class: "barra-pista" },
        h("span", { class: "barra-relleno", style: `width:${ancho}` }),
        esRendimiento ? h("span", { class: "barra-referencia", style: `left:${((100 / maximo) * 100).toFixed(2)}%` }) : null,
        h(
          "span",
          { class: "barra-valor", style: `left:${ancho}` },
          h("strong", {}, esRendimiento ? `${Math.round(medida)}` : participacion(medida)),
          h("small", {}, " · ", h("span", { class: "completo" }, valor(r, p.valor)), h("span", { class: "compacto", "aria-hidden": "true" }, valorCorto(r, p.valor))),
        ),
      ),
    );
  });

  const lista = h("ol", { class: "barras", "aria-label": `Ranking por ${NOMBRES[r.metrica].toLowerCase()}` }, filas);
  if (filas.length <= VISIBLES) return lista;

  const boton = h("button", { type: "button", class: "ver-mas", "aria-expanded": "false" }, `Ver las ${filas.length} provincias`);
  boton.addEventListener("click", () => {
    const abierto = boton.getAttribute("aria-expanded") !== "true";
    filas.forEach((f, i) => (f.hidden = !abierto && i >= VISIBLES));
    boton.setAttribute("aria-expanded", String(abierto));
    boton.textContent = abierto ? `Ver sólo las ${VISIBLES} primeras` : `Ver las ${filas.length} provincias`;
  });
  return h("div", {}, lista, boton);
}

function valorCorto(r: Ranking, v: number): string {
  if (r.metrica === "produccion") return compacto(v, "t");
  if (r.metrica === "sup_sembrada") return compacto(v, "ha");
  return kgHa(v);
}
