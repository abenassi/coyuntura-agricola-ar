# Coyuntura agrícola: diseño

Fecha: 2026-10-04. Estado: aprobado en conversación, pendiente de revisión escrita.

## Objetivo

Un repo público (`abenassi/coyuntura-agricola-ar`) que sirva de ejemplo de cómo construir
una app sobre Argentina Data MCP, con un caso útil: un informe de coyuntura agrícola para
productores, asesores y corredores de granos, sobre soja, maíz, trigo y girasol.

Criterios de éxito:

1. El MCP es el backend real: cada consulta del visitante es una llamada en vivo a una tool
   `siia_*`. No hay backend propio, proxy ni datos cacheados entre visitas.
2. No hay ningún secreto en el repo ni en el navegador que exponga la cuenta del dueño del
   sitio. Quien forkea no configura secretos.
3. Alguien que clona el repo entiende la arquitectura en minutos y lo publica en su propio
   GitHub Pages en tres pasos.
4. El sitio mide qué secciones, cultivos y filtros usa la gente.

## Decisiones tomadas y por qué

### Acceso: cada visitante entra con su cuenta (OAuth 2.1 + PKCE)

Un sitio estático no puede guardar un secreto: toda credencial que use el navegador la puede
usar un atacante. Se descartaron:

- **API key en el bundle**: queda visible con F12.
- **GitHub Secret**: solo existe dentro de un Action; serviría para un snapshot, no para
  consultas en vivo.
- **Key pública restringida por Origin**: el `Origin` se falsifica con una línea de `curl`.
- **Proxy (Cloudflare Worker u otro)**: esconde la key, pero es una URL pública que
  cualquiera puede usar para consumir la cuota del dueño, y le agrega infraestructura a
  quien forkea.

La única forma en que nadie expone su cuenta es que **se autentique el visitante** y que cada
consulta salga de **su propia cuota**. El MCP ya soporta lo necesario, sin cambios:

- Metadata RFC 8414 en `/.well-known/oauth-authorization-server`.
- Clientes públicos (`token_endpoint_auth_method: "none"`), PKCE S256 obligatorio.
- Dynamic Client Registration (`/register`) con `redirect_uris` https arbitrarias.
- CORS abierto (`app.use(cors())`).
- Login con Google que crea la cuenta si no existe (`findOrCreateUser`).

El `client_id` se registra **una sola vez** por despliegue con `npm run registrar-cliente`, y
queda en `src/config.ts`. Es público, no es un secreto. Se descartó registrar un cliente por
visitante porque llena `oauth_clients` de filas descartables.

### Cuota: diseñar para el tier gratis (20 consultas por día)

Sin cambios en el MCP. El sitio:

- Carga cada sección recién cuando se abre.
- No repite la misma consulta (mismos tool + argumentos) dentro de la misma visita: es una
  memoria en el navegador que no se persiste.
- Muestra la cuota restante con `consultar_cuota` (meta-tool, no consume cuota).
- Si la cuota se agota (respuesta 429 o error de cuota), muestra un aviso con lo que queda
  y un link a los planes, en vez de un error genérico.

### Publicación

GitHub Pages en `agro.mymcps.dev` (CNAME en Cloudflare con proxy, como
`inflacion.mymcps.dev`, lo que además da geo en las métricas).

### Campañas

El SIIA llega hasta la campaña cerrada más reciente (hoy 2024/2025). No incluye la campaña
en curso ni la estimación semanal (PAS). El sitio lo dice explícitamente. Tiene un **selector
de campaña** (default: la última contra la anterior) alimentado por
`siia_cultivos_disponibles`. Cuando MAGyP publique una campaña nueva, el sitio la toma sola.

## Arquitectura

```
Navegador (Vite + TS, Chart.js, Leaflet)
  ├─ "Ingresar con Argentina Data" ─> /authorize (Google) ─> redirect con code
  ├─ POST /token (code + code_verifier) ─> access_token en sessionStorage
  ├─ POST /mcp  tools/call  Authorization: Bearer <token>  ─> siia_*  (en vivo)
  └─ POST /api/eventos  (sitio "coyuntura-agricola")
```

