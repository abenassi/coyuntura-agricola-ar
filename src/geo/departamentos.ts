/**
 * La lista de departamentos para buscar y elegir, y el nombre con el que hay que pedírselos al SIIA.
 *
 * La lista sale de los polígonos del INDEC que ya están en el sitio: buscar un departamento no
 * consulta al MCP ni gasta cuota.
 */

import { normalizar, type FeatureDepto } from "./cruce";
import nombres from "./nombres-siia.json";

export interface Departamento {
  /** Código INDEC de 5 dígitos (provincia + departamento). */
  codigo: string;
  nombre: string;
  provincia: string;
}

const NOMBRES_SIIA: Record<string, string> = nombres;

export function listaDepartamentos(features: FeatureDepto[]): Departamento[] {
  return features
    .map((f) => ({ codigo: f.properties.id, nombre: f.properties.nombre, provincia: f.properties.provincia }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es") || a.provincia.localeCompare(b.provincia, "es"));
}

/** El nombre exacto que usa el SIIA: siia_estimaciones_cultivo distingue tildes al filtrar. */
export function nombreSiia(d: Departamento): string {
  return NOMBRES_SIIA[d.codigo] ?? d.nombre;
}

/**
 * Sugerencias para lo que el visitante va escribiendo. Cada palabra tiene que aparecer en el nombre
 * o en la provincia ("lopez santa" encuentra General López, Santa Fe). Primero los que empiezan con
 * el texto, después los que lo contienen. Con menos de dos letras no sugiere nada.
 */
export function buscarDepartamentos(lista: Departamento[], texto: string, max = 8): Departamento[] {
  const buscado = normalizar(texto);
  if (buscado.length < 2) return [];
  const palabras = buscado.split(" ");
  const encontrados: { d: Departamento; empieza: boolean }[] = [];
  for (const d of lista) {
    const nombre = normalizar(d.nombre);
    const todo = `${nombre} ${normalizar(d.provincia)}`;
    if (palabras.every((p) => todo.includes(p))) encontrados.push({ d, empieza: nombre.startsWith(buscado) });
  }
  return encontrados
    .sort((a, b) => Number(b.empieza) - Number(a.empieza))
    .slice(0, max)
    .map((e) => e.d);
}
