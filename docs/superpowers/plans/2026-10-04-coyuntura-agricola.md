# Coyuntura agrícola: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sitio estático público que arma un informe de coyuntura agrícola (soja, maíz, trigo, girasol) consultando en vivo las tools `siia_*` de Argentina Data MCP con la cuenta de cada visitante.

**Architecture:** Vite + TypeScript sin framework en GitHub Pages. El visitante entra por OAuth 2.1 + PKCE contra el MCP (cliente público registrado una vez); cada sección llama a `POST /mcp` `tools/call` con su Bearer. Métricas a `POST /api/eventos` del MCP. Sin backend propio.

**Tech Stack:** Vite 8, TypeScript, Chart.js 4, Leaflet 1.9 + topojson-client, vitest, Playwright (smoke), mapshaper (solo en el script de geometría).

**Spec:** `docs/superpowers/specs/2026-10-04-coyuntura-agricola-design.md`

## Global Constraints

- Ningún secreto en el repo ni en el bundle. El `client_id` de OAuth es público y vive en `src/config.ts`.
- Token en `sessionStorage`, nunca en `localStorage` ni cookies.
- CSP: `default-src 'self'; script-src 'self'; connect-src 'self' https://argentinadata.mymcps.dev; img-src 'self' data:; style-src 'self' 'unsafe-inline'`. Ninguna dependencia por CDN.
- Cultivos del SIIA: `soja total`, `maíz`, `trigo total`, `girasol`. Nunca sumar agregados con desagregados.
- Timeout 30 s por llamada; hasta 2 reintentos solo ante fallas de red (sin respuesta HTTP). Nunca reintentar 4xx ni `quota_exceeded`.
- La misma consulta (tool + args) no se repite dentro de una visita (memo en memoria, no persistido).
- Las métricas solo se emiten desde el hostname `agro.mymcps.dev`; el sitio se llama `coyuntura-agricola`.
- Links a Argentina Data con `?ref=coyuntura-agricola`.
- Textos de la UI en español rioplatense, sin guiones largos.
- Commits sin trailer `Co-Authored-By`.

## Review Focus

1. **Cuota agotada a mitad de una sesión**: el MCP responde HTTP 200 con `result.isError: true` y `structuredContent.error: "quota_exceeded"`. Se espera un aviso de cuota en la sección, no "error del servidor". Test en Task 2.
2. **Volver del login con `state` que no coincide, o abrir la URL de callback dos veces**: se espera que no se use el code, que se limpie la URL y que se muestre la pantalla de ingreso. Test en Task 3.
3. **Departamento del SIIA sin polígono** (nombre distinto en el IGN, o una campaña vieja con departamentos que ya no existen): se espera que el mapa lo cuente y lo avise ("N departamentos sin geometría"), no que desaparezca en silencio. Test en Task 5.
4. **Campaña B sin datos para un cultivo** (por ejemplo, girasol en una campaña donde no figura): se espera "sin dato" en la celda y variación vacía, no `NaN%` ni `Infinity%`. Test en Task 4.
5. **URL compartida con parámetros inválidos** (`?cultivo=papa&campania=xx`): se espera que caiga a los defaults, no que pida una tool con argumentos basura. Test en Task 6.

---

### Task 1: Esqueleto del proyecto

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `src/estilos.css`, `.gitignore`, `LICENSE`

- [ ] Copiar las versiones de dependencias de `calculadora-inflacion-ar/package.json` (vite, typescript, vitest, tsx, @types/node) y agregar `chart.js`, `leaflet`, `topojson-client`, `@types/leaflet`, `@types/topojson-client`; devDependency `mapshaper`, `@playwright/test`.
- [ ] Scripts: `dev`, `build` (`tsc --noEmit && vite build`), `test` (`vitest run`), `verificar` (`tsc --noEmit && vitest run && vite build`), `registrar-cliente` (`tsx scripts/registrar-cliente.ts`), `geometria` (`tsx scripts/preparar-geometria.ts`), `smoke` (`playwright test`).
- [ ] `vite.config.ts` con `base: "./"` (mismo artefacto en raíz o subpath) y vitest `environment: "node"`.
- [ ] `index.html` con `<meta http-equiv="Content-Security-Policy">` exacta de Global Constraints, el contenedor `#app` y `<script type="module" src="/src/main.ts">`.
- [ ] `npm install && npm run verificar` pasa con un `main.ts` vacío.
- [ ] Commit `Esqueleto: Vite + TS, CSP y scripts`.