No hay ningún componente de servidor propio.

### Stack

- Vite + TypeScript sin framework (el mismo que la calculadora de inflación).
- Chart.js para barras y líneas.
- Leaflet para el mapa, **sin mapa base**: solo los polígonos sobre fondo liso, sin pedidos
  a servidores de tiles de terceros.
- vitest para los tests unitarios y Playwright para el smoke test.

## Contenido y costo en consultas

Filtros globales en la URL (`?cultivo=soja&campania=2024/2025&vs=2023/2024&provincia=...`),
para poder compartir un estado del informe.

| Sección | Qué muestra | Tool | Consultas |
|---|---|---|---|
| Campañas disponibles | Opciones del selector | `siia_cultivos_disponibles` | 1 por visita |
| Balance | Los 4 cultivos: producción, superficie y rendimiento en la campaña A y la B, con variación % | `siia_balance_campania` ×2 | 2 por par de campañas |
| Ranking | Provincias líderes por producción, superficie sembrada o rendimiento; share % del total país (o vs. promedio país para rendimiento) | `siia_ranking_provincias` | 1 por cultivo, campaña y métrica |
| Evolución | Rendimiento de las últimas 10 campañas, país o provincia, con su promedio histórico y la campaña elegida marcada | `siia_evolucion_rendimiento` | 1 por cultivo y provincia |
| Mapa | Coropleta por departamento: producción o rendimiento | `siia_estimaciones_cultivo` (sin provincia, `limit` 500) | 1 por cultivo y campaña |
| Cuota | Consultas restantes hoy | `consultar_cuota` | 0 |

Cultivos del SIIA que se usan: `soja total`, `maíz`, `trigo total`, `girasol`.

Primera carga: el selector más el Balance son 3 consultas. Las variaciones de superficie y
rendimiento se calculan en el front comparando los dos balances (la tool solo trae la
variación de producción). El balance trae agregados y desagregados (soja total / 1ra / 2da):
el sitio filtra los 4 cultivos y nunca suma entre agregados.

Hoy hay 305 departamentos con datos de maíz en 2024/2025. Si alguna vez `total` supera 500,
el mapa pide por provincia y lo avisa en vez de cortar en silencio.

## Mapa por departamento

- **Geometría:** departamentos del IGN vía Georef (`datos.gob.ar`), simplificados con
  mapshaper por `scripts/preparar-geometria.ts` y commiteados en
  `public/geo/departamentos.topo.json`. Es geometría estática, no datos del informe.
- **Cruce:** el SIIA trae nombres de departamento sin código INDEC, así que el cruce va por
  `(provincia, departamento)` normalizados (minúsculas, sin tildes, sin "partido de", etc.)
  más `src/geo/alias.json` para las excepciones. Se cruza siempre con la provincia: hay
  departamentos homónimos (por ejemplo "25 de Mayo").
- **Test de cobertura:** sobre un fixture capturado una vez del MCP (los 4 cultivos, última
  campaña), todo departamento con datos tiene que encontrar su polígono. Un departamento sin
  cruzar hace fallar el test.
- `geo_normalizar` no sirve para esto: resuelve puntos y códigos, no devuelve polígonos.

## Estructura del repo

```
coyuntura-agricola-ar/
  index.html
  src/
    config.ts            URL del MCP, client_id, redirect_uri, sitio de analytics
    main.ts
    mcp/
      oauth.ts           PKCE, redirect, intercambio de code, sessionStorage, logout
      cliente.ts         JSON-RPC tools/call, desenmarcado SSE, timeout, reintentos, memo
    datos/
      consultas.ts       una función tipada por tool
      calculos.ts        variaciones %, promedio histórico, normalizaciones
    geo/
      cruce.ts
      alias.json
    ui/
      filtros.ts         estado en la URL
      cuota.ts
      login.ts
      secciones/{balance,ranking,evolucion,mapa}.ts
    analytics.ts
  public/geo/departamentos.topo.json
  scripts/
    registrar-cliente.ts
    preparar-geometria.ts
  tests/                 unitarios + fixtures + smoke de Playwright
  docs/decisiones/
    0001-acceso-oauth-en-vivo.md
    0002-cuota-del-visitante.md
    0003-geometria-de-departamentos.md
  .github/workflows/deploy.yml   test + build + Pages
  README.md
  LICENSE (MIT)
```

