import { readFileSync } from "node:fs";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import { describe, expect, test } from "vitest";
import { claveDepto, cruzar, indexarGeometria, normalizar, type FeatureDepto } from "../src/geo/cruce";
import type { Estimaciones, FilaEstimacion } from "../src/datos/tipos";
import soja from "./fixtures/estimaciones-soja-2024-2025.json";
import maiz from "./fixtures/estimaciones-maiz-2024-2025.json";
import extra from "./fixtures/departamentos-extra.json";

const topo = JSON.parse(readFileSync("public/geo/departamentos.topo.json", "utf8")) as Topology;
const features = feature(topo, topo.objects.departamentos as GeometryCollection).features as FeatureDepto[];
const indice = indexarGeometria(features);

function fila(provincia: string, departamento: string): FilaEstimacion {
  return { campania: "2024/2025", provincia, departamento, sup_sembrada_ha: 1, sup_cosechada_ha: 1, produccion_tn: 1, rendimiento_kg_ha: 1 };
}

describe("normalizar", () => {
  test("ignora mayúsculas, tildes y puntuación", () => {
    expect(normalizar("  Juan F. Ibarra ")).toBe("juan f ibarra");
    expect(normalizar("O'Higgins")).toBe("o higgins");
    expect(normalizar("Tucumán")).toBe("tucuman");
  });
});

describe("cruce SIIA ↔ IGN", () => {
  test("todos los departamentos con datos de la última campaña encuentran su polígono", () => {
    const filas = [
      ...(soja as Estimaciones).datos,
      ...(maiz as Estimaciones).datos,
      ...extra.departamentos.map(([p, d]) => fila(p!, d!)),
    ];
    const { sinGeometria } = cruzar(filas, indice);
    expect(sinGeometria.map((f) => `${f.provincia} / ${f.departamento}`)).toEqual([]);
  });

  test("los homónimos de provincias distintas caen en polígonos distintos", () => {
    const { cruzadas } = cruzar([fila("Buenos Aires", "25 de Mayo"), fila("Chaco", "25 de Mayo")], indice);
    expect(cruzadas).toHaveLength(2);
    expect(cruzadas[0]!.feature.properties.id).not.toBe(cruzadas[1]!.feature.properties.id);
  });

  test("los alias resuelven los nombres que difieren entre SIIA e IGN", () => {
    expect(claveDepto("Santa Fe", "Villa Constitución")).toBe(claveDepto("Santa Fe", "Constitución"));
    expect(indice.get(claveDepto("Santiago del Estero", "Juan F. Ibarra"))?.properties.nombre).toBe("Juan Felipe Ibarra");
  });

  test("un departamento sin polígono se informa, no se pierde", () => {
    const { cruzadas, sinGeometria } = cruzar([fila("Córdoba", "Unión"), fila("Córdoba", "Departamento Inventado")], indice);
    expect(cruzadas).toHaveLength(1);
    expect(sinGeometria.map((f) => f.departamento)).toEqual(["Departamento Inventado"]);
  });
});
