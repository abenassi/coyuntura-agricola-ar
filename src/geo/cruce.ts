/**
 * Cruce entre los departamentos del SIIA y los polígonos del IGN.
 *
 * El SIIA identifica cada departamento sólo por provincia y nombre, sin código INDEC. El cruce
 * normaliza los dos nombres (minúsculas, sin tildes ni puntuación) y siempre incluye la
 * provincia, porque hay departamentos homónimos ("25 de Mayo" existe en Buenos Aires, Chaco,
 * Misiones, Río Negro y San Juan). Los pocos nombres que difieren entre una fuente y la otra
 * se resuelven en `alias.json`; un test exige que todos los departamentos con datos crucen.
 */

import type { Feature, Geometry } from "geojson";
import type { FilaEstimacion } from "../datos/tipos";
import alias from "./alias.json";

export type FeatureDepto = Feature<Geometry, { id: string; nombre: string; provincia: string }>;

const ALIAS: Record<string, string> = alias;

export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Clave de cruce `provincia|departamento`, con los alias aplicados. */
export function claveDepto(provincia: string, departamento: string): string {
  const clave = `${normalizar(provincia)}|${normalizar(departamento)}`;
  return ALIAS[clave] ?? clave;
}

export function indexarGeometria(features: FeatureDepto[]): Map<string, FeatureDepto> {
  return new Map(features.map((f) => [claveDepto(f.properties.provincia, f.properties.nombre), f]));
}

export interface ResultadoCruce {
  cruzadas: { fila: FilaEstimacion; feature: FeatureDepto }[];
  /** Filas sin polígono: el mapa las cuenta y lo avisa, en vez de perderlas en silencio. */
  sinGeometria: FilaEstimacion[];
}

export function cruzar(filas: FilaEstimacion[], indice: Map<string, FeatureDepto>): ResultadoCruce {
  const resultado: ResultadoCruce = { cruzadas: [], sinGeometria: [] };
  for (const fila of filas) {
    const feature = indice.get(claveDepto(fila.provincia, fila.departamento));
    if (feature) resultado.cruzadas.push({ fila, feature });
    else resultado.sinGeometria.push(fila);
  }
  return resultado;
}
