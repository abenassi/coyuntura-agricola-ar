/** Los polígonos de los departamentos: se bajan una sola vez, recién cuando una sección los necesita. */

import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { FeatureDepto } from "./cruce";

let geometria: Promise<FeatureDepto[]> | null = null;

export function cargarGeometria(): Promise<FeatureDepto[]> {
  geometria ??= fetch(`${import.meta.env.BASE_URL}geo/departamentos.topo.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`No se pudo bajar la geometría (HTTP ${r.status})`);
      return r.json() as Promise<Topology>;
    })
    .then((topo) => feature(topo, topo.objects.departamentos as GeometryCollection).features as FeatureDepto[])
    .catch((e: unknown) => {
      geometria = null;
      throw e;
    });
  return geometria;
}
