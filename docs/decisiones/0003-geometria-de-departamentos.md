# 0003. Polígonos del IGN cruzados por nombre

Fecha: 2026-10-04. Estado: vigente.

## Contexto

`siia_estimaciones_cultivo` devuelve los datos por departamento con provincia y nombre, sin geometría
ni código INDEC. `geo_normalizar` del MCP resuelve puntos y códigos, pero no devuelve polígonos.

## Decisión

- Los polígonos salen de Georef (`https://infra.datos.gob.ar/georef/departamentos.geojson`, geometrías
  del IGN, 529 departamentos). `npm run geometria` los baja, deja sólo id, nombre y provincia, los
  simplifica con mapshaper (10% de los vértices, sin perder departamentos chicos) y escribe un TopoJSON
  de 228 KB en `public/geo/`, que se commitea. Es el dibujo del mapa, no un dato del informe: los límites
  no cambian de una campaña a otra.
- El cruce es por `provincia|departamento` normalizados (minúsculas, sin tildes ni puntuación). La
  provincia es parte de la clave porque hay homónimos: "25 de Mayo" existe en cinco provincias.
- `src/geo/alias.json` resuelve los nombres que difieren. Medido el 2026-10-04 sobre los 315
  departamentos con datos de los cuatro cultivos en 2024/25, fueron dos: "Villa Constitución"
  (IGN: "Constitución") y "Juan F. Ibarra" (IGN: "Juan Felipe Ibarra").
- `tests/cruce.test.ts` exige cruce total sobre respuestas reales del MCP. En el sitio, un departamento
  sin polígono (por ejemplo, de una campaña vieja) no desaparece en silencio: el mapa lo nombra.
