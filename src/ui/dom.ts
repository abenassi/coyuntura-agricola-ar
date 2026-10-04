/**
 * Ayudante mínimo para armar DOM.
 *
 * El sitio nunca usa `innerHTML` con datos: todo texto que viene del MCP entra como nodo de
 * texto. Importa más de lo habitual porque el token del visitante vive en sessionStorage, y un
 * XSS podría leerlo.
 */

type Hijo = Node | string | number | null | undefined | false;
type Atributos = Record<string, string | number | boolean | null | undefined | ((e: Event) => void)>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  atributos: Atributos = {},
  ...hijos: (Hijo | Hijo[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [clave, valor] of Object.entries(atributos)) {
    if (valor == null || valor === false) continue;
    if (typeof valor === "function") el.addEventListener(clave.replace(/^on/, ""), valor);
    else if (valor === true) el.setAttribute(clave, "");
    else el.setAttribute(clave, String(valor));
  }
  for (const hijo of hijos.flat()) {
    if (hijo == null || hijo === false) continue;
    el.append(typeof hijo === "number" ? String(hijo) : hijo);
  }
  return el;
}

/** Un `<select>` con opciones `[valor, texto]` y la elegida marcada. */
export function selector(
  etiqueta: string,
  opciones: readonly (readonly [string, string])[],
  elegida: string,
  alCambiar: (valor: string) => void,
): HTMLLabelElement {
  const select = h(
    "select",
    { "aria-label": etiqueta, onchange: (e: Event) => alCambiar((e.target as HTMLSelectElement).value) },
    opciones.map(([valor, texto]) => h("option", { value: valor, selected: valor === elegida }, texto)),
  );
  return h("label", { class: "control" }, h("span", {}, etiqueta), select);
}
