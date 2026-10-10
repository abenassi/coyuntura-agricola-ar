/** Cuentas que el informe hace sobre las respuestas del MCP. Funciones puras, sin red. */

import { normalizar } from "../geo/cruce";
import { CULTIVOS, type Balance, type CultivoId, type CultivosDisponibles, type FilaBalance, type FilaEstimacion } from "./tipos";

/** Primera campaña del selector: desde ahí el SIIA separa soja de 1ra y de 2da. */
export const PRIMERA_CAMPANIA = "2000/2001";

/** Variación porcentual de `anterior` a `actual`. null si falta un dato o la base es cero. */
export function variacionPct(actual: number | null | undefined, anterior: number | null | undefined): number | null {
  if (actual == null || anterior == null || anterior === 0) return null;
  return (actual / anterior - 1) * 100;
}

export interface FilaComparada {
  cultivo: CultivoId;
  a: FilaBalance | null;
  b: FilaBalance | null;
  varProduccion: number | null;
  varSuperficie: number | null;
  varRendimiento: number | null;
}

/**
 * Cruza dos balances nacionales para los cuatro cultivos del informe.
 *
 * La tool trae la variación de producción contra la campaña inmediatamente anterior; acá se
 * calculan las tres variaciones contra la campaña que haya elegido el visitante, que puede ser
 * cualquiera.
 */
export function compararBalances(a: Balance, b: Balance): FilaComparada[] {
  const buscar = (bal: Balance, siia: string) => bal.cultivos.find((f) => f.cultivo === siia) ?? null;
  return CULTIVOS.map(({ id, siia }) => {
    const fa = buscar(a, siia);
    const fb = buscar(b, siia);
    return {
      cultivo: id,
      a: fa,
      b: fb,
      varProduccion: variacionPct(fa?.produccion_tn, fb?.produccion_tn),
      varSuperficie: variacionPct(fa?.sup_sembrada_ha, fb?.sup_sembrada_ha),
      varRendimiento: variacionPct(fa?.rendimiento_promedio_kg_ha, fb?.rendimiento_promedio_kg_ha),
    };
  });
}

/** "2024/2025" → "2023/2024". */
export function campaniaAnterior(campania: string): string {
  const inicio = Number(campania.slice(0, 4));
  return `${inicio - 1}/${inicio}`;
}

/**
 * Campañas elegibles, de la más reciente a PRIMERA_CAMPANIA.
 *
 * La más reciente es la última que tienen los cuatro cultivos: si MAGyP publicó soja pero
 * todavía no girasol, el informe no arranca en una campaña con un cultivo vacío.
 */
export function campaniasDisponibles(d: CultivosDisponibles): string[] {
  const ultimas = CULTIVOS.map(({ siia }) => d.cultivos.find((c) => c.cultivo === siia)?.ultima_campania)
    .filter((c): c is string => !!c)
    .sort();
  const ultima = ultimas[0];
  if (!ultima) return [];

  const lista: string[] = [];
  for (let c = ultima; c >= PRIMERA_CAMPANIA; c = campaniaAnterior(c)) lista.push(c);
  return lista;
}

/**
 * Cortes para colorear un mapa en `clases` grupos con la misma cantidad de elementos cada uno
 * (quintiles si son 5). Devuelve `clases - 1` cortes; un valor va a la clase i si es mayor o
 * igual al corte i-1 y menor al corte i.
 */
export function quantiles(valores: number[], clases: number): number[] {
  const orden = [...valores].sort((a, b) => a - b);
  if (!orden.length) return [];
  return Array.from({ length: clases - 1 }, (_, i) => orden[Math.floor(((i + 1) * orden.length) / clases)]!);
}

export type VariableDepto = "rendimiento" | "produccion" | "sup_sembrada" | "sup_cosechada";
export type RangoDepto = "10" | "20" | "todo";

export interface PuntoSerie {
  campania: string;
  valor: number;
}

const CAMPO: Record<VariableDepto, keyof FilaEstimacion> = {
  rendimiento: "rendimiento_kg_ha",
  produccion: "produccion_tn",
  sup_sembrada: "sup_sembrada_ha",
  sup_cosechada: "sup_cosechada_ha",
};

/**
 * La historia de un departamento en una variable, de la campaña más vieja a la más nueva.
 *
 * El filtro por departamento del SIIA es una búsqueda parcial ("San Martín" también trae "General
 * San Martín"), así que acá se queda sólo con el nombre exacto.
 */
export function serieDepartamento(filas: FilaEstimacion[], nombre: string, variable: VariableDepto): PuntoSerie[] {
  const buscado = normalizar(nombre);
  return filas
    .filter((f) => normalizar(f.departamento) === buscado)
    .map((f) => ({ campania: f.campania, valor: f[CAMPO[variable]] as number }))
    .sort((a, b) => a.campania.localeCompare(b.campania));
}

/** Las últimas 10 o 20 campañas, o toda la serie. */
export function recortarRango<T>(serie: T[], rango: RangoDepto): T[] {
  return rango === "todo" ? serie : serie.slice(-Number(rango));
}

/** Promedio de las últimas `n` campañas de la serie, o null si está vacía. */
export function promedioUltimas(serie: PuntoSerie[], n: number): number | null {
  const ultimas = serie.slice(-n);
  if (!ultimas.length) return null;
  return ultimas.reduce((s, p) => s + p.valor, 0) / ultimas.length;
}
