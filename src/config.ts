/**
 * Todo lo que cambia entre un despliegue y otro está en este archivo.
 *
 * SI FORKEASTE ESTE REPO: corré `npm run registrar-cliente -- --redirect https://<tu-usuario>.github.io/<repo>/`
 * y pegá acá el `client_id` que imprime. No es un secreto: identifica a tu sitio ante el MCP
 * (para que la pantalla de autorización sepa a qué URL volver), no te da acceso a nada.
 * El acceso lo pone cada visitante, que entra con su propia cuenta.
 */

/** Servidor de Argentina Data MCP. */
export const MCP_BASE = "https://argentinadata.mymcps.dev";

/** Endpoint JSON-RPC del MCP: acá van todas las llamadas a tools. */
export const MCP_ENDPOINT = `${MCP_BASE}/mcp`;

/** Cliente OAuth público de este sitio, registrado con `npm run registrar-cliente`. */
export const CLIENT_ID = "";

/** Nombre del sitio en las métricas del MCP. Sólo se emite desde HOST_PRODUCCION. */
export const SITIO_ANALYTICS = "coyuntura-agricola";

/** Único hostname que manda métricas. Un fork o localhost no manda nada. */
export const HOST_PRODUCCION = "agro.mymcps.dev";

/** Agregado a cada link a Argentina Data, para saber cuánta gente llega desde acá. */
export const REF = "coyuntura-agricola";

/** Página de planes, para cuando el visitante agota su cuota. */
export const URL_PLANES = `${MCP_BASE}/?ref=${REF}#planes`;

/** Este repo, para el link "cómo está hecho". */
export const URL_REPO = "https://github.com/abenassi/coyuntura-agricola-ar";
