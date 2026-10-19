# AGENTS.md

Ejemplo público de una app sobre Argentina Data MCP. Leé primero el README y `docs/decisiones/`.

- No agregar backend, proxy ni API keys: el acceso es OAuth + PKCE con la cuenta del visitante (0001).
- Cada llamada al MCP cuesta cuota del visitante: nada de llamadas especulativas ni reintentos de
  respuestas del servidor (0002).
- Nada de `innerHTML` con datos: el token vive en sessionStorage. Usá `h()` de `src/ui/dom.ts`.
- La CSP de `index.html` sólo permite scripts propios más Cloudflare Web Analytics (decisión 0001).
  No sumar otros terceros.
- Un evento de analytics nuevo también va en `EVENTOS_PERMITIDOS["coyuntura-agricola"]` del MCP
  (`src/analytics/eventos-web.ts` en argentina-data-mcp), o se descarta en silencio.
- El filtro `departamento` de `siia_estimaciones_cultivo` es LIKE parcial y distingue tildes: mandá
  el nombre exacto del SIIA (`nombreSiia`, `src/geo/nombres-siia.json`), filtrá por igualdad después
  y pedí `limit: 500`, avisando si `devueltos < total`. "San Martín" también trae "General San Martín".
- `Chart.register(...)` es global: un plugin registrado en una sección (p. ej. `Legend`) aparece en
  todos los gráficos. Cada gráfico declara `plugins.legend` explícito.
- Las secciones son pestañas (`role="tablist"`, `?seccion=` en la URL): sólo consulta la que está
  a la vista, y las flechas del teclado recorren sin abrir. Lo que mide su contenedor (Leaflet) no se
  dibuja en una pestaña oculta: ver `cuandoSeaVisible` en `src/ui/secciones/mapa.ts`.
- Antes de commitear: `npm run verificar && npm run e2e`, y un code-reviewer sobre el diff sin
  commitear. En "Tu departamento" encontró tres problemas reales que los tests no veían.
