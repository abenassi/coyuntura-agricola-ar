/**
 * Balance de campaña: producción, superficie sembrada y rendimiento de los cuatro cultivos en
 * la campaña elegida contra la de comparación.
 *
 * Dos consultas a `siia_balance_campania` (una por campaña). La tool trae todos los cultivos
 * del SIIA; acá se usan sólo los cuatro del informe, y siempre el agregado ("soja total"), nunca
 * soja de 1ra + 2da por separado.
 */

import { compararBalances, variacionPct, type FilaComparada } from "../../datos/calculos";
import type { Consultas } from "../../datos/consultas";
import { cultivo } from "../../datos/tipos";
import { h } from "../dom";
import { campaniaCorta, compacto, hectareas, kgHa, numero, pct, toneladas } from "../formato";
import type { Filtros } from "../filtros";
import { notaFuente } from "./comun";

export function seccionBalance(q: Consultas, filtros: () => Filtros) {
  return {
    clave: () => `${filtros().campania} ${filtros().vs}`,
    async cargar(cuerpo: HTMLElement) {
      const { campania, vs } = filtros();
      if (!campania || !vs) return;
      const [a, b] = await Promise.all([q.balance(campania), q.balance(vs)]);
      const filas = compararBalances(a, b);
      cuerpo.append(resumen(filas, campania, vs), tabla(filas, campania, vs), notaFuente(a));
    },
  };
}

/** Una oración que se pueda leer sin mirar la tabla. */
function resumen(filas: FilaComparada[], campania: string, vs: string): HTMLElement {
  const total = (lado: "a" | "b") =>
    filas.every((f) => f[lado]) ? filas.reduce((s, f) => s + f[lado]!.produccion_tn, 0) : null;
  const ta = total("a");
  const tb = total("b");
  const v = variacionPct(ta, tb);
  if (ta == null || v == null) return h("p");
  return h(
    "p",
    { class: "resumen" },
    `En ${campaniaCorta(campania)} los cuatro cultivos sumaron `,
    h("strong", {}, toneladas(ta)),
    `, ${pct(v)} contra ${campaniaCorta(vs)}.`,
  );
}

/** Número completo en pantallas anchas y compacto en el celular (el CSS elige cuál se ve). */
function cifra(completo: string, corto: string): HTMLElement[] {
  return [h("span", { class: "completo" }, completo), h("span", { class: "compacto", "aria-hidden": "true" }, corto)];
}

function tabla(filas: FilaComparada[], campania: string, vs: string): HTMLElement {
  const encabezado = h(
    "tr",
    {},
    h("th", { scope: "col" }, ""),
    h("th", { scope: "col", class: "num" }, campaniaCorta(campania)),
    h("th", { scope: "col", class: "num" }, campaniaCorta(vs)),
    h("th", { scope: "col", class: "num" }, "Var."),
  );

  const cuerpo = filas.flatMap((f) => {
    const metricas = [
      ["Producción", "Producción", cifra(toneladas(f.a?.produccion_tn), compacto(f.a?.produccion_tn, "t")), cifra(toneladas(f.b?.produccion_tn), compacto(f.b?.produccion_tn, "t")), f.varProduccion],
      ["Superficie sembrada", "Sembrado", cifra(hectareas(f.a?.sup_sembrada_ha), compacto(f.a?.sup_sembrada_ha, "ha")), cifra(hectareas(f.b?.sup_sembrada_ha), compacto(f.b?.sup_sembrada_ha, "ha")), f.varSuperficie],
      ["Rendimiento", "Rinde", cifra(kgHa(f.a?.rendimiento_promedio_kg_ha), numero(f.a?.rendimiento_promedio_kg_ha)), cifra(kgHa(f.b?.rendimiento_promedio_kg_ha), numero(f.b?.rendimiento_promedio_kg_ha)), f.varRendimiento],
    ] as const;
    return [
      h(
        "tr",
        { class: "grupo" },
        h("th", { scope: "rowgroup", colspan: 4 }, cultivo(f.cultivo).nombre, h("span", { class: "compacto unidad-rinde" }, " · rinde en kg/ha")),
      ),
      ...metricas.map(([nombre, corto, va, vb, variacion]) =>
        h(
          "tr",
          {},
          h("th", { scope: "row" }, cifra(nombre, corto)),
          h("td", { class: "num" }, [...va]),
          h("td", { class: "num" }, [...vb]),
          h("td", { class: "num variacion" }, pct(variacion)),
        ),
      ),
    ];
  });

  return h(
    "div",
    { class: "tabla-scroll" },
    h("table", { class: "balance" }, h("thead", {}, encabezado), h("tbody", {}, cuerpo)),
  );
}
