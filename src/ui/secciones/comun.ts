import { h } from "../dom";
import { pct } from "../formato";

interface ConFuente {
  fuente: string;
  fuente_url: string;
  freshness?: string;
  advertencia?: string;
  warnings?: string[];
  nota?: string;
}

/** Fuente de los datos y los avisos que haya mandado la tool, tal cual. */
export function notaFuente(r: ConFuente, tool?: string): HTMLElement {
  const avisos = [...(r.warnings ?? []), ...(r.nota ? [r.nota] : [])];
  return h(
    "footer",
    { class: "fuente" },
    avisos.map((a) => h("p", { class: "aviso-tool" }, a)),
    h(
      "p",
      {},
      "Fuente: ",
      h("a", { href: r.fuente_url, target: "_blank", rel: "noopener" }, r.fuente),
      tool ? ` · tool ${tool}` : "",
    ),
  );
}

/**
 * Una variación que se lee sin mirar el número: flecha, signo y color. La flecha repite lo que ya
 * dice el signo, para quien no distingue el verde del rojo; el lector de pantalla lee sólo el texto.
 * Mismo umbral que `pct`: lo que redondea a 0,0 % no sube ni baja.
 */
export function variacion(n: number | null | undefined, sufijo = ""): HTMLElement {
  const lado = n == null || !Number.isFinite(n) || Math.abs(n) < 0.05 ? "igual" : n > 0 ? "sube" : "baja";
  const flecha = lado === "sube" ? "▲" : lado === "baja" ? "▼" : "";
  return h("span", { class: `delta ${lado}` }, flecha ? h("span", { "aria-hidden": "true" }, `${flecha} `) : null, pct(n), sufijo);
}

/** El número que importa de la sección, grande, con su variación al lado. */
export function titular(cifra: string, delta: HTMLElement | null, contexto?: string): HTMLElement {
  return h(
    "div",
    { class: "titular" },
    h("span", { class: "titular-cifra" }, cifra),
    delta,
    contexto ? h("span", { class: "titular-contexto" }, contexto) : null,
  );
}
