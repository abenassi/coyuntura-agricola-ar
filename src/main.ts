/**
 * Arranque del sitio.
 *
 * 1. Si la URL es la vuelta del login, canjea el code por el token.
 * 2. Sin token: pantalla de ingreso.
 * 3. Con token: pide las campañas disponibles, arma los filtros y monta las cuatro secciones.
 *    Cada sección consulta al MCP recién cuando se abre.
 */

import "./estilos.css";
import * as analytics from "./analytics";
import { CLIENT_ID, MCP_BASE, MCP_ENDPOINT, REF, URL_REPO } from "./config";
import { campaniasDisponibles } from "./datos/calculos";
import { consultas, type Consultas } from "./datos/consultas";
import { CULTIVOS, type CultivoId } from "./datos/tipos";
import { crearCliente, McpAuthError } from "./mcp/cliente";
import { cerrarSesion, completarLogin, iniciarLogin, token } from "./mcp/oauth";
import { actualizarCuota } from "./ui/cuota";
import { h, selector } from "./ui/dom";
import { campaniaCorta } from "./ui/formato";
import { escribirFiltros, leerFiltros, type Filtros } from "./ui/filtros";
import { pantallaIngreso } from "./ui/login";
import { mensajeDeError, montarSeccion, type Seccion } from "./ui/seccion";
import { guardarVista, recuperarVista } from "./ui/vista";
import { seccionBalance } from "./ui/secciones/balance";
import { seccionEvolucion } from "./ui/secciones/evolucion";
import { seccionMapa } from "./ui/secciones/mapa";
import { seccionRanking } from "./ui/secciones/ranking";

const app = document.getElementById("app")!;

/** La URL de vuelta del login es la página misma, sin query ni hash. */
function redirectUri(): string {
  return `${location.origin}${location.pathname}`;
}

async function ingresar() {
  try {
    analytics.loginIniciado();
    guardarVista(location.search);
    location.assign(await iniciarLogin(redirectUri(), CLIENT_ID));
  } catch (e: unknown) {
    mostrarIngreso(e instanceof Error ? e.message : String(e));
  }
}

function mostrarIngreso(error?: string) {
  app.replaceChildren(pantallaIngreso(() => void ingresar(), error));
}

function salir() {
  analytics.sesionCerrada();
  cerrarSesion();
  mostrarIngreso();
}

