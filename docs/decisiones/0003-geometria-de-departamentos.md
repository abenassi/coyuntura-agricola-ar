# 0003. Límites del INDEC, cruzados por nombre

Fecha: 2026-10-04 (revisada el mismo día). Estado: vigente.

## Contexto

`siia_estimaciones_cultivo` devuelve los datos por departamento con provincia y nombre, sin geometría
ni código INDEC. `geo_normalizar` del MCP resuelve puntos y códigos, pero no devuelve polígonos.

La primera versión usó los polígonos de Georef (geometría del IGN, ya simplificada polígono por
polígono). En el mapa se veían grietas entre departamentos vecinos: cada polígono se había
simplificado por separado y los bordes compartidos ya no coincidían.

## Fuentes comparadas (PostGIS, 2026-10-04)

| | INDEC (Marco Geoestadístico) | IGN (`ign:departamento`) |
|---|---|---|
| Departamentos | 529 | 529, mismos códigos |
| Superposiciones entre vecinos | 0 | 1,5 km² |
| Huecos entre vecinos | 0 | 579: casi todos astillas de precisión (mediana 0,03 m²), algunos reales de hasta 12 km² sobre los ríos |
| Qué límite representa | El que usa cada dirección provincial de estadística; coincide con los radios del Censo 2022 | El legal, de los catastros provinciales; en algunos departamentos difiere más del 25 % del área |

## Decisión

- Los polígonos salen de la capa oficial del INDEC
  (`https://geonode.indec.gob.ar/geoserver/geonode/wfs`, `geonode:departamentos`). Es la única que
  encaja perfecto tal como viene, sin correcciones, y es la geografía estadística en la que el país
  publica sus datos por departamento.
- `npm run geometria` la baja, deja código, nombre y provincia, la simplifica con mapshaper (3 % de
  los vértices) y escribe un TopoJSON de 371 KB en `public/geo/`. Como la capa es topológicamente
  limpia, mapshaper simplifica cada borde compartido una sola vez y los vecinos siguen encajando.
- La misma capa, a resolución completa, quedó en la tabla `departamentos` de Argentina Data
  (`scripts/import_departamentos_indec.py` en ese repo), para usos futuros del MCP.
- El cruce es por `provincia|departamento` normalizados (minúsculas, sin tildes ni puntuación). La
  provincia es parte de la clave porque hay homónimos: "25 de Mayo" existe en cinco provincias. Con
  los nombres del INDEC los 315 departamentos con datos de los cuatro cultivos en 2024/25 cruzan
  todos; `src/geo/alias.json` queda para los casos que aparezcan.
- `tests/cruce.test.ts` exige cruce total sobre respuestas reales del MCP. En el sitio, un departamento
  sin polígono (por ejemplo, de una campaña vieja) no desaparece en silencio: el mapa lo nombra.
