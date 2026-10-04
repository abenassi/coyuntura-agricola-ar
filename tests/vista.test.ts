import { beforeEach, expect, test, vi } from "vitest";
import { guardarVista, recuperarVista } from "../src/ui/vista";

beforeEach(() => {
  const datos = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, v),
    removeItem: (k: string) => void datos.delete(k),
  });
});

test("los filtros de un link compartido sobreviven al viaje del login, una sola vez", () => {
  guardarVista("?cultivo=maiz&campania=2022/2023");
  expect(recuperarVista()).toBe("?cultivo=maiz&campania=2022/2023");
  expect(recuperarVista()).toBeNull();
});

test("sin filtros no guarda nada", () => {
  guardarVista("");
  expect(recuperarVista()).toBeNull();
});