### Task 2: Cliente MCP

**Files:**
- Create: `src/config.ts`, `src/mcp/cliente.ts`
- Test: `tests/cliente.test.ts`

**Interfaces:**
- Produces:
  - `class McpError extends Error`, `class McpAuthError extends McpError` (401), `class McpCuotaError extends McpError { resets?: { daily?: string } }`
  - `desenmarcarSse(cuerpo: string): string`
  - `crearCliente(opts: { endpoint: string; token: () => string | null; fetch?: typeof fetch; esperasMs?: number[] }): { llamar<T>(tool: string, args: Record<string, unknown>): Promise<T> }` con memo por `tool + JSON.stringify(args ordenados)`; una promesa fallida se borra del memo.
  - `config.ts`: `MCP_BASE = "https://argentinadata.mymcps.dev"`, `MCP_ENDPOINT = MCP_BASE + "/mcp"`, `CLIENT_ID`, `SITIO_ANALYTICS = "coyuntura-agricola"`, `HOST_PRODUCCION = "agro.mymcps.dev"`.

- [ ] Tests (fetch falso):
  - `desenmarcarSse` con `event: message\ndata: {...}`, con JSON pelado y con basura (tira).
  - Respuesta normal: devuelve `JSON.parse(result.content[0].text)`.
  - HTTP 401 tira `McpAuthError` sin reintentar (fetch llamado 1 vez).
  - HTTP 200 con `result.isError: true` y `structuredContent.error: "quota_exceeded"` tira `McpCuotaError` con `resets.daily`.
  - `result.isError: true` sin `quota_exceeded` tira `McpError` con el texto.
  - Falla de red dos veces y luego OK: devuelve el dato, fetch llamado 3 veces (con `esperasMs: [0, 0]`).
  - Dos llamadas iguales con args en distinto orden: fetch llamado 1 vez. Después de un error, la misma llamada vuelve a pegar.
  - Manda `Authorization: Bearer <token>`, `Accept: application/json, text/event-stream`.
- [ ] Implementar siguiendo `calculadora-inflacion-ar/scripts/mcp-client.ts` (mismo desenmarcado SSE, doble serialización) con `AbortSignal.timeout(30_000)`.
- [ ] `npm test` pasa. Commit `Cliente MCP con memo, reintentos y errores tipados`.

### Task 3: OAuth con PKCE

**Files:**
- Create: `src/mcp/oauth.ts`
- Test: `tests/oauth.test.ts`

**Interfaces:**
- Consumes: `config.ts`.
- Produces:
  - `codeChallenge(verifier: string): Promise<string>` (S256, base64url sin padding).
  - `iniciarLogin(redirectUri: string): Promise<string>`: genera `verifier` (43+ chars) y `state`, los guarda en `sessionStorage` y devuelve la URL de `/authorize?response_type=code&client_id&redirect_uri&code_challenge&code_challenge_method=S256&state`.
  - `completarLogin(url: URL, redirectUri: string, fetchFn?): Promise<"ok" | "sin_code" | "state_invalido" | "error">`: si hay `code` y `state` coincide, POST a `/token` (form-urlencoded: `grant_type=authorization_code`, `code`, `code_verifier`, `redirect_uri`, `client_id`), guarda `access_token`; siempre borra verifier y state y limpia `code`/`state` de la URL con `history.replaceState`.
  - `token(): string | null`, `cerrarSesion(): void`.
- [ ] Tests (sessionStorage y history falsos):
  - Vector del RFC 7636: verifier `dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk` da challenge `E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuxgnZe0hdM`.
  - `iniciarLogin` arma la URL con todos los parámetros y guarda verifier/state.
  - `completarLogin` con state distinto devuelve `state_invalido`, no llama a fetch y limpia la URL.
  - Segunda llamada con la misma URL (verifier ya borrado) devuelve `state_invalido`.
  - `/token` 400 devuelve `error`; 200 guarda el token.
