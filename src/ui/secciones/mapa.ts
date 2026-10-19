/**
 * Mapa por departamento del cultivo elegido: rendimiento o producción.
 *
 * Una consulta a `siia_estimaciones_cultivo` por cultivo y campaña (todo el país de una vez).
 * Los datos del SIIA no traen geometría: se cruzan por nombre con los polígonos del INDEC que
 * están en `public/geo/` (ver src/geo/cruce.ts). El mapa no usa capa base (no hay pedidos a
 * servidores de tiles de terceros): sólo los departamentos sobre el fondo.
 *
 * Al lado del mapa (abajo en el celular) va un panel con el departamento que se tocó y los cinco
 * primeros de la métrica elegida. Todo sale de la misma respuesta: tocar no consulta nada.
 */

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import * as analytics from "../../analytics";
import { mejoresDepartamentos, quantiles, redondearCortes } from "../../datos/calculos";
import type { Consultas } from "../../datos/consultas";
import { cultivo, type FilaEstimacion } from "../../datos/tipos";
import { cruzar, indexarGeometria, type FeatureDepto } from "../../geo/cruce";
import { cargarGeometria } from "../../geo/geometria";
import { h, selector } from "../dom";
import { campaniaCorta, compacto, hectareas, kgHa, numero, toneladas } from "../formato";
import type { Filtros, MetricaMapa } from "../filtros";
import { notaFuente } from "./comun";

const CLASES = 5;

let mapa: L.Map | null = null;

export function seccionMapa(
  q: Consultas,
  filtros: () => Filtros,
  cambiar: (p: Partial<Filtros>) => void,
  analizarDepartamento: (codigo: string) => void,
) {
  return {
    clave: () => `${filtros().cultivo} ${filtros().campania} ${filtros().metricaMapa}`,
    controles: () =>
      h(
        "div",
        { class: "controles-seccion" },
        selector(
          "Mostrar",
          [
            ["rendimiento", "Rendimiento (kg/ha)"],
            ["produccion", "Producción (t)"],
          ],
          filtros().metricaMapa,
          (m) => {
            analytics.metricaElegida("mapa", m);
            cambiar({ metricaMapa: m as MetricaMapa });
          },
        ),
      ),
    async cargar(cuerpo: HTMLElement, vigente: () => boolean) {
      const { cultivo: c, campania, metricaMapa } = filtros();
      if (!campania) return;
      const [est, features] = await Promise.all([q.estimaciones(c, campania), cargarGeometria()]);
      if (!vigente()) return;
      const indice = indexarGeometria(features);
      const { cruzadas, sinGeometria } = cruzar(est.datos, indice);

      const avisos: string[] = [];
      if (est.total > est.devueltos) {
        avisos.push(`El MCP devolvió ${numero(est.devueltos)} de ${numero(est.total)} departamentos; el mapa muestra sólo esos.`);
      }
      if (sinGeometria.length) {
        avisos.push(
          `${sinGeometria.length} departamento(s) con datos no tienen polígono y no se ven en el mapa: ` +
            sinGeometria.map((f) => `${f.departamento} (${f.provincia})`).join(", ") + ".",
        );
      }

      const contenedor = h("div", { class: "mapa", role: "region", "aria-label": `Mapa de ${cultivo(c).nombre.toLowerCase()} por departamento` });
      const cortes = redondearCortes(quantiles(cruzadas.map(({ fila }) => valorDe(fila, metricaMapa)), CLASES), metricaMapa);
      const panel = panelLateral(est.datos, cruzadas, metricaMapa, est.total > est.devueltos);

      cuerpo.append(
        h(
          "p",
          { class: "resumen" },
          `${cultivo(c).nombre}, campaña ${campaniaCorta(campania)}: ${metricaMapa === "rendimiento" ? "rendimiento" : "producción"} de ${numero(est.datos.length)} departamentos. Tocá uno para ver el detalle.`,
        ),
        h("div", { class: "mapa-y-panel" }, h("div", { class: "mapa-columna" }, contenedor, leyenda(cortes, metricaMapa)), panel.elemento),
        ...avisos.map((a) => h("p", { class: "aviso" }, a)),
        notaFuente(est),
      );

      // Leaflet necesita medir el contenedor: si el visitante se fue a otra pestaña mientras esto
      // cargaba, el contenedor está oculto (0 px) y el encuadre daría NaN. Se dibuja cuando vuelva.
      cuandoSeaVisible(contenedor, () => {
        if (vigente()) panel.conectar(dibujar(contenedor, features, cruzadas, cortes, metricaMapa), analizarDepartamento);
      });
    },
  };
}

