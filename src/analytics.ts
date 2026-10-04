/**
 * Métricas de uso: qué secciones, cultivos y filtros usa la gente, para saber qué mejorar.
 *
 * Los eventos van al buzón de analytics de Argentina Data MCP (`POST /api/eventos`), el mismo
 * que usa la calculadora de inflación. Ahí no se guarda la IP: el visitante se cuenta con un
 * hash que rota cada 30 días. No hay cookies ni nada persistente en el navegador; el único
 * identificador que pone este código es el de la sesión, en sessionStorage, que muere al cerrar
 * la pestaña.
 *
 * SI FORKEASTE ESTE REPO: no manda nada. Sólo se emite desde HOST_PRODUCCION (src/config.ts);
 * cualquier otro hostname, localhost incluido, es un no-op. Para medir tu fork necesitás tu
 * propio backend de eventos: el del MCP sólo acepta los sitios que tiene en su lista.
 */

import { HOST_PRODUCCION, MCP_BASE, SITIO_ANALYTICS } from "./config";

const ENDPOINT = `${MCP_BASE}/api/eventos`;
const CLAVE_SESION = "sesion-analytics";

type Props = Record<string, string | number | boolean | null>;

function activo(): boolean {
  try {
    return location.hostname === HOST_PRODUCCION;
  } catch {
    return false;
  }
}

function idDeSesion(): string | null {
  try {
    let id = sessionStorage.getItem(CLAVE_SESION);
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem(CLAVE_SESION, id);
    }
    return id;
  } catch {
    return null; // Safari privado tira al tocar sessionStorage; el evento igual sirve.
  }
}

function parametro(nombre: string): string | null {
  return new URLSearchParams(location.search).get(nombre);
}

/**
 * Emite un evento. Nunca tira y nunca bloquea.
 *
 * `sendBeacon` primero porque sobrevive a que el visitante cierre la pestaña. Va como texto
 * plano a propósito: un `application/json` a otro dominio dispara un preflight CORS que
 * sendBeacon no sabe hacer.
 */
export function evento(nombre: string, props: Props = {}): void {
  if (!activo()) return;
  try {
    const cuerpo = JSON.stringify({
      sitio: SITIO_ANALYTICS,
      evento: nombre,
      sesion: idDeSesion(),
      ruta: location.pathname,
      referrer: document.referrer || null,
      utm_source: parametro("utm_source"),
      utm_medium: parametro("utm_medium"),
      utm_campaign: parametro("utm_campaign"),
      props,
    });
    const blob = new Blob([cuerpo], { type: "text/plain;charset=UTF-8" });
    if (navigator.sendBeacon?.(ENDPOINT, blob)) return;
    void fetch(ENDPOINT, {
      method: "POST",
      body: cuerpo,
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Sin red, sin analytics. No es un problema del visitante.
  }
}

/* ---------------------------------------------------------------- eventos del informe */

export const pageview = (logueado: boolean) => evento("pageview", { logueado });
export const loginIniciado = () => evento("login_iniciado");
export const loginOk = () => evento("login_ok");
export const loginError = (motivo: string) => evento("login_error", { motivo });
export const sesionCerrada = () => evento("sesion_cerrada");
export const seccionAbierta = (seccion: string) => evento("seccion_abierta", { seccion });
export const cultivoElegido = (cultivo: string) => evento("cultivo_elegido", { cultivo });
export const campaniaElegida = (campania: string, vs: string | null) => evento("campania_elegida", { campania, vs });
export const metricaElegida = (seccion: string, metrica: string) => evento("metrica_elegida", { seccion, metrica });
export const provinciaElegida = (provincia: string | null) => evento("provincia_elegida", { provincia: provincia ?? "pais" });
export const mapaDepartamentoClick = (provincia: string, departamento: string) =>
  evento("mapa_departamento_click", { provincia, departamento });
export const cuotaAgotada = (seccion: string) => evento("cuota_agotada", { seccion });
export const errorMcp = (tool: string, tipo: string) => evento("error_mcp", { tool, tipo });
export const clicMcp = (destino: string) => evento("clic_mcp", { destino });

/** Nombres de todos los eventos: es la lista que el MCP tiene que aceptar para este sitio. */
export const EVENTOS = [
  "pageview",
  "login_iniciado",
  "login_ok",
  "login_error",
  "sesion_cerrada",
  "seccion_abierta",
  "cultivo_elegido",
  "campania_elegida",
  "metrica_elegida",
  "provincia_elegida",
  "mapa_departamento_click",
  "cuota_agotada",
  "error_mcp",
  "clic_mcp",
] as const;