- [ ] Implementar con `crypto.subtle.digest` y `crypto.getRandomValues`.
- [ ] Commit `OAuth 2.1 con PKCE contra el MCP`.

### Task 4: Consultas tipadas y cálculos

**Files:**
- Create: `src/datos/tipos.ts`, `src/datos/consultas.ts`, `src/datos/calculos.ts`
- Test: `tests/calculos.test.ts`, `tests/fixtures/balance-2024-2025.json`, `tests/fixtures/balance-2023-2024.json`

**Interfaces:**
- Produces:
  - `CULTIVOS = [{ id: "soja", siia: "soja total", nombre: "Soja" }, { id: "maiz", siia: "maíz", nombre: "Maíz" }, { id: "trigo", siia: "trigo total", nombre: "Trigo" }, { id: "girasol", siia: "girasol", nombre: "Girasol" }] as const`; `type CultivoId`.
  - Tipos de respuesta: `Balance`, `FilaBalance`, `Ranking`, `Evolucion`, `Estimaciones`, `FilaEstimacion`, `CultivosDisponibles`, `Cuota` (formas exactas de las respuestas del MCP, ver spec).
  - `consultas(cliente)`: `{ cultivosDisponibles(), balance(campania), ranking(cultivo, campania, metrica), evolucion(cultivo, provincia?), estimaciones(cultivo, campania), cuota() }`; `ranking` pide `top_n: 24`, `evolucion` pide `campanias: 10`, `estimaciones` pide `limit: 500`.
  - `variacionPct(actual: number | null, anterior: number | null): number | null` (null si alguno falta o anterior es 0).
  - `compararBalances(a: Balance, b: Balance): FilaComparada[]` con `{ cultivo: CultivoId, a: FilaBalance | null, b: FilaBalance | null, varProduccion, varSuperficie, varRendimiento }`, solo los 4 cultivos, en el orden de `CULTIVOS`.
  - `campaniasDisponibles(d: CultivosDisponibles): string[]`: de la `ultima_campania` mínima de los 4 cultivos hacia atrás hasta `2000/2001`, descendente.
  - `campaniaAnterior(c: string): string` (`"2024/2025"` → `"2023/2024"`).
- [ ] Fixtures: los balances reales de 2024/2025 y 2023/2024 (capturados del MCP).
- [ ] Tests: variaciones con los números reales (soja producción 51.107.839 vs. el valor 2023/24), filtrado a 4 cultivos sin `soja 1ra`, cultivo ausente en B da `varX: null`, `variacionPct(5, 0)` es null, `campaniasDisponibles` empieza en `2024/2025`.
- [ ] Commit `Consultas tipadas a las tools SIIA y cálculos del balance`.

### Task 5: Geometría y cruce de departamentos

**Files:**
- Create: `scripts/preparar-geometria.ts`, `public/geo/departamentos.topo.json`, `src/geo/cruce.ts`, `src/geo/alias.json`
- Test: `tests/cruce.test.ts`, `tests/fixtures/estimaciones-soja-2024-2025.json`, `tests/fixtures/estimaciones-maiz-2024-2025.json`, `tests/fixtures/departamentos-extra.json`

**Interfaces:**
- Produces:
  - `normalizar(s: string): string` (minúsculas, sin tildes, sin puntuación, espacios simples).
  - `claveDepto(provincia: string, departamento: string): string` aplicando `alias.json` (`{"santa fe|villa constitucion": "santa fe|constitucion", "santiago del estero|juan f ibarra": "santiago del estero|juan felipe ibarra"}`).
  - `indexarGeometria(features): Map<string, Feature>` por `claveDepto(provincia.nombre, nombre)`.
  - `cruzar(filas: FilaEstimacion[], indice): { cruzadas: { fila, feature }[]; sinGeometria: FilaEstimacion[] }`.
