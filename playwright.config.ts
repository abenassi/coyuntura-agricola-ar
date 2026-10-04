import { defineConfig, devices } from "@playwright/test";

/**
 * Dos modos:
 * - `npm run e2e`: compila y sirve el sitio en localhost, con el MCP simulado desde fixtures
 *   reales (tests/e2e/informe.spec.ts). No hace falta cuenta ni red.
 * - `npm run smoke`: corre tests/e2e/smoke.spec.ts contra el sitio publicado (SITIO=https://...).
 */
const sitio = process.env.SITIO;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  // Dibujar 529 polígonos en una máquina lenta (o un runner cargado) puede pasar de los 5 s por defecto.
  expect: { timeout: 15_000 },
  reporter: "list",
  use: {
    baseURL: sitio ?? "http://localhost:4173/",
    ...devices["Desktop Chrome"],
  },
  webServer: sitio
    ? undefined
    : { command: "npx vite build && npx vite preview --port 4173 --strictPort", url: "http://localhost:4173/", reuseExistingServer: true, timeout: 120_000 },
});
