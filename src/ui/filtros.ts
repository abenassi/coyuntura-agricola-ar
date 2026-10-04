/**
 * Los filtros del informe viven en la URL (`?cultivo=maiz&campania=2023/2024`), así un estado
 * del informe se puede compartir con un link. Todo lo que llega de la URL se valida contra
 * listas cerradas: un parámetro inválido cae a su default y nunca llega a una consulta al MCP.
 */

import { CULTIVOS, type CultivoId, type MetricaRanking } from "../datos/tipos";

/** Provincias con los nombres que usa el SIIA. CABA no tiene producción agrícola. */
export const PROVINCIAS = [
  "Buenos Aires",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Córdoba",
  "Corrientes",
  "Entre Ríos",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquén",
  "Río Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego",
  "Tucumán",
] as const;

export const METRICAS_RANKING = ["produccion", "sup_sembrada", "rendimiento"] as const;
export const METRICAS_MAPA = ["rendimiento", "produccion"] as const;
export type MetricaMapa = (typeof METRICAS_MAPA)[number];

export interface Filtros {
  cultivo: CultivoId;
  /** Campaña principal. null mientras no se sabe qué campañas hay. */
  campania: string | null;
  /** Campaña contra la que se compara el balance. */
  vs: string | null;
  /** Provincia de la evolución del rendimiento; null = total país. */
  provincia: string | null;
  metricaRanking: MetricaRanking;
  metricaMapa: MetricaMapa;
}

function elegir<T extends string>(valor: string | null, opciones: readonly T[], defecto: T): T {
  return (opciones as readonly string[]).includes(valor ?? "") ? (valor as T) : defecto;
}

/** La campaña de comparación por defecto: la anterior en la lista o, si es la más vieja, la siguiente. */
function vsPorDefecto(campania: string, campanias: string[]): string | null {
  const i = campanias.indexOf(campania);
  return campanias[i + 1] ?? campanias[i - 1] ?? null;
}

/** `campanias` va de la más reciente a la más vieja, como la devuelve `campaniasDisponibles`. */
export function leerFiltros(search: string, campanias: string[]): Filtros {
  const p = new URLSearchParams(search);
  const ids = CULTIVOS.map((c) => c.id);

  const pedida = p.get("campania") ?? "";
  const campania = campanias.includes(pedida) ? pedida : (campanias[0] ?? null);
  const vsPedida = p.get("vs") ?? "";
  let vs: string | null = null;
  if (campania) {
    vs = vsPedida !== campania && campanias.includes(vsPedida) ? vsPedida : vsPorDefecto(campania, campanias);
  }
  const provincia = p.get("provincia") ?? "";

  return {
    cultivo: elegir(p.get("cultivo"), ids, "soja"),
    campania,
    vs,
    provincia: (PROVINCIAS as readonly string[]).includes(provincia) ? provincia : null,
    metricaRanking: elegir(p.get("ranking"), METRICAS_RANKING, "produccion"),
    metricaMapa: elegir(p.get("mapa"), METRICAS_MAPA, "rendimiento"),
  };
}

/** Query string con sólo lo que difiere de los defaults (vacío si todo está en default). */
export function escribirFiltros(f: Filtros, campanias: string[]): string {
  const defecto = leerFiltros("", campanias);
  const p = new URLSearchParams();
  if (f.cultivo !== defecto.cultivo) p.set("cultivo", f.cultivo);
  if (f.campania && f.campania !== defecto.campania) p.set("campania", f.campania);
  if (f.vs && f.campania && f.vs !== vsPorDefecto(f.campania, campanias)) p.set("vs", f.vs);
  if (f.provincia) p.set("provincia", f.provincia);
  if (f.metricaRanking !== defecto.metricaRanking) p.set("ranking", f.metricaRanking);
  if (f.metricaMapa !== defecto.metricaMapa) p.set("mapa", f.metricaMapa);
  const texto = p.toString();
  return texto ? `?${texto}` : "";
}
