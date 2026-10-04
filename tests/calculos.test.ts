import { describe, expect, test, vi } from "vitest";
import {
  campaniaAnterior,
  campaniasDisponibles,
  quantiles,
  compararBalances,
  variacionPct,
} from "../src/datos/calculos";
import { consultas } from "../src/datos/consultas";
import type { Balance, CultivosDisponibles } from "../src/datos/tipos";
import b2025 from "./fixtures/balance-2024-2025.json";
import b2024 from "./fixtures/balance-2023-2024.json";

// Fixtures: respuestas reales de siia_balance_campania, recortadas a los cultivos que importan
// acá más los desagregados (soja 1ra/2da, trigo candeal) que el informe tiene que ignorar.
const a = b2025 as Balance;
const b = b2024 as Balance;

describe("variacionPct", () => {
  test("calcula la variación porcentual", () => {
    expect(variacionPct(110, 100)).toBeCloseTo(10);
    expect(variacionPct(90, 100)).toBeCloseTo(-10);
  });
  test("sin dato o con base cero devuelve null, nunca NaN ni Infinity", () => {
    expect(variacionPct(null, 100)).toBeNull();
    expect(variacionPct(100, null)).toBeNull();
    expect(variacionPct(5, 0)).toBeNull();
  });
});

describe("compararBalances", () => {
  const filas = compararBalances(a, b);

  test("devuelve los 4 cultivos en orden fijo, sin desagregados", () => {
    expect(filas.map((f) => f.cultivo)).toEqual(["soja", "maiz", "trigo", "girasol"]);
  });

  test("la variación de producción coincide con la que informa el MCP", () => {
    const soja = filas.find((f) => f.cultivo === "soja")!;
    expect(soja.varProduccion).toBeCloseTo(6.0, 1); // 51.107.839 vs 48.213.216
    const girasol = filas.find((f) => f.cultivo === "girasol")!;
    expect(girasol.varProduccion).toBeCloseTo(43.57, 1);
  });

  test("calcula superficie sembrada y rendimiento, que la tool no trae", () => {
    const maiz = filas.find((f) => f.cultivo === "maiz")!;
    expect(maiz.varSuperficie).toBeCloseTo((9234043 / 11103250 - 1) * 100, 6);
    expect(maiz.varRendimiento).toBeCloseTo((6964 / 6581 - 1) * 100, 6);
  });

  test("un cultivo que falta en la campaña de comparación queda sin variación", () => {
    const sinGirasol: Balance = { ...b, cultivos: b.cultivos.filter((c) => c.cultivo !== "girasol") };
    const girasol = compararBalances(a, sinGirasol).find((f) => f.cultivo === "girasol")!;
    expect(girasol.a?.produccion_tn).toBe(5592453);
    expect(girasol.b).toBeNull();
    expect(girasol.varProduccion).toBeNull();
    expect(girasol.varSuperficie).toBeNull();
    expect(girasol.varRendimiento).toBeNull();
  });
});

describe("campañas", () => {
  test("campaniaAnterior", () => {
    expect(campaniaAnterior("2024/2025")).toBe("2023/2024");
    expect(campaniaAnterior("2000/2001")).toBe("1999/2000");
  });

  test("campaniasDisponibles arranca en la última que tienen los 4 cultivos", () => {
    const d = {
      cultivos: [
        { cultivo: "soja total", campanias: 56, primera_campania: "1969/1970", ultima_campania: "2024/2025", provincias: 16 },
        { cultivo: "maíz", campanias: 56, primera_campania: "1969/1970", ultima_campania: "2024/2025", provincias: 21 },
        { cultivo: "trigo total", campanias: 56, primera_campania: "1969/1970", ultima_campania: "2024/2025", provincias: 21 },
        { cultivo: "girasol", campanias: 55, primera_campania: "1969/1970", ultima_campania: "2023/2024", provincias: 16 },
        { cultivo: "té", campanias: 55, primera_campania: "1969/1970", ultima_campania: "2010/2011", provincias: 2 },
      ],
    } as CultivosDisponibles;
    const lista = campaniasDisponibles(d);
    expect(lista[0]).toBe("2023/2024");
    expect(lista.at(-1)).toBe("2000/2001");
    expect(lista).toHaveLength(24);
  });
});

describe("consultas", () => {
  test("pide cada tool con los argumentos del informe", async () => {
    const llamar = vi.fn(async (_tool: string, _args: Record<string, unknown>) => ({}));
    const q = consultas({ llamar: llamar as unknown as <T>(tool: string, args: Record<string, unknown>) => Promise<T> });
    await q.balance("2024/2025");
    await q.ranking("maiz", "2024/2025", "rendimiento");
    await q.evolucion("trigo", "Córdoba");
    await q.evolucion("trigo", null);
    await q.estimaciones("girasol", "2024/2025");
    expect(llamar.mock.calls).toEqual([
      ["siia_balance_campania", { campania: "2024/2025" }],
      ["siia_ranking_provincias", { cultivo: "maíz", campania: "2024/2025", metrica: "rendimiento", top_n: 24 }],
      ["siia_evolucion_rendimiento", { cultivo: "trigo total", provincia: "Córdoba", campanias: 10 }],
      ["siia_evolucion_rendimiento", { cultivo: "trigo total", campanias: 10 }],
      ["siia_estimaciones_cultivo", { cultivo: "girasol", campania: "2024/2025", limit: 500 }],
    ]);
  });
});

describe("quantiles", () => {
  test("parte 10 valores en 5 grupos de 2", () => {
    expect(quantiles([10, 1, 9, 2, 8, 3, 7, 4, 6, 5], 5)).toEqual([3, 5, 7, 9]);
  });
  test("sin valores no hay cortes", () => {
    expect(quantiles([], 5)).toEqual([]);
  });
});
