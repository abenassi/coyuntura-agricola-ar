# 0001. Cada visitante entra con su cuenta y consulta en vivo

Fecha: 2026-10-04. Estado: vigente.

## Contexto

El repo es un ejemplo público de cómo construir sobre Argentina Data MCP. Dos requisitos:

- El MCP tiene que ser el backend real: cada consulta del visitante es una llamada en vivo a una tool.
  Nada de backend propio ni de datos bajados de antemano.
- Tiene que ser fácil de forkear y publicar en GitHub Pages, y no puede exponer la API key de nadie
  (los usuarios del MCP pagan su plan).

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| API key del sitio dentro del JavaScript | Se lee con F12 y se usa desde cualquier lado. |
| GitHub Secret | Sólo existe dentro de un Action. Sirve para bajar datos en el build (es lo que hace la calculadora de inflación), no para consultas en vivo desde el navegador. |
| Key "pública" restringida por `Origin` | El `Origin` se falsifica con una línea de `curl`. La restricción por dominio de las keys de mapas tampoco es una protección: la acompañan topes de cuota. |
| Proxy (Cloudflare Worker, función serverless) | Esconde la key, pero es una URL pública: cualquiera puede gastar la cuota del dueño a través del proxy. Además suma infraestructura a quien forkea. |

El problema de fondo es que cualquier credencial que pueda usar el navegador de un visitante también
la puede usar un atacante. Lo que hay que decidir no es cómo esconder una key, sino quién se autentica
y de qué cuota sale cada consulta.

## Decisión

Se autentica el visitante. El sitio es un cliente OAuth 2.1 público con PKCE (S256), registrado una vez
con el registro dinámico de clientes del MCP (`npm run registrar-cliente`). El `client_id` está en
`src/config.ts` y no es un secreto: el MCP sólo vuelve a las URLs registradas.

El MCP ya soportaba todo esto (lo usan Claude y ChatGPT): clientes públicos, PKCE obligatorio, DCR
abierto, CORS y login con Google que crea la cuenta si no existe. Del lado del MCP hubo un solo cambio:
agregar `agro.mymcps.dev` a los destinos conocidos de la pantalla de consentimiento, para que no le
muestre al visitante la advertencia antiphishing pensada para apps de terceros.

## Consecuencias

- No hay ningún secreto en el repo ni en el navegador que comprometa al dueño del sitio.
- Cada consulta sale de la cuota del visitante (ver 0002).
- Para ver el informe hay que tener cuenta en Argentina Data: es la fricción que se aceptó a cambio.
- El token que devuelve el MCP hoy es la API key del usuario: vale un año y sirve para todas las tools.
  Se mitiga guardándolo en `sessionStorage` (muere con la pestaña), con una política de contenido que
  sólo permite scripts propios y sin ningún `innerHTML` con datos. Queda pendiente en el MCP emitir
  tokens de alcance reducido para apps de terceros (sólo lectura, algunas tools, corta duración).
