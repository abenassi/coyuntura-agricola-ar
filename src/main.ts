/**
 * Arranque del sitio.
 *
 * 1. Si la URL es la vuelta del login, canjea el code por el token.
 * 2. Sin token: pantalla de ingreso.
 * 3. Con token: pide las campañas disponibles, arma los filtros y monta las secciones como
 *    pestañas. Cada sección consulta al MCP recién cuando se muestra.
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
import { escribirFiltros, leerFiltros, type Filtros, type SeccionId } from "./ui/filtros";
import { pantallaIngreso } from "./ui/login";
import { mensajeDeError, montarSeccion, type Seccion } from "./ui/seccion";
import { guardarVista, recuperarVista } from "./ui/vista";
import { seccionBalance } from "./ui/secciones/balance";
import { seccionDepartamento } from "./ui/secciones/departamento";
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
  const cultivos = h("div", { class: "cultivos", role: "group", "aria-label": "Cultivo" });
  const titulo = h("h1");

  /** En el balance, las filas del cultivo elegido arriba: se resaltan sin volver a consultar. */
  function marcarCultivo() {
    document.querySelectorAll<HTMLElement>("[data-cultivo]").forEach((el) => el.classList.toggle("elegido", el.dataset.cultivo === filtros.cultivo));
  }

  function actualizarCabecera() {
    titulo.replaceChildren("Coyuntura agrícola ", h("span", { class: "titulo-campania" }, `· campaña ${campaniaCorta(filtros.campania!)}`));
    const opcionesCampania = campanias.map((c) => [c, campaniaCorta(c)] as const);
    // Los botones se arman una vez y se actualizan: reemplazarlos le sacaría el foco a quien usa teclado.
    if (!cultivos.childElementCount) {
      cultivos.append(
        ...CULTIVOS.map((c) =>
          h(
            "button",
            {
              type: "button",
              "data-id": c.id,
              onclick: () => {
                if (c.id === filtros.cultivo) return;
                analytics.cultivoElegido(c.id);
                cambiar({ cultivo: c.id as CultivoId });
              },
            },
            c.nombre,
          ),
        ),
      );
    }
    cultivos.querySelectorAll<HTMLButtonElement>("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === filtros.cultivo)));
    marcarCultivo();
    controles.replaceChildren(
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

  const refrescarCuota = () => {
    marcarCultivo();
    void actualizarCuota(cuota, q);
  };
  const cabecera = h(
    "header",
    { class: "cabecera" },
    h("div", { class: "barra-superior" }, titulo, h("button", { type: "button", class: "secundario", onclick: salir }, "Cerrar sesión")),
    h("div", { class: "fila-controles" }, controles, cuota),
    h(
      "p",
      { class: "nota" },
      "Estimaciones agrícolas del MAGyP. El SIIA publica campañas cerradas: la campaña en curso todavía no figura.",
    ),
  );

  const definiciones: { id: SeccionId; pestania: string; titulo: string; crear: () => { clave: () => string; cargar: (c: HTMLElement, v: () => boolean) => Promise<void>; controles?: () => HTMLElement } }[] = [
    { id: "balance", pestania: "Balance", titulo: "Balance de la campaña", crear: () => seccionBalance(q, () => filtros) },
    { id: "ranking", pestania: "Provincias", titulo: "Provincias líderes", crear: () => seccionRanking(q, () => filtros, cambiar) },
    { id: "evolucion", pestania: "Evolución", titulo: "Evolución del rendimiento", crear: () => seccionEvolucion(q, () => filtros, cambiar) },
    { id: "mapa", pestania: "Mapa", titulo: "Mapa por departamento", crear: () => seccionMapa(q, () => filtros, cambiar, analizarDepartamento) },
    { id: "departamento", pestania: "Tu departamento", titulo: "Tu departamento", crear: () => seccionDepartamento(q, () => filtros, cambiar) },
  ];

  /** Desde el mapa: muestra "Tu departamento" con ese departamento cargado. */
  function analizarDepartamento(codigo: string) {
    analytics.departamentoElegido("mapa", codigo);
    cambiar({ depto: codigo, vsDepto: filtros.vsDepto === codigo ? null : filtros.vsDepto });
    analytics.seccionAbierta("departamento");
    mostrarSeccion("departamento");
  }

  const pestanias = definiciones.map((d) =>
    h(
      "button",
      {
        type: "button",
        role: "tab",
        id: `pestania-${d.id}`,
        "aria-controls": d.id,
        onclick: () => {
          if (d.id === filtros.seccion) return;
          analytics.seccionAbierta(d.id);
          mostrarSeccion(d.id);
        },
      },
      d.pestania,
    ),
  );
  // Flechas para moverse entre pestañas; Enter o espacio la abre. La activación es manual a
  // propósito: abrir una pestaña cuesta una consulta, recorrerlas con el teclado no tiene que costar.
  const listaPestanias = h(
    "div",
    {
      class: "pestanias",
      role: "tablist",
      "aria-label": "Secciones del informe",
      onkeydown: (e: Event) => {
        const tecla = (e as KeyboardEvent).key;
        const i = pestanias.indexOf(document.activeElement as HTMLButtonElement);
        if (i < 0) return;
        const destino = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: pestanias.length - 1 }[tecla];
        if (destino == null) return;
        e.preventDefault();
        pestanias[(destino + pestanias.length) % pestanias.length]!.focus();
      },
    },
    pestanias,
  );
  const barraFija = h("div", { class: "barra-fija" }, cultivos, listaPestanias);

  // En el celular no entran todas las pestañas: un degradé avisa que hay más hacia la derecha.
  const marcarDesborde = () =>
    listaPestanias.classList.toggle("hay-mas", listaPestanias.scrollLeft + listaPestanias.clientWidth < listaPestanias.scrollWidth - 2);
  listaPestanias.addEventListener("scroll", marcarDesborde, { passive: true });
  window.addEventListener("resize", marcarDesborde);

  const paneles = definiciones.map((d) =>
    h("section", { class: "seccion", id: d.id, role: "tabpanel", "aria-labelledby": `pestania-${d.id}`, tabindex: "-1" }, h("h2", {}, d.titulo), h("div", { class: "cuerpo" })),
  );
  const contenido = h("div", { class: "paneles" }, paneles);

  function mostrarSeccion(id: SeccionId) {
    const antes = filtros.seccion;
    filtros = { ...filtros, seccion: id };
    history.replaceState(null, "", `${location.pathname}${escribirFiltros(filtros, campanias)}`);
    definiciones.forEach((d, i) => {
      const activa = d.id === id;
      pestanias[i]!.setAttribute("aria-selected", String(activa));
      pestanias[i]!.tabIndex = activa ? 0 : -1;
      paneles[i]!.hidden = !activa;
    });
    secciones[definiciones.findIndex((d) => d.id === id)]?.mostrada();
    pestanias[definiciones.findIndex((d) => d.id === id)]!.scrollIntoView({ inline: "nearest", block: "nearest" });
    marcarDesborde();
    if (antes === id) return;
    // Leaflet mide su contenedor sólo al dibujar y en los resize de la ventana: si el mapa ya estaba
    // dibujado y la ventana cambió mientras su pestaña no se veía, así se reacomoda.
    window.dispatchEvent(new Event("resize"));
    // Si la barra quedó pegada arriba, la sección nueva empieza debajo de ella y no a mitad de camino.
    const tope = contenido.getBoundingClientRect().top + window.scrollY - barraFija.offsetHeight;
    if (window.scrollY > tope) window.scrollTo({ top: tope });
  }

  actualizarCabecera();
  app.replaceChildren(
    cabecera,
    barraFija,
    contenido,
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
      montarSeccion(paneles[i]!, {
        id: d.id,
        clave: s.clave,
        cargar: s.cargar,
        controles: s.controles,
        sesionVencida: salir,
        despuesDeCargar: refrescarCuota,
      }),
    );
  });
  mostrarSeccion(filtros.seccion);
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
