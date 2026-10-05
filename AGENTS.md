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
- Antes de commitear: `npm run verificar && npm run e2e`.
