/**
 * Una función por tool del MCP. Es la única parte del sitio que sabe cómo se llaman las tools
 * y qué argumentos llevan: si querés construir otra cosa con Argentina Data, empezá por acá.
 */

import type { ClienteMcp } from "../mcp/cliente";
import {
  cultivo,
  type Balance,
  type CultivoId,
  type CultivosDisponibles,
  type Cuota,
  type Estimaciones,
  type Evolucion,
  type MetricaRanking,
  type Ranking,
} from "./tipos";

/** Campañas que muestra la evolución del rendimiento. */
export const CAMPANIAS_EVOLUCION = 10;

/** Tope de filas de siia_estimaciones_cultivo. Hoy el cultivo con más departamentos (maíz) tiene ~305. */
export const LIMITE_ESTIMACIONES = 500;

export function consultas(cliente: Pick<ClienteMcp, "llamar">) {
  return {
    /** Qué cultivos y campañas hay. Alimenta el selector de campaña. */
    cultivosDisponibles: () => cliente.llamar<CultivosDisponibles>("siia_cultivos_disponibles", {}),

    /** Producción, superficie y rendimiento nacional de todos los cultivos en una campaña. */
    balance: (campania: string) => cliente.llamar<Balance>("siia_balance_campania", { campania }),

    /** Las 24 provincias ordenadas por una métrica, con su participación en el total país. */
    ranking: (c: CultivoId, campania: string, metrica: MetricaRanking) =>
      cliente.llamar<Ranking>("siia_ranking_provincias", {
        cultivo: cultivo(c).siia,
        campania,
        metrica,
        top_n: 24,
      }),

    /** Rendimiento de las últimas campañas, país (provincia null) o una provincia. */
    evolucion: (c: CultivoId, provincia: string | null) =>
      cliente.llamar<Evolucion>("siia_evolucion_rendimiento", {
        cultivo: cultivo(c).siia,
        ...(provincia ? { provincia } : {}),
        campanias: CAMPANIAS_EVOLUCION,
      }),

    /** Todos los departamentos del país para un cultivo y una campaña: alimenta el mapa. */
    estimaciones: (c: CultivoId, campania: string) =>
      cliente.llamar<Estimaciones>("siia_estimaciones_cultivo", {
        cultivo: cultivo(c).siia,
        campania,
        limit: LIMITE_ESTIMACIONES,
      }),

    /**
     * Toda la historia de un departamento para un cultivo (desde 1969 cuando hay datos). El nombre
     * tiene que ser el del SIIA (ver geo/departamentos.ts): el filtro distingue tildes y es parcial.
     */
    historiaDepartamento: (c: CultivoId, provincia: string, departamento: string) =>
      cliente.llamar<Estimaciones>("siia_estimaciones_cultivo", {
        cultivo: cultivo(c).siia,
        provincia,
        departamento,
        // El máximo de la tool: si el nombre coincide en parte con otro departamento, vienen los dos.
        limit: 500,
      }),

    /** Rendimiento de una provincia en las últimas 30 campañas (el máximo de la tool). */
    evolucionProvincia30: (c: CultivoId, provincia: string) =>
      cliente.llamar<Evolucion>("siia_evolucion_rendimiento", {
        cultivo: cultivo(c).siia,
        provincia,
        campanias: 30,
      }),

    /** Consultas que le quedan al visitante. No consume cuota. */
    cuota: () => cliente.llamar<Cuota>("consultar_cuota", {}),
  };
}

export type Consultas = ReturnType<typeof consultas>;