function cuandoSeaVisible(el: HTMLElement, hacer: () => void) {
  requestAnimationFrame(() => {
    if (el.clientWidth > 0) return hacer();
    const observador = new ResizeObserver(() => {
      if (el.clientWidth === 0) return;
      observador.disconnect();
      hacer();
    });
    observador.observe(el);
  });
}

function valorDe(fila: FilaEstimacion, metrica: MetricaMapa): number {
  return metrica === "rendimiento" ? fila.rendimiento_kg_ha : fila.produccion_tn;
}

function clase(valor: number, cortes: number[]): number {
  let i = 0;
  while (i < cortes.length && valor >= cortes[i]!) i++;
  return i;
}

function colorClase(i: number): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--secuencial-${i + 1}`).trim();
}

function formatoMetrica(v: number, metrica: MetricaMapa): string {
  return metrica === "rendimiento" ? kgHa(v) : toneladas(v);
}

/**
 * La leyenda como rampa: los colores en fila y los cortes en las uniones. Para el lector de
 * pantalla, la misma información como lista de rangos.
 */
function leyenda(cortes: number[], metrica: MetricaMapa): HTMLElement {
  const clases = cortes.length + 1;
  const corto = (v: number) => (metrica === "rendimiento" ? numero(v) : compacto(v, "t"));
  const limites = [null, ...cortes, null];
  const rangos = Array.from({ length: clases }, (_, i) => {
    const desde = limites[i];
    const hasta = limites[i + 1];
    return desde == null ? `menos de ${formatoMetrica(hasta!, metrica)}` : hasta == null ? `${formatoMetrica(desde, metrica)} o más` : `${numero(desde)} a ${numero(hasta)}`;
  });
  return h(
    "div",
    { class: "leyenda" },
    h(
      "div",
      { class: "leyenda-rampa", "aria-hidden": "true" },
      h("div", { class: "rampa" }, Array.from({ length: clases }, (_, i) => h("span", { class: `muestra-${i + 1}` }))),
      h(
        "div",
        { class: "rampa-cortes" },
        cortes.map((c, i) => h("span", { style: `left:${(((i + 1) / clases) * 100).toFixed(2)}%` }, corto(c))),
        metrica === "rendimiento" ? h("span", { class: "rampa-unidad" }, "kg/ha") : null,
      ),
    ),
    h("span", { class: "leyenda-vacia", "aria-hidden": "true" }, h("span", { class: "muestra muestra-vacia" }), "sin datos"),
    h("ul", { class: "solo-lector" }, rangos.map((r) => h("li", {}, r)), h("li", {}, "gris: sin datos")),
  );
}

function detalle(fila: FilaEstimacion, codigo: string, analizar: (codigo: string) => void): HTMLElement[] {
  return [
    h("span", { class: "panel-etiqueta" }, "Departamento elegido"),
    h("strong", {}, `${fila.departamento}, ${fila.provincia}`),
    h("p", {}, `Rendimiento: ${kgHa(fila.rendimiento_kg_ha)}`),
    h("p", {}, `Producción: ${toneladas(fila.produccion_tn)}`),
    h("p", {}, `Sembrado: ${hectareas(fila.sup_sembrada_ha)} · cosechado: ${hectareas(fila.sup_cosechada_ha)}`),
    h("button", { type: "button", class: "analizar", onclick: () => analizar(codigo) }, "Ver su evolución →"),
  ];
}

type Cruzada = { fila: FilaEstimacion; feature: FeatureDepto };
type AlElegir = (fila: FilaEstimacion, codigo: string) => void;
/** Lo que devuelve `dibujar`: resaltar un departamento y avisar cuando se toca uno. */
interface MapaDibujado {
  resaltar(codigo: string): void;
  alTocar(f: AlElegir): void;
}

function panelLateral(filas: FilaEstimacion[], cruzadas: Cruzada[], metrica: MetricaMapa, recortado: boolean) {
  const tarjeta = h("div", { class: "panel-detalle", "aria-live": "polite" }, h("p", { class: "nota" }, "Tocá un departamento del mapa para ver su detalle."));
  const codigoDe = new Map(cruzadas.map((c) => [c.fila, c.feature.properties.id]));
  const campo = metrica === "rendimiento" ? "rendimiento_kg_ha" : "produccion_tn";
  let elegir: AlElegir = () => {};

  const lista = h(
    "ol",
    { class: "mejores" },
    mejoresDepartamentos(filas, campo).map((f) => {
      const codigo = codigoDe.get(f);
      const texto = [h("span", {}, `${f.departamento}, ${f.provincia}`), h("strong", {}, metrica === "rendimiento" ? numero(f.rendimiento_kg_ha) : compacto(f.produccion_tn, "t"))];
      return h("li", {}, codigo ? h("button", { type: "button", class: "mejor", onclick: () => elegir(f, codigo) }, texto) : h("span", { class: "mejor" }, texto));
    }),
  );

  return {
    elemento: h(
      "aside",
      { class: "panel-mapa", "aria-label": "Detalle del mapa" },
      tarjeta,
      h("h3", {}, metrica === "rendimiento" ? "Mayor rendimiento" : "Mayor producción"),
      recortado ? h("p", { class: "nota" }, "Entre los departamentos que devolvió el MCP (ver el aviso abajo).") : null,
      lista,
    ),
    /** Cuando el mapa ya está dibujado: tocar un departamento (o uno de la lista) llena la tarjeta. */
    conectar(dibujado: MapaDibujado, analizar: (codigo: string) => void) {
      elegir = (fila, codigo) => {
        tarjeta.replaceChildren(...detalle(fila, codigo, analizar));
        tarjeta.classList.add("con-depto");
        dibujado.resaltar(codigo);
        // En el celular la tarjeta queda abajo del mapa: que se vea sin tener que buscarla.
        const r = tarjeta.getBoundingClientRect();
        if (r.bottom > window.innerHeight || r.top < 0) tarjeta.scrollIntoView({ behavior: "smooth", block: "nearest" });
      };
      dibujado.alTocar(elegir);
    },
  };
}

function dibujar(contenedor: HTMLElement, features: FeatureDepto[], cruzadas: Cruzada[], cortes: number[], metrica: MetricaMapa): MapaDibujado {
  let alTocar: AlElegir = () => {};
  const capas = new Map<string, L.Path>();
  let elegida: L.Path | null = null;
  mapa?.remove();
  // En pantallas táctiles el arrastre con un dedo se lo deja a la página (si no, el mapa atrapa el
  // scroll); el zoom con dos dedos y los botones siguen andando.
  mapa = L.map(contenedor, { zoomSnap: 0.25, scrollWheelZoom: false, dragging: !L.Browser.mobile, attributionControl: true });
  mapa.attributionControl.setPrefix(false).addAttribution("Límites: INDEC · Datos: MAGyP vía Argentina Data MCP");

  const porId = new Map(cruzadas.map((c) => [c.feature.properties.id, c.fila]));
  const borde = getComputedStyle(document.documentElement).getPropertyValue("--superficie").trim();
  const vacio = getComputedStyle(document.documentElement).getPropertyValue("--sin-dato").trim();

  const capa = L.geoJSON(
    { type: "FeatureCollection", features } as GeoJSON.FeatureCollection,
    {
      style: (f) => {
        const fila = porId.get((f as FeatureDepto).properties.id);
        return {
          color: borde,
          weight: 0.6,
          fillOpacity: 1,
          fillColor: fila ? colorClase(clase(valorDe(fila, metrica), cortes)) : vacio,
        };
      },
      onEachFeature: (f, capaDepto) => {
        const fila = porId.get((f as FeatureDepto).properties.id);
        if (!fila) {
          capaDepto.bindTooltip(() => h("span", {}, `${(f as FeatureDepto).properties.nombre}: sin datos`), { sticky: true });
          return;
        }
        // Siempre un nodo y no un string: Leaflet mete los strings con innerHTML, y los nombres vienen de afuera.
        capaDepto.bindTooltip(() => h("span", {}, `${fila.departamento}: ${formatoMetrica(valorDe(fila, metrica), metrica)}`), { sticky: true });
        const codigo = (f as FeatureDepto).properties.id;
        capas.set(codigo, capaDepto as L.Path);
        capaDepto.on("click", () => {
          analytics.mapaDepartamentoClick(fila.provincia, fila.departamento);
          alTocar(fila, codigo);
        });
      },
    },
  ).addTo(mapa);

  // Encuadre en la zona agrícola (los departamentos con datos), no en todo el país hasta la Antártida.
  const zona = L.latLngBounds([]);
  capa.eachLayer((l) => {
    const f = (l as L.Polygon).feature as FeatureDepto | undefined;
    if (f && porId.has(f.properties.id)) zona.extend((l as L.Polygon).getBounds());
  });
  mapa.fitBounds(zona.isValid() ? zona : capa.getBounds(), { padding: [8, 8] });

  const tinta = getComputedStyle(document.documentElement).getPropertyValue("--texto").trim();
  return {
    resaltar(codigo: string) {
      elegida?.setStyle({ color: borde, weight: 0.6 });
      elegida = capas.get(codigo) ?? null;
      elegida?.setStyle({ color: tinta, weight: 2.5 }).bringToFront();
    },
    alTocar(f: AlElegir) {
      alTocar = f;
    },
  };
}