async function informe(q: Consultas) {
  app.replaceChildren(h("p", { class: "cargando", role: "status" }, "Consultando qué campañas hay…"));

  let campanias: string[];
  try {
    campanias = campaniasDisponibles(await q.cultivosDisponibles());
  } catch (e: unknown) {
    if (e instanceof McpAuthError) return salir();
    app.replaceChildren(mensajeDeError(e, "inicio", () => void informe(q)));
    return;
  }

  let filtros: Filtros = leerFiltros(location.search, campanias);
  const secciones: Seccion[] = [];

  function cambiar(parcial: Partial<Filtros>) {
    filtros = { ...filtros, ...parcial };
    history.replaceState(null, "", `${location.pathname}${escribirFiltros(filtros, campanias)}`);
    secciones.forEach((s) => s.filtrosCambiaron());
    actualizarCabecera();
  }

  const cuota = h("span", { class: "cuota", "aria-live": "polite" });
  const controles = h("div", { class: "controles" });
  const titulo = h("h1");

  function actualizarCabecera() {
    titulo.textContent = `Coyuntura agrícola · campaña ${campaniaCorta(filtros.campania!)}`;
    const opcionesCampania = campanias.map((c) => [c, campaniaCorta(c)] as const);
    controles.replaceChildren(
      h(
        "div",
        { class: "cultivos", role: "group", "aria-label": "Cultivo" },
        CULTIVOS.map((c) =>
          h(
            "button",
            {
              type: "button",
              "aria-pressed": c.id === filtros.cultivo ? "true" : "false",
              onclick: () => {
                if (c.id === filtros.cultivo) return;
                analytics.cultivoElegido(c.id);
                cambiar({ cultivo: c.id as CultivoId });
              },
            },
            c.nombre,
          ),
        ),
      ),
      selector("Campaña", opcionesCampania, filtros.campania!, (c) => {
        const vs = c === filtros.vs ? null : filtros.vs;
        const nuevo = leerFiltros(`?campania=${encodeURIComponent(c)}${vs ? `&vs=${encodeURIComponent(vs)}` : ""}`, campanias);
        analytics.campaniaElegida(nuevo.campania!, nuevo.vs);
        cambiar({ campania: nuevo.campania, vs: nuevo.vs });
      }),
      selector(
        "Comparada con",
        opcionesCampania.filter(([c]) => c !== filtros.campania),
        filtros.vs!,
        (vs) => {
          analytics.campaniaElegida(filtros.campania!, vs);
          cambiar({ vs });
        },
      ),
    );
  }

  const refrescarCuota = () => void actualizarCuota(cuota, q);
  const cabecera = h(
    "header",
    { class: "cabecera" },
    h(
      "div",
      { class: "barra-superior" },
      titulo,
      h("div", { class: "sesion" }, cuota, h("button", { type: "button", class: "secundario", onclick: salir }, "Cerrar sesión")),
    ),
    controles,
    h(
      "p",
      { class: "nota" },
      "Estimaciones agrícolas del MAGyP. El SIIA publica campañas cerradas: la campaña en curso todavía no figura.",
    ),
  );

  const definiciones = [
    { id: "balance", titulo: "Balance de la campaña", abierta: true, crear: () => seccionBalance(q, () => filtros) },
    { id: "ranking", titulo: "Provincias líderes", abierta: false, crear: () => seccionRanking(q, () => filtros, cambiar) },
    { id: "evolucion", titulo: "Evolución del rendimiento", abierta: false, crear: () => seccionEvolucion(q, () => filtros, cambiar) },
    { id: "mapa", titulo: "Mapa por departamento", abierta: false, crear: () => seccionMapa(q, () => filtros, cambiar) },
  ];

  const elementos = definiciones.map((d) =>
    h("details", { class: "seccion", id: d.id, open: d.abierta }, h("summary", {}, h("h2", {}, d.titulo)), h("div", { class: "cuerpo" })),
  );

  actualizarCabecera();
  app.replaceChildren(
    cabecera,
    ...elementos,
    h(
      "footer",
      { class: "pie" },
      "Hecho con ",
      h("a", { href: `${MCP_BASE}/?ref=${REF}`, target: "_blank", rel: "noopener", onclick: () => analytics.clicMcp("pie") }, "Argentina Data MCP"),
      ". Cada número de esta página es una consulta en vivo a sus tools ",
      h("code", {}, "siia_*"),
      ". ",
      h("a", { href: URL_REPO, target: "_blank", rel: "noopener", onclick: () => analytics.clicMcp("repo") }, "Código fuente"),
      ".",
    ),
  );

  definiciones.forEach((d, i) => {
    const s = d.crear();
    secciones.push(
      montarSeccion(elementos[i]!, {
        id: d.id,
        clave: s.clave,
        cargar: s.cargar,
        controles: "controles" in s ? s.controles : undefined,
        sesionVencida: salir,
        despuesDeCargar: refrescarCuota,
      }),
    );
  });
}

async function arrancar() {
  const resultado = await completarLogin(new URL(location.href), redirectUri(), CLIENT_ID);
  if (resultado === "ok") {
    analytics.loginOk();
    const vista = recuperarVista();
    if (vista) history.replaceState(null, "", `${location.pathname}${vista}`);
  }
  if (resultado === "error" || resultado === "state_invalido") analytics.loginError(resultado);

  const tok = token();
  analytics.pageview(!!tok);
  if (!tok) {
    mostrarIngreso(
      resultado === "error"
        ? "No se pudo completar el ingreso. Probá de nuevo."
        : resultado === "state_invalido"
          ? "El ingreso no se pudo verificar (¿se abrió en otra pestaña?). Probá de nuevo."
          : undefined,
    );
    return;
  }

  const cliente = crearCliente({ endpoint: MCP_ENDPOINT, token });
  await informe(consultas(cliente));
}

void arrancar();