- [ ] Script: baja `https://infra.datos.gob.ar/georef/departamentos.geojson`, deja solo `id`, `nombre`, `provincia` (nombre), simplifica con mapshaper (`-simplify 10% keep-shapes`) y escribe TopoJSON (`quantization=1e5`). Documentar fuente y fecha en el encabezado.
- [ ] Tests: cobertura total (todo par provincia/departamento de los fixtures, más los extras de trigo y girasol, encuentra polígono); homónimos ("25 de Mayo" de Buenos Aires y de Chaco caen en features distintas); un departamento inventado cae en `sinGeometria`.
- [ ] Commit `Geometría IGN de departamentos y cruce con el SIIA`.

### Task 6: Estado en la URL

**Files:**
- Create: `src/ui/filtros.ts`
- Test: `tests/filtros.test.ts`

**Interfaces:**
- Produces: `type Filtros = { cultivo: CultivoId; campania: string | null; vs: string | null; provincia: string | null; metricaRanking: "produccion" | "sup_sembrada" | "rendimiento"; metricaMapa: "produccion" | "rendimiento" }`; `leerFiltros(search: string, campanias: string[]): Filtros`; `escribirFiltros(f: Filtros): string`; `PROVINCIAS` (las 23 provincias con agricultura, nombres como el SIIA).
- [ ] Tests: defaults (soja, campaña = primera disponible, vs = anterior), valores inválidos caen al default, ida y vuelta `leer(escribir(f)) == f`, provincia que no está en `PROVINCIAS` se descarta.
- [ ] Commit `Filtros del informe en la URL`.

### Task 7: Interfaz: ingreso, cuota, balance y ranking

**Files:**
- Create: `src/ui/login.ts`, `src/ui/cuota.ts`, `src/ui/formato.ts`, `src/ui/secciones/balance.ts`, `src/ui/secciones/ranking.ts`, `src/ui/seccion.ts`
- Modify: `src/main.ts`, `src/estilos.css`

**Interfaces:**
- `formato.ts`: `toneladas(n)`, `hectareas(n)`, `kgHa(n)`, `pct(n | null)` con `Intl.NumberFormat("es-AR")`; `pct(null)` = "s/d".
- `seccion.ts`: `montarSeccion(el: HTMLDetailsElement, cargar: () => Promise<void>)`: carga al abrirse (`toggle`), muestra "Cargando…", traduce errores (`McpCuotaError` → aviso de cuota con link a planes, `McpAuthError` → cerrar sesión y volver al ingreso, otros → mensaje con la tool) y emite `seccion_abierta`/`error_mcp`/`cuota_agotada`.
- Pantalla sin sesión: qué es el informe, qué datos usa, botón "Ingresar con Argentina Data" (explica que es gratis y que usa su cuota de 20 consultas diarias), link al repo.
- Con sesión: cabecera con selectores (cultivo, campaña, comparar con), cuota restante y "Cerrar sesión"; secciones `<details>`: Balance (abierta), Ranking, Evolución, Mapa.
- Balance: tabla de 4 cultivos × (producción, superficie sembrada, rendimiento) A/B/var %, con la nota de fuente y `freshness`.
- Ranking: barras horizontales Chart.js con `share_pct` (producción y superficie) o `vs_promedio_pais_pct` (rendimiento) y selector de métrica.
- [ ] Verificación: `npm run dev`, Playwright contra localhost para la pantalla sin sesión; flujo logueado con una cuenta real (ver Task 10).
- [ ] Commit `Ingreso, cuota, balance y ranking`.

### Task 8: Interfaz: evolución y mapa

**Files:**
- Create: `src/ui/secciones/evolucion.ts`, `src/ui/secciones/mapa.ts`
- Modify: `src/main.ts`, `src/estilos.css`

- Evolución: líneas Chart.js del rendimiento de 10 campañas, línea punteada con el promedio, la campaña elegida resaltada si está en la ventana; selector de provincia (país por default). Texto: "2024/25: X kg/ha, N% sobre/bajo el promedio de 10 campañas".
- Mapa: Leaflet sin capa base, polígonos del TopoJSON (carga diferida al abrir la sección), coropleta de 5 clases por quintiles, leyenda, clic en un departamento muestra producción, superficie y rendimiento y emite `mapa_departamento_click`. Si `total > devueltos` o hay `sinGeometria`, se muestra el aviso.
- [ ] Commit `Evolución del rendimiento y mapa por departamento`.

