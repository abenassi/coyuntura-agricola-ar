import { defineConfig } from "vitest/config";

export default defineConfig({
  /*
   * Base relativa: el mismo build sirve desde la raíz de un dominio propio
   * (agro.mymcps.dev) y desde el subpath de un fork en GitHub Pages
   * (usuario.github.io/coyuntura-agricola-ar/), sin recompilar.
   */
  base: "./",
  build: { outDir: "dist" },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
