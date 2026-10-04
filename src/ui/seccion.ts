/**
 * Una sección del informe es un `<details>`: se carga recién cuando el visitante la abre, porque
 * cada consulta sale de su cuota diaria. Si cambian los filtros, se recarga sólo si está abierta
 * y sólo si cambió algo que la afecta; si está cerrada, se recarga la próxima vez que se abra.
 */

import * as analytics from "../analytics";
import { URL_PLANES } from "../config";
import { McpAuthError, McpCuotaError, McpError } from "../mcp/cliente";
import { h } from "./dom";

export interface Seccion {
  /** Avisar que cambiaron los filtros. */
  filtrosCambiaron(): void;
}

export interface OpcionesSeccion {
  id: string;
  /** Lo que afecta a esta sección, como texto. Si no cambia, no se recarga. */
  clave: () => string;
  /**
   * Pide los datos y los dibuja en `cuerpo`. `vigente()` pasa a false si mientras tanto cambiaron
   * los filtros: una carga vieja no tiene que tocar nada visible (ni destruir un gráfico ni un mapa).
   */
  cargar: (cuerpo: HTMLElement, vigente: () => boolean) => Promise<void>;
  /** Se llama cuando el MCP rechaza la sesión. */
  sesionVencida: () => void;
  /** Se llama después de cada carga, para refrescar la cuota. */
  despuesDeCargar?: () => void;
}

export function montarSeccion(details: HTMLDetailsElement, opciones: OpcionesSeccion): Seccion {
  const cuerpo = details.querySelector<HTMLElement>(".cuerpo")!;
  let cargada: string | null = null;
  let enCurso = 0;

  async function cargar() {
    const clave = opciones.clave();
    if (clave === cargada) return;
    cargada = clave;
    const turno = ++enCurso;
    cuerpo.replaceChildren(h("p", { class: "cargando", role: "status" }, "Consultando el MCP…"));
    const destino = h("div");
    try {
      await opciones.cargar(destino, () => turno === enCurso);
      // Si mientras tanto cambiaron los filtros, esta respuesta ya no corresponde.
      if (turno === enCurso) cuerpo.replaceChildren(destino);
    } catch (e: unknown) {
      if (turno !== enCurso) return;
      cargada = null; // que se pueda reintentar
      cuerpo.replaceChildren(mensajeDeError(e, opciones.id, cargar));
      if (e instanceof McpAuthError) opciones.sesionVencida();
    } finally {
      if (turno === enCurso) opciones.despuesDeCargar?.();
    }
  }

  details.addEventListener("toggle", () => {
    if (!details.open) return;
    analytics.seccionAbierta(opciones.id);
    void cargar();
  });
  if (details.open) void cargar();

  return {
    filtrosCambiaron() {
      if (details.open) void cargar();
    },
  };
}

/** El aviso que corresponde a un error del MCP: cuota agotada, sesión vencida o falla. */
export function mensajeDeError(e: unknown, seccion: string, reintentar: () => void): HTMLElement {
  const tool = e instanceof McpError ? (e.tool ?? "?") : "?";

  if (e instanceof McpCuotaError) {
    analytics.cuotaAgotada(seccion);
    const reinicio = e.reinicioDiario
      ? new Date(e.reinicioDiario).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })
      : null;
    return h(
      "div",
      { class: "aviso", role: "alert" },
      h("strong", {}, "Llegaste al límite de consultas de tu plan. "),
      reinicio ? `Se renueva el ${reinicio}. ` : "",
      "Lo que ya cargaste sigue a la vista. ",
      h("a", { href: URL_PLANES, target: "_blank", rel: "noopener", onclick: () => analytics.clicMcp("planes") }, "Ver planes"),
    );
  }

  if (e instanceof McpAuthError) {
    analytics.errorMcp(tool, "auth");
    return h("div", { class: "aviso", role: "alert" }, "Tu sesión venció. Volvé a ingresar para seguir.");
  }

  analytics.errorMcp(tool, e instanceof McpError ? "mcp" : "otro");
  const detalle = e instanceof Error ? e.message : String(e);
  return h(
    "div",
    { class: "aviso error", role: "alert" },
    h("p", {}, "No se pudo cargar esta sección."),
    h("p", { class: "detalle" }, `${tool}: ${detalle}`),
    h("button", { type: "button", onclick: reintentar }, "Reintentar"),
  );
}
