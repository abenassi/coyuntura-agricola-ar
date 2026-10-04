import { h } from "../dom";

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
