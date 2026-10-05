/**
 * Pantalla para quien todavía no ingresó. Muestra qué hay del otro lado (vistas previas del
 * informe real, generadas con `npm run previas`) antes de pedirle que entre con su cuenta: nadie
 * hace clic en "Ingresar" sin saber a qué va.
 */

import * as analytics from "../analytics";
import { MCP_BASE, REF, URL_REPO } from "../config";
import { h } from "./dom";

const PREVIA = `${import.meta.env.BASE_URL}previa/`;

function boton(alIngresar: () => void, donde: string): HTMLButtonElement {
  return h(
    "button",
    {
      type: "button",
      class: "primario",
      onclick: () => {
        analytics.clicMcp(`ingresar_${donde}`);
        alIngresar();
      },
    },
    "Ver el informe completo",
  );
}

/** Una vista previa que también lleva al ingreso: es lo primero que la gente toca. */
function previa(archivo: string, texto: string, ancho: number, alto: number, alIngresar: () => void, clase = ""): HTMLElement {
  return h(
    "figure",
    { class: `previa ${clase}` },
    h(
      "button",
      {
        type: "button",
        class: "previa-boton",
        "aria-label": `${texto}. Ingresar para verlo con datos en vivo`,
        onclick: () => {
          analytics.clicMcp(`previa_${archivo}`);
          alIngresar();
        },
      },
      h("img", { src: `${PREVIA}${archivo}.webp`, alt: texto, width: ancho, height: alto, loading: archivo === "mapa" ? "eager" : "lazy" }),
    ),
    h("figcaption", {}, texto),
  );
}

export function pantallaIngreso(alIngresar: () => void, error?: string): HTMLElement {
  return h(
    "section",
    { class: "ingreso" },
    h(
      "header",
      { class: "ingreso-cabecera" },
      h("h1", {}, "Coyuntura agrícola"),
      h(
        "p",
        { class: "bajada" },
        "Cómo terminó la campaña de soja, maíz, trigo y girasol: producción y rinde por provincia y por departamento, ",
        "contra la campaña anterior y contra los últimos diez años.",
      ),
      error ? h("p", { class: "aviso error", role: "alert" }, error) : null,
      boton(alIngresar, "arriba"),
      h("p", { class: "nota" }, "Gratis, con tu cuenta de Google. Datos oficiales del Ministerio de Agricultura (MAGyP)."),
    ),
    h(
      "div",
      { class: "previas" },
      previa("mapa", "Rinde de soja por departamento, campaña 2024/25", 849, 992, alIngresar, "principal"),
      previa("ranking", "Provincias líderes en producción de soja", 1788, 818, alIngresar),
      previa("balance", "Balance de la campaña contra la anterior", 1788, 1203, alIngresar),
    ),
    h(
      "div",
      { class: "ingreso-pie" },
      boton(alIngresar, "abajo"),
      h(
        "p",
        { class: "nota" },
        "Las imágenes son del informe con datos de la campaña 2024/25. Adentro elegís cultivo, campaña, provincia y métrica, ",
        "y cada número se consulta en vivo a ",
        h("a", { href: `${MCP_BASE}/?ref=${REF}`, target: "_blank", rel: "noopener", onclick: () => analytics.clicMcp("home") }, "Argentina Data MCP"),
        ". Para eso entrás con una cuenta de Argentina Data, que se crea con Google en un clic. ",
        "El plan gratuito trae 20 consultas por día; abrir el informe usa 3 y cada sección que abrís, una más.",
      ),
      h(
        "p",
        { class: "nota" },
        "Este sitio no guarda tus datos ni tu clave: la sesión vive en esta pestaña y se borra al cerrarla. ",
        h("a", { href: URL_REPO, target: "_blank", rel: "noopener", onclick: () => analytics.clicMcp("repo") }, "Ver cómo está hecho"),
        ".",
      ),
    ),
  );
}
