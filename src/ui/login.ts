/**
 * Pantalla para quien todavía no ingresó. Muestra qué hay del otro lado antes de pedirle que entre
 * con su cuenta (nadie hace clic en "Ingresar" sin saber a qué va): tres cifras de la última
 * campaña de las vistas previas, fijas porque todavía no hay cuota para consultar, y el mapa del
 * informe real, generado con `npm run previas`.
 */

import * as analytics from "../analytics";
import { MCP_BASE, REF, URL_REPO } from "../config";
import { CAMPANIA_PREVIA, CAMPANIA_PREVIA_VS, CIFRAS_PREVIA } from "./cifras-previa";
import { h } from "./dom";
import { compacto } from "./formato";
import { variacion } from "./secciones/comun";

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
    "Ver el informe completo →",
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
      h("p", { class: "volanta" }, "Coyuntura agrícola"),
      h("h1", {}, `Cómo terminó la campaña ${CAMPANIA_PREVIA}`),
      h(
        "p",
        { class: "bajada" },
        "Soja, maíz, trigo y girasol: producción y rinde por provincia y por departamento, ",
        "contra la campaña anterior y contra los últimos diez años.",
      ),
      error ? h("p", { class: "aviso error", role: "alert" }, error) : null,
      h(
        "ul",
        { class: "cifras-previa", "aria-label": `Producción de la campaña ${CAMPANIA_PREVIA} contra ${CAMPANIA_PREVIA_VS}` },
        CIFRAS_PREVIA.map((c) =>
          h("li", {}, h("span", { class: "cifra-etiqueta" }, c.etiqueta), h("strong", {}, compacto(c.produccion, "t")), variacion(c.variacion, ` contra ${CAMPANIA_PREVIA_VS}`)),
        ),
      ),
      h(
        "div",
        { class: "ingreso-accion" },
        boton(alIngresar, "arriba"),
        h("p", { class: "nota" }, "Gratis, con tu cuenta de Google. Datos oficiales del Ministerio de Agricultura (MAGyP)."),
      ),
    ),
    previa("mapa", `Rinde de soja por departamento, campaña ${CAMPANIA_PREVIA}`, 849, 992, alIngresar, "principal"),
    h(
      "div",
      { class: "ingreso-pie" },
      h(
        "p",
        { class: "nota" },
        `Adentro está el balance de los cuatro cultivos, las provincias líderes, la evolución del rinde, el mapa de cada departamento y la historia de tu departamento desde 1969. `,
        "Elegís cultivo, campaña, provincia y métrica, y cada número se consulta en vivo a ",
        h("a", { href: `${MCP_BASE}/?ref=${REF}`, target: "_blank", rel: "noopener", onclick: () => analytics.clicMcp("home") }, "Argentina Data MCP"),
        ". Para eso entrás con una cuenta de Argentina Data, que se crea con Google en un clic. ",
        "El plan gratuito trae 20 consultas por día; abrir el informe usa 3 y cada sección que mirás, una más.",
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
