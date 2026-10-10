import { readFileSync } from "node:fs";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import { describe, expect, test } from "vitest";
import { buscarDepartamentos, listaDepartamentos, nombreSiia, type Departamento } from "../src/geo/departamentos";
import { claveDepto, indexarGeometria, type FeatureDepto } from "../src/geo/cruce";
import type { Estimaciones } from "../src/datos/tipos";
import soja from "./fixtures/estimaciones-soja-2024-2025.json";
import maiz from "./fixtures/estimaciones-maiz-2024-2025.json";

const topo = JSON.parse(readFileSync("public/geo/departamentos.topo.json", "utf8")) as Topology;
const features = feature(topo, topo.objects.departamentos as GeometryCollection).features as FeatureDepto[];
const lista = listaDepartamentos(features);

describe("listaDepartamentos", () => {
  test("los 529 departamentos, con código, nombre y provincia", () => {
    expect(lista).toHaveLength(529);
    expect(lista.find((d) => d.codigo === "82042")).toMatchObject({ nombre: "General López", provincia: "Santa Fe" });
  });
});

describe("buscarDepartamentos", () => {
  test("encuentra por el principio del nombre sin importar tildes ni mayúsculas", () => {
    expect(buscarDepartamentos(lista, "general lop").map((d) => d.codigo)).toContain("82042");
    expect(buscarDepartamentos(lista, "PERGAMINO")[0]?.nombre).toBe("Pergamino");
  });

  test("encuentra por cualquier palabra, y también por provincia", () => {
    expect(buscarDepartamentos(lista, "lopez").map((d) => d.codigo)).toContain("82042");
    expect(buscarDepartamentos(lista, "lopez santa").map((d) => d.codigo)).toEqual(["82042"]);
  });

  test("muestra todos los homónimos, cada uno con su provincia", () => {
    const veinticinco = buscarDepartamentos(lista, "25 de mayo", 10);
    expect(new Set(veinticinco.map((d) => d.provincia)).size).toBeGreaterThanOrEqual(5);
  });

  test("los que empiezan con el texto van antes que los que lo contienen", () => {
    const r = buscarDepartamentos(lista, "san martin", 20).map((d) => d.nombre);
    expect(r.indexOf("San Martín")).toBeLessThan(r.indexOf("General San Martín"));
  });

  test("texto vacío o de una letra no sugiere nada", () => {
    expect(buscarDepartamentos(lista, "")).toEqual([]);
    expect(buscarDepartamentos(lista, "a")).toEqual([]);
  });
});

describe("nombreSiia", () => {
  test("para todo departamento con datos de la última campaña, el nombre que se le pide al SIIA es el del SIIA", () => {
    const indice = indexarGeometria(features);
    const porCodigo = new Map<string, Departamento>(lista.map((d) => [d.codigo, d]));
    const errores: string[] = [];
    for (const fila of [...(soja as Estimaciones).datos, ...(maiz as Estimaciones).datos]) {
      const f = indice.get(claveDepto(fila.provincia, fila.departamento));
      const d = f && porCodigo.get(f.properties.id);
      if (!d) continue; // la cobertura geográfica la exige cruce.test.ts
      if (nombreSiia(d) !== fila.departamento) errores.push(`${d.codigo} ${nombreSiia(d)} ≠ ${fila.departamento}`);
    }
    expect(errores).toEqual([]);
  });
});
