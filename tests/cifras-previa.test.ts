import { expect, test } from "vitest";
import { compararBalances, variacionPct } from "../src/datos/calculos";
import { cultivo, type Balance } from "../src/datos/tipos";
import { CIFRAS_PREVIA } from "../src/ui/cifras-previa";
import b2025 from "./fixtures/balance-2024-2025.json";
import b2024 from "./fixtures/balance-2023-2024.json";

// Las cifras de la pantalla de ingreso son texto fijo: tienen que ser las del MCP, no unas de memoria.
test("las cifras de la pantalla de ingreso coinciden con el balance real de la campaña", () => {
  const filas = compararBalances(b2025 as Balance, b2024 as Balance);
  const total = (lado: "a" | "b") => filas.reduce((s, f) => s + f[lado]!.produccion_tn, 0);
  const [todos, sube, baja] = CIFRAS_PREVIA;

  expect(todos!.produccion).toBe(total("a"));
  expect(todos!.variacion).toBeCloseTo(variacionPct(total("a"), total("b"))!, 1);

  const orden = [...filas].sort((x, y) => y.varProduccion! - x.varProduccion!);
  for (const [cifra, fila] of [[sube!, orden[0]!], [baja!, orden.at(-1)!]] as const) {
    expect(cifra.etiqueta.startsWith(cultivo(fila.cultivo).nombre)).toBe(true);
    expect(cifra.produccion).toBe(fila.a!.produccion_tn);
    expect(cifra.variacion).toBeCloseTo(fila.varProduccion!, 1);
  }
});
