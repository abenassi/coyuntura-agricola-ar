/**
 * Registra este sitio como cliente OAuth público de Argentina Data MCP y muestra su client_id.
 *
 * Se corre una vez por despliegue, con cada URL desde la que el sitio va a recibir la vuelta del
 * login (la página misma). Para desarrollo local sumá http://localhost:5173/:
 *
 *   npm run registrar-cliente -- --redirect https://usuario.github.io/coyuntura-agricola-ar/ --redirect http://localhost:5173/
 *
 * Después copiá el client_id en src/config.ts. No es un secreto: el MCP sólo vuelve a las URLs
 * registradas acá, así que nadie puede usar tu client_id para mandar visitantes a otro sitio.
 * Usa el registro dinámico de clientes de OAuth (RFC 7591); no hace falta cuenta ni key.
 */

import { MCP_BASE } from "../src/config";

const redirects: string[] = [];
let nombre = "Coyuntura agrícola";
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--redirect" && args[i + 1]) redirects.push(args[++i]!);
  else if (args[i] === "--nombre" && args[i + 1]) nombre = args[++i]!;
}

if (!redirects.length) {
  console.error("Falta al menos un --redirect, por ejemplo: --redirect https://usuario.github.io/coyuntura-agricola-ar/");
  process.exit(1);
}

const respuesta = await fetch(`${MCP_BASE}/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    client_name: nombre,
    redirect_uris: redirects,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code"],
    response_types: ["code"],
  }),
  signal: AbortSignal.timeout(30_000),
});

const cuerpo = (await respuesta.json().catch(() => ({}))) as { client_id?: string; error_description?: string };
if (!respuesta.ok || !cuerpo.client_id) {
  console.error(`El MCP rechazó el registro (HTTP ${respuesta.status}): ${cuerpo.error_description ?? "sin detalle"}`);
  process.exit(1);
}

console.log(`client_id: ${cuerpo.client_id}`);
console.log(`URLs de vuelta: ${redirects.join(", ")}`);
console.log("Copialo en CLIENT_ID de src/config.ts.");
