import { describe, expect, test } from "vitest";
import { escribirFiltros, leerFiltros, PROVINCIAS, type Filtros } from "../src/ui/filtros";

const CAMPANIAS = ["2024/2025", "2023/2024", "2022/2023"];

describe("leerFiltros", () => {
  test("sin parámetros: soja, la última campaña contra la anterior, país", () => {
    expect(leerFiltros("", CAMPANIAS)).toEqual({
      cultivo: "soja",
      campania: "2024/2025",
      vs: "2023/2024",
      provincia: null,
      metricaRanking: "produccion",
      metricaMapa: "rendimiento",
    });
  });

  test("respeta parámetros válidos", () => {
    const f = leerFiltros(
      "?cultivo=girasol&campania=2023/2024&vs=2022/2023&provincia=La%20Pampa&ranking=rendimiento&mapa=produccion",
      CAMPANIAS,
    );
    expect(f).toEqual({
      cultivo: "girasol",
      campania: "2023/2024",
      vs: "2022/2023",
      provincia: "La Pampa",
      metricaRanking: "rendimiento",
      metricaMapa: "produccion",
    });
  });

  test("cualquier valor inválido cae a su default, sin arrastrar basura a las consultas", () => {
    const f = leerFiltros("?cultivo=papa&campania=xx&vs=1900/1901&provincia=Narnia&ranking=bananas&mapa=1", CAMPANIAS);
    expect(f).toEqual(leerFiltros("", CAMPANIAS));
  });

  test("campaña de comparación igual a la elegida: vuelve a la anterior", () => {
    expect(leerFiltros("?campania=2023/2024&vs=2023/2024", CAMPANIAS).vs).toBe("2022/2023");
  });

  test("la campaña más vieja no tiene anterior en la lista: compara con la siguiente", () => {
    expect(leerFiltros("?campania=2022/2023", CAMPANIAS).vs).toBe("2023/2024");
  });

  test("antes de saber qué campañas hay, campania y vs quedan en null", () => {
    const f = leerFiltros("?campania=2024/2025", []);
    expect(f.campania).toBeNull();
    expect(f.vs).toBeNull();
  });
});

describe("escribirFiltros", () => {
  test("ida y vuelta", () => {
    const f: Filtros = {
      cultivo: "maiz",
      campania: "2022/2023",
      vs: "2024/2025",
      provincia: "Córdoba",
      metricaRanking: "sup_sembrada",
      metricaMapa: "produccion",
    };
    expect(leerFiltros(escribirFiltros(f, CAMPANIAS), CAMPANIAS)).toEqual(f);
  });

  test("omite lo que está en su default, para que los links queden cortos", () => {
    expect(escribirFiltros(leerFiltros("", CAMPANIAS), CAMPANIAS)).toBe("");
  });
});

test("PROVINCIAS usa los nombres del SIIA", () => {
  expect(PROVINCIAS).toContain("Córdoba");
  expect(PROVINCIAS).toContain("Santiago del Estero");
  expect(PROVINCIAS).not.toContain("Ciudad Autónoma de Buenos Aires");
});
