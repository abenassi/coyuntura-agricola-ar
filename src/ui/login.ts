/** Pantalla para quien todavía no ingresó: qué es el informe, de dónde salen los datos y el botón. */

import * as analytics from "../analytics";
import { MCP_BASE, REF, URL_REPO } from "../config";
import { h } from "./dom";

export function pantallaIngreso(alIngresar: () => void, error?: string): HTMLElement {
  return h(
    "section",
    { class: "ingreso" },
    h("h1", {}, "Coyuntura agrícola"),
    h(
      "p",
      { class: "bajada" },
      "Soja, maíz, trigo y girasol: cómo terminó la última campaña contra la anterior, qué provincias lideran, ",
      "cómo viene el rendimiento de los últimos diez años y un mapa por departamento.",
    ),
    error ? h("p", { class: "aviso error", role: "alert" }, error) : null,
    h("button", { type: "button", class: "primario", onclick: alIngresar }, "Ingresar con Argentina Data"),
    h(
      "p",
      { class: "nota" },
      "Los datos son las estimaciones agrícolas del Ministerio de Agricultura (MAGyP) y se consultan en vivo a ",
      h("a", { href: `${MCP_BASE}/?ref=${REF}`, target: "_blank", rel: "noopener", onclick: () => analytics.clicMcp("home") }, "Argentina Data MCP"),
      ". Para eso necesitás una cuenta: se crea con Google en un clic y es gratis. ",
      "El plan gratuito trae 20 consultas por día; abrir el informe usa 3 y cada sección que abrís, una más.",
    ),
    h(
      "p",
      { class: "nota" },
      "Este sitio no guarda tus datos ni tu clave: la sesión vive en esta pestaña y se borra al cerrarla. ",
      h("a", { href: URL_REPO, target: "_blank", rel: "noopener", onclick: () => analytics.clicMcp("repo") }, "Ver cómo está hecho"),
      ".",
    ),
  );
}
