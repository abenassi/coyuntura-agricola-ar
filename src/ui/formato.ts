/** Números en castellano rioplatense: punto de miles, coma decimal. "s/d" cuando no hay dato. */

const entero = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const unDecimal = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const SIN_DATO = "s/d";

export function numero(n: number | null | undefined): string {
  return n == null ? SIN_DATO : entero.format(n);
}

export const toneladas = (n: number | null | undefined) => (n == null ? SIN_DATO : `${numero(n)} t`);
export const hectareas = (n: number | null | undefined) => (n == null ? SIN_DATO : `${numero(n)} ha`);
export const kgHa = (n: number | null | undefined) => (n == null ? SIN_DATO : `${numero(n)} kg/ha`);

/** Versión corta para pantallas chicas: "51,1 M t" en vez de "51.107.839 t". */
export function compacto(n: number | null | undefined, unidad: string): string {
  if (n == null) return SIN_DATO;
  if (Math.abs(n) >= 1_000_000) return `${unDecimal.format(n / 1_000_000)} M ${unidad}`;
  if (Math.abs(n) >= 10_000) return `${entero.format(n / 1_000)} mil ${unidad}`;
  return `${entero.format(n)} ${unidad}`;
}

/** Variación con signo explícito: "+6,0 %", "−10,1 %". */
export function pct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return SIN_DATO;
  const signo = n > 0.05 ? "+" : n < -0.05 ? "−" : "";
  return `${signo}${unDecimal.format(Math.abs(n))} %`;
}

/** Porcentaje sin signo, para participaciones: "34,2 %". */
export function participacion(n: number | null | undefined): string {
  if (n == null) return SIN_DATO;
  return n > 0 && n < 0.05 ? "<0,1 %" : `${unDecimal.format(n)} %`;
}

/** "2024/2025" → "2024/25", como se dice en el sector. */
export function campaniaCorta(c: string): string {
  return `${c.slice(0, 4)}/${c.slice(7, 9)}`;
}
