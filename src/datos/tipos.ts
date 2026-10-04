/**
 * Los cuatro cultivos del informe y la forma exacta de lo que devuelve cada tool SIIA del MCP.
 *
 * Los nombres `siia` son los que usa el SIIA: "soja total" y "trigo total" son los agregados
 * (soja 1ra + 2da, trigo pan + candeal). El informe usa siempre el agregado y nunca suma
 * agregados con desagregados.
 */

export const CULTIVOS = [
  { id: "soja", siia: "soja total", nombre: "Soja" },
  { id: "maiz", siia: "maíz", nombre: "Maíz" },
  { id: "trigo", siia: "trigo total", nombre: "Trigo" },
  { id: "girasol", siia: "girasol", nombre: "Girasol" },
] as const;

export type CultivoId = (typeof CULTIVOS)[number]["id"];

export function cultivo(id: CultivoId) {
  return CULTIVOS.find((c) => c.id === id)!;
}

/** Campos comunes a todas las respuestas SIIA. */
interface ConFuente {
  fuente: string;
  fuente_url: string;
  freshness?: string;
  advertencia?: string;
  warnings?: string[];
  nota?: string;
}

/** `siia_cultivos_disponibles` */
export interface CultivosDisponibles extends Partial<ConFuente> {
  cultivos: {
    cultivo: string;
    campanias: number;
    primera_campania: string;
    ultima_campania: string;
    provincias: number;
  }[];
}

/** Una fila de `siia_balance_campania`. */
export interface FilaBalance {
  cultivo: string;
  sup_sembrada_ha: number;
  sup_cosechada_ha: number;
  produccion_tn: number;
  rendimiento_promedio_kg_ha: number;
  variacion_produccion_vs_anterior_pct: number | null;
}

/** `siia_balance_campania` */
export interface Balance extends ConFuente {
  campania: string;
  campania_anterior?: string;
  cultivos: FilaBalance[];
}

export type MetricaRanking = "produccion" | "sup_sembrada" | "rendimiento";

/** `siia_ranking_provincias`. Trae `share_pct` para producción y superficie, `vs_promedio_pais_pct` para rendimiento. */
export interface Ranking extends ConFuente {
  cultivo: string;
  campania: string;
  metrica: MetricaRanking;
  unidad?: string;
  ranking: {
    posicion: number;
    provincia: string;
    valor: number;
    share_pct?: number;
    vs_promedio_pais_pct?: number;
  }[];
}

/** `siia_evolucion_rendimiento` */
export interface Evolucion extends ConFuente {
  cultivo: string;
  provincia?: string;
  campanias_incluidas: number;
  promedio_rendimiento_kg_ha: number;
  evolucion: {
    campania: string;
    sup_sembrada_ha: number;
    sup_cosechada_ha: number;
    produccion_tn: number;
    rendimiento_kg_ha: number;
    variacion_pct: number | null;
  }[];
}

/** Una fila de `siia_estimaciones_cultivo`: un departamento en una campaña. */
export interface FilaEstimacion {
  campania: string;
  provincia: string;
  departamento: string;
  sup_sembrada_ha: number;
  sup_cosechada_ha: number;
  produccion_tn: number;
  rendimiento_kg_ha: number;
}

/** `siia_estimaciones_cultivo` */
export interface Estimaciones extends ConFuente {
  cultivo: string;
  datos: FilaEstimacion[];
  total: number;
  devueltos: number;
}

/** Un período de `consultar_cuota`. `limite` -1 = sin límite. */
export interface PeriodoCuota {
  usado: number;
  limite: number;
  restante: number;
  reinicio: string;
}

/** `consultar_cuota` (meta-tool, no consume cuota). */
export interface Cuota {
  plan: string;
  diario: PeriodoCuota;
  semanal: PeriodoCuota;
  mensual: PeriodoCuota;
  mensaje?: string;
}
