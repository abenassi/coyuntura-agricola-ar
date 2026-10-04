/**
 * Arma `public/geo/departamentos.topo.json`, los polígonos de los departamentos del mapa.
 *
 * Fuente: Servicio de Normalización de Datos Geográficos de Argentina (Georef), con
 * geometrías del Instituto Geográfico Nacional (IGN), publicadas por datos.gob.ar:
 * https://infra.datos.gob.ar/georef/departamentos.geojson
 *
 * Se corre a mano, una vez, y el resultado se commitea: los límites de los departamentos no
 * cambian de un día para el otro. No es un caché de los datos del informe (esos se piden en
 * vivo al MCP en cada visita): es el dibujo del mapa.
 *
 * El SIIA identifica a los departamentos por nombre, sin código INDEC, así que de cada polígono
 * se guarda sólo lo que hace falta para cruzar por nombre (ver src/geo/cruce.ts).
 *
 *   npm run geometria
 */

import { writeFile } from "node:fs/promises";
import mapshaper from "mapshaper";

const FUENTE = "https://infra.datos.gob.ar/georef/departamentos.geojson";
const DESTINO = "public/geo/departamentos.topo.json";

interface FeatureGeoref {
  type: "Feature";
  geometry: unknown;
  properties: { id: string; nombre: string; provincia: { nombre: string } };
}

const respuesta = await fetch(FUENTE, { signal: AbortSignal.timeout(120_000) });
if (!respuesta.ok) throw new Error(`Georef respondió HTTP ${respuesta.status}`);
const original = (await respuesta.json()) as { features: FeatureGeoref[] };

const liviano = {
  type: "FeatureCollection",
  features: original.features.map((f) => ({
    type: "Feature",
    geometry: f.geometry,
    properties: { id: f.properties.id, nombre: f.properties.nombre, provincia: f.properties.provincia.nombre },
  })),
};

// 10% de los vértices alcanza para un mapa del país entero; keep-shapes evita que desaparezcan
// los departamentos chicos (los del conurbano, por ejemplo).
const salida = await mapshaper.applyCommands(
  "-i entrada.json -rename-layers departamentos -simplify 10% keep-shapes -o salida.json format=topojson quantization=100000",
  { "entrada.json": JSON.stringify(liviano) },
);

const topo = salida["salida.json"];
if (!topo) throw new Error("mapshaper no devolvió salida");
await writeFile(DESTINO, topo);
console.log(`${original.features.length} departamentos → ${DESTINO} (${Math.round(topo.length / 1024)} KB)`);
