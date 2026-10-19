/**
 * Las cifras fijas de la pantalla de ingreso: la campaña de las vistas previas (`public/previa/`),
 * sin consultar al MCP (quien todavía no entró no tiene cuota). Salen de las respuestas reales de
 * `siia_balance_campania` que están en tests/fixtures; tests/cifras-previa.test.ts verifica que
 * coincidan. Si se regeneran las vistas previas con otra campaña, se actualizan las dos cosas.
 */

export const CAMPANIA_PREVIA = "2024/25";
export const CAMPANIA_PREVIA_VS = "2023/24";

export interface CifraPrevia {
  etiqueta: string;
  /** Producción en toneladas. */
  produccion: number;
  /** Variación contra la campaña anterior, en %. */
  variacion: number;
}

export const CIFRAS_PREVIA: readonly CifraPrevia[] = [
  { etiqueta: "Los cuatro cultivos", produccion: 126_901_525, variacion: 1.2 },
  { etiqueta: "Girasol, el que más creció", produccion: 5_592_453, variacion: 43.6 },
  { etiqueta: "Maíz, el que más cayó", produccion: 51_690_953, variacion: -10.1 },
];