## Métricas de uso

Se reutiliza la ingesta propia de la calculadora: `POST /api/eventos` del MCP, sin guardar la
IP, con un visitante = hash con sal que rota cada 30 días, y sin cookies ni banner. Ya
existe un panel en el admin del MCP.

Cambio necesario en `argentina-data-mcp`: agregar `"coyuntura-agricola"` a
`SITIOS_PERMITIDOS` y los nombres de eventos a su allowlist.

Como en la calculadora, el cliente solo emite desde el hostname de producción: un fork o
localhost no manda eventos.

| Evento | Propiedades |
|---|---|
| `pageview` | sección inicial, logueado sí/no |
| `login_iniciado`, `login_ok`, `login_error` | motivo del error |
| `seccion_abierta` | balance / ranking / evolucion / mapa |
| `cultivo_elegido` | cultivo |
| `campania_elegida` | campaña A, campaña B |
| `metrica_elegida` | sección, métrica |
| `provincia_elegida` | provincia |
| `mapa_departamento_click` | provincia, departamento |
| `cuota_agotada` | sección que la pidió |
| `error_mcp` | tool, tipo de error |
| `clic_mcp` | destino (README, panel, planes) |

Los links a Argentina Data llevan `?ref=coyuntura-agricola`.

## Errores

- Timeout de 30 s por llamada. Hasta 2 reintentos solo ante fallas de red, nunca ante una
  respuesta 4xx.
- 401: se borra el token y se vuelve a la pantalla de ingreso.
- 429 o error de cuota: aviso de cuota agotada (ver arriba).
- `sin_datos` o `warnings` de una tool: se muestran tal cual en la sección.
- Cada sección falla por separado: un error en el mapa no tira el balance.

## Seguridad

- El access token es hoy la API key permanente del usuario (365 días, acceso a toda su
  cuenta). Mitigaciones: CSP estricta (`script-src 'self'`, `connect-src` solo al MCP),
  ninguna dependencia por CDN, el token en `sessionStorage` y un botón para cerrar sesión.
- `state` aleatorio en el redirect de OAuth, validado a la vuelta.
- Mejora futura en el MCP (fuera de alcance): tokens de alcance reducido para apps de
  terceros (solo lectura, solo algunas tools, corta duración).

## Tests

- Unitarios (vitest, con fixtures): cálculo de variaciones, desenmarcado SSE, PKCE
  (vector de prueba del RFC 7636), memo de consultas, estado de filtros en la URL, cruce
  geográfico con cobertura total.
- Smoke (Playwright) contra el sitio publicado: la pantalla de ingreso carga, la CSP no
  bloquea nada propio y no hay errores en la consola. El flujo logueado se prueba a mano con
  una cuenta de prueba, porque requiere Google.

## README

Qué es, captura, cómo se usa, la tabla de tools del MCP con un ejemplo de request y
respuesta, y cómo forkearlo:

1. Forkear y activar GitHub Pages.
2. `npm run registrar-cliente -- --redirect https://<usuario>.github.io/<repo>/` y commitear
   el `client_id` que devuelve en `src/config.ts`.
3. Push: el workflow testea, compila y publica.

Una sección corta explica por qué no hace falta ningún secreto (resume la decisión 0001).

## Fuera de alcance

- Exportar a PDF.
- Cultivos que no sean soja, maíz, trigo y girasol.
- Campaña en curso o estimación semanal (PAS): el MCP no la tiene.
- Tokens de alcance reducido en el MCP.
