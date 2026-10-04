/**
 * Los filtros de un link compartido (`?cultivo=maiz&campania=...`) tienen que sobrevivir al login.
 * La URL de vuelta del OAuth es fija (la página sin query, como quedó registrada), así que antes de
 * salir hacia el MCP se guardan en sessionStorage y se recuperan una sola vez a la vuelta.
 */

const CLAVE = "vista-antes-del-login";

export function guardarVista(search: string): void {
  if (search) sessionStorage.setItem(CLAVE, search);
}

export function recuperarVista(): string | null {
  const vista = sessionStorage.getItem(CLAVE);
  sessionStorage.removeItem(CLAVE);
  return vista;
}
