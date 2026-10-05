/**
 * Arma `public/geo/departamentos.topo.json`, los polígonos de los departamentos del mapa.
 *
 * Fuente: límites de departamentos del Marco Geoestadístico Nacional del INDEC
 * (https://geonode.indec.gob.ar/layers/geonode_data:geonode:departamentos). Es la capa oficial con
 * topología perfecta: los 529 departamentos encajan sin huecos ni superposiciones, así que la
 * simplificación respeta los bordes compartidos y el mapa no muestra grietas entre vecinos. La
 * misma capa está en la tabla `departamentos` de Argentina Data (ver docs/decisiones/0003).
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

const FUENTE =
  "https://geonode.indec.gob.ar/geoserver/geonode/wfs?service=WFS&version=2.0.0&request=GetFeature" +
  "&typeNames=geonode:departamentos&outputFormat=application/json&srsName=EPSG:4326";
const DESTINO = "public/geo/departamentos.topo.json";

interface FeatureIndec {
  type: "Feature";
  geometry: unknown;
  /** cde: código INDEC de 5 dígitos; nam: nombre; jur: provincia. */
  properties: { cde: string; nam: string; jur: string };
}

const respuesta = await fetch(FUENTE, { signal: AbortSignal.timeout(600_000) });
if (!respuesta.ok) throw new Error(`El INDEC respondió HTTP ${respuesta.status}`);
const original = (await respuesta.json()) as { features: FeatureIndec[] };

const liviano = {
  type: "FeatureCollection",
  features: original.features.map((f) => ({
    type: "Feature",
    geometry: f.geometry,
    properties: { id: f.properties.cde, nombre: f.properties.nam, provincia: f.properties.jur },
  })),
};

// 3% de los vértices alcanza para un mapa del país entero; keep-shapes evita que desaparezcan
// los departamentos chicos (los del conurbano, por ejemplo).
const salida = await mapshaper.applyCommands(
  "-i entrada.json -rename-layers departamentos -simplify 3% keep-shapes -o salida.json format=topojson quantization=100000",
  { "entrada.json": JSON.stringify(liviano) },
);

const topo = salida["salida.json"];
if (!topo) throw new Error("mapshaper no devolvió salida");
await writeFile(DESTINO, topo);
console.log(`${original.features.length} departamentos → ${DESTINO} (${Math.round(topo.length / 1024)} KB)`);