### Task 9: Métricas de uso

**Files:**
- Create: `src/analytics.ts`
- Test: `tests/analytics.test.ts`
- Modify (repo `argentina-data-mcp`, rama `staging`): `src/analytics/eventos-web.ts`, `src/analytics/eventos-web.test.ts`

- [ ] `analytics.ts`: copia del patrón de `calculadora-inflacion-ar/src/ui/analytics.ts` (sendBeacon text/plain, sesión en sessionStorage, no-op fuera de `HOST_PRODUCCION`), con funciones por evento: `pageview`, `loginIniciado`, `loginOk`, `loginError(motivo)`, `seccionAbierta(s)`, `cultivoElegido(c)`, `campaniaElegida(a, b)`, `metricaElegida(seccion, m)`, `provinciaElegida(p)`, `mapaDepartamentoClick(p, d)`, `cuotaAgotada(seccion)`, `errorMcp(tool, tipo)`, `clicMcp(destino)`.
- [ ] Test: en `localhost` no llama a sendBeacon ni fetch; en `agro.mymcps.dev` manda `sitio: "coyuntura-agricola"`.
- [ ] MCP: agregar `"coyuntura-agricola"` a `SITIOS_PERMITIDOS` y su set de eventos a `EVENTOS_PERMITIDOS`; test que valida un evento del sitio nuevo y rechaza uno fuera de la lista. Trabajar en un worktree (el checkout principal lo usa el collector), commit en `staging`, push, merge a `main` y push (deploy).
- [ ] Commit `Métricas de uso` (repo nuevo) y `Analytics: sitio coyuntura-agricola` (MCP).

### Task 10: Registro del cliente OAuth, publicación y smoke

**Files:**
- Create: `scripts/registrar-cliente.ts`, `.github/workflows/deploy.yml`, `public/CNAME`, `tests/smoke.spec.ts`, `playwright.config.ts`
- Modify: `src/config.ts`

- [ ] `registrar-cliente.ts`: `POST /register` con `client_name` y `redirect_uris` pasados por `--redirect` (repetible); imprime el `client_id`.
- [ ] Registrar con `https://agro.mymcps.dev/` y `http://localhost:5173/`; guardar el `client_id` en `config.ts`.
- [ ] `deploy.yml`: en push a `main`, `npm ci`, `npm run verificar`, upload-pages-artifact de `dist`, deploy-pages.
- [ ] Crear el repo público `abenassi/coyuntura-agricola-ar`, push, activar Pages (build type workflow), CNAME `agro` → `abenassi.github.io` con proxy en Cloudflare, dominio custom por `gh api -X PUT repos/.../pages -f cname=agro.mymcps.dev` (con nube gris hasta que se emita el certificado, después naranja).
- [ ] Smoke (Playwright, Chromium de `/opt/pw-browsers` o el cache local): la home carga, el botón de ingreso apunta a `/authorize` con `code_challenge_method=S256` y el `client_id` correcto, y la consola no tiene errores de CSP. Seguir el link hasta la página de autorización del MCP y verificar que la muestra (no un error de cliente o redirect).
- [ ] Commit `Publicación en GitHub Pages`.

### Task 11: Documentación

**Files:**
- Create: `README.md`, `docs/decisiones/0001-acceso-oauth-en-vivo.md`, `docs/decisiones/0002-cuota-del-visitante.md`, `docs/decisiones/0003-geometria-de-departamentos.md`, `AGENTS.md`

- [ ] README: qué es, captura, tabla de tools usadas con un request/response de ejemplo, cómo correrlo local, cómo forkearlo en 3 pasos, por qué no hay secretos, métricas (qué se mide y qué no), licencia.
- [ ] Decisiones: copiar el razonamiento del spec (alternativas descartadas y por qué).
- [ ] Commit `README y decisiones de arquitectura`.
