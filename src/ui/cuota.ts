/** Indicador de consultas restantes. `consultar_cuota` es una meta-tool: no consume cuota. */

import type { Consultas } from "../datos/consultas";
import { numero } from "./formato";

export async function actualizarCuota(el: HTMLElement, q: Consultas): Promise<void> {
  try {
    const c = await q.cuota();
    if (c.diario.limite < 0) {
      el.textContent = "Consultas sin límite";
      return;
    }
    el.textContent = `Te quedan ${numero(Math.max(c.diario.restante, 0))} de ${numero(c.diario.limite)} consultas hoy`;
    el.classList.toggle("poca", c.diario.restante <= 3);
  } catch {
    // El indicador es accesorio: si falla, se deja como estaba.
  }
}
