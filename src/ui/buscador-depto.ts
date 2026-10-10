/**
 * Buscador predictivo de departamentos (combobox accesible). Sugiere a medida que se escribe, se
 * maneja con flechas, Enter y Escape, y busca sobre la lista local: no consulta al MCP.
 */

import { buscarDepartamentos, type Departamento } from "../geo/departamentos";
import { h } from "./dom";

let siguienteId = 0;

export interface OpcionesBuscador {
  etiqueta: string;
  placeholder: string;
  lista: Departamento[];
  elegido: Departamento | null;
  alElegir: (d: Departamento) => void;
  /** Si está, aparece un botón para sacar la elección (la comparación es opcional). */
  alQuitar?: () => void;
}

export function texto(d: Departamento): string {
  return `${d.nombre}, ${d.provincia}`;
}

export function buscadorDepartamento(o: OpcionesBuscador): HTMLElement {
  const id = `buscador-depto-${++siguienteId}`;
  const lista = h("ul", { class: "sugerencias", role: "listbox", id: `${id}-lista`, hidden: true });
  const input = h("input", {
    type: "text",
    role: "combobox",
    "aria-label": o.etiqueta,
    "aria-autocomplete": "list",
    "aria-expanded": "false",
    "aria-controls": `${id}-lista`,
    autocomplete: "off",
    spellcheck: "false",
    placeholder: o.placeholder,
    value: o.elegido ? texto(o.elegido) : "",
  });

  let opciones: Departamento[] = [];
  let activa = -1;

  function cerrar() {
    lista.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    activa = -1;
  }

  function marcar(i: number) {
    activa = i;
    [...lista.children].forEach((li, j) => li.setAttribute("aria-selected", j === i ? "true" : "false"));
    if (i >= 0) input.setAttribute("aria-activedescendant", `${id}-op-${i}`);
  }

  function elegir(d: Departamento) {
    input.value = texto(d);
    cerrar();
    o.alElegir(d);
  }

  function sugerir() {
    opciones = buscarDepartamentos(o.lista, input.value);
    lista.replaceChildren(
      ...opciones.map((d, i) =>
        h(
          "li",
          {
            role: "option",
            id: `${id}-op-${i}`,
            "aria-selected": "false",
            // mousedown y no click: el click llega después del blur y la lista ya no existe.
            onmousedown: (e: Event) => {
              e.preventDefault();
              elegir(d);
            },
          },
          h("span", { class: "sugerencia-nombre" }, d.nombre),
          h("span", { class: "sugerencia-provincia" }, d.provincia),
        ),
      ),
    );
    const hay = opciones.length > 0;
    lista.hidden = !hay;
    input.setAttribute("aria-expanded", hay ? "true" : "false");
    marcar(hay ? 0 : -1);
  }

  input.addEventListener("input", sugerir);
  input.addEventListener("focus", () => input.select());
  input.addEventListener("blur", () => {
    cerrar();
    // Si dejó el texto a medias, se vuelve a mostrar lo que estaba elegido.
    input.value = o.elegido ? texto(o.elegido) : "";
  });
  input.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" && opciones.length) {
      e.preventDefault();
      marcar((activa + 1) % opciones.length);
    } else if (e.key === "ArrowUp" && opciones.length) {
      e.preventDefault();
      marcar((activa - 1 + opciones.length) % opciones.length);
    } else if (e.key === "Enter" && opciones[activa]) {
      e.preventDefault();
      elegir(opciones[activa]!);
    } else if (e.key === "Escape") {
      cerrar();
    }
  });

  return h(
    "div",
    { class: "buscador" },
    h("label", { class: "control", for: id }, h("span", {}, o.etiqueta)),
    h(
      "div",
      { class: "buscador-campo" },
      Object.assign(input, { id }),
      o.alQuitar && o.elegido
        ? h("button", { type: "button", class: "quitar", "aria-label": `Quitar ${texto(o.elegido)}`, onclick: o.alQuitar }, "×")
        : null,
      lista,
    ),
  );
}
