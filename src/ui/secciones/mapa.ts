/**
 * Mapa por departamento del cultivo elegido: rendimiento o producción.
 *
 * Una consulta a `siia_estimaciones_cultivo` por cultivo y campaña (todo el país de una vez).
 * Los datos del SIIA no traen geometría: se cruzan por nombre con los polígonos del IGN que
 * están en `public/geo/` (ver src/geo/cruce.ts). El mapa no usa capa base (no hay pedidos a
 * servidores de tiles de terceros): sólo los departamentos sobre el fondo.
 */

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import * as analytics from "../../analytics";
import { quantiles } from "../../datos/calculos";
import type { Consultas } from "../../datos/consultas";
import { cultivo, type FilaEstimacion } from "../../datos/tipos";
import { cruzar, indexarGeometria, type FeatureDepto } from "../../geo/cruce";
import { h, selector } from "../dom";
import { campaniaCorta, hectareas, kgHa, numero, toneladas } from "../formato";
import type { Filtros, MetricaMapa } from "../filtros";
import { notaFuente } from "./comun";

const CLASES = 5;

let geometria: Promise<FeatureDepto[]> | null = null;
let mapa: L.Map | null = null;

/** Los polígonos se bajan una sola vez, recién cuando alguien abre el mapa. */
function cargarGeometria(): Promise<FeatureDepto[]> {
  geometria ??= fetch(`${import.meta.env.BASE_URL}geo/departamentos.topo.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`No se pudo bajar la geometría (HTTP ${r.status})`);
      return r.json() as Promise<Topology>;
    })
    .then((topo) => feature(topo, topo.objects.departamentos as GeometryCollection).features as FeatureDepto[])
    .catch((e: unknown) => {
      geometria = null;
      throw e;
    });
  return geometria;
}

export function seccionMapa(q: Consultas, filtros: () => Filtros, cambiar: (p: Partial<Filtros>) => void) {
  return {
    clave: () => `${filtros().cultivo} ${filtros().campania} ${filtros().metricaMapa}`,
    async cargar(cuerpo: HTMLElement, vigente: () => boolean) {
      const { cultivo: c, campania, metricaMapa } = filtros();
      if (!campania) return;
      const [est, features] = await Promise.all([q.estimaciones(c, campania), cargarGeometria()]);
      if (!vigente()) return;
      const indice = indexarGeometria(features);
      const { cruzadas, sinGeometria } = cruzar(est.datos, indice);

      const control = selector(
        "Mostrar",
        [
          ["rendimiento", "Rendimiento (kg/ha)"],
          ["produccion", "Producción (t)"],
        ],
        metricaMapa,
        (m) => {
          analytics.metricaElegida("mapa", m);
          cambiar({ metricaMapa: m as MetricaMapa });
        },
      );

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
      const cortes = quantiles(cruzadas.map(({ fila }) => valorDe(fila, metricaMapa)), CLASES);

      cuerpo.append(
        h("div", { class: "controles-seccion" }, control),
        h(
          "p",
          { class: "resumen" },
          `${cultivo(c).nombre}, campaña ${campaniaCorta(campania)}: ${metricaMapa === "rendimiento" ? "rendimiento" : "producción"} de ${numero(est.datos.length)} departamentos. Tocá uno para ver el detalle.`,
        ),
        contenedor,
        leyenda(cortes, metricaMapa),
        ...avisos.map((a) => h("p", { class: "aviso" }, a)),
        notaFuente(est),
      );

      // Leaflet necesita que el contenedor ya esté en el documento para medirlo.
      requestAnimationFrame(() => {
        if (vigente()) dibujar(contenedor, features, cruzadas, cortes, metricaMapa);
      });
    },
  };
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

function leyenda(cortes: number[], metrica: MetricaMapa): HTMLElement {
  const limites = [null, ...cortes, null];
  const items = Array.from({ length: CLASES }, (_, i) => {
    const desde = limites[i];
    const hasta = limites[i + 1];
    const texto =
      desde == null ? `menos de ${formatoMetrica(hasta!, metrica)}` : hasta == null ? `${formatoMetrica(desde, metrica)} o más` : `${numero(desde)} a ${numero(hasta)}`;
    return h("li", {}, h("span", { class: `muestra muestra-${i + 1}` }), texto);
  });
  items.push(h("li", {}, h("span", { class: "muestra muestra-vacia" }), "sin datos"));
  return h("ul", { class: "leyenda" }, items);
}

function detalle(fila: FilaEstimacion): HTMLElement {
  return h(
    "div",
    { class: "popup" },
    h("strong", {}, `${fila.departamento}, ${fila.provincia}`),
    h("p", {}, `Producción: ${toneladas(fila.produccion_tn)}`),
    h("p", {}, `Sembrado: ${hectareas(fila.sup_sembrada_ha)} · cosechado: ${hectareas(fila.sup_cosechada_ha)}`),
    h("p", {}, `Rendimiento: ${kgHa(fila.rendimiento_kg_ha)}`),
  );
}

function dibujar(
  contenedor: HTMLElement,
  features: FeatureDepto[],
  cruzadas: { fila: FilaEstimacion; feature: FeatureDepto }[],
  cortes: number[],
  metrica: MetricaMapa,
) {
  mapa?.remove();
  // En pantallas táctiles el arrastre con un dedo se lo deja a la página (si no, el mapa atrapa el
  // scroll); el zoom con dos dedos y los botones siguen andando.
  mapa = L.map(contenedor, { zoomSnap: 0.25, scrollWheelZoom: false, dragging: !L.Browser.mobile, attributionControl: true });
  mapa.attributionControl.setPrefix(false).addAttribution("Límites: IGN vía Georef · Datos: MAGyP vía Argentina Data MCP");

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
        capaDepto.bindPopup(() => detalle(fila));
        capaDepto.on("click", () => analytics.mapaDepartamentoClick(fila.provincia, fila.departamento));
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
}
