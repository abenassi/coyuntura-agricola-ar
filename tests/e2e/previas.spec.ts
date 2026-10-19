/**
 * Genera la vista previa de la pantalla de ingreso (public/previa/mapa.webp) a partir del informe
 * real, con el MCP simulado desde respuestas reales capturadas. No corre en CI: se usa a mano
 * cuando cambia algo visible del informe.
 *
 *   npm run previas
 */

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { conSesion, simularMcp } from "./mcp-simulado";

test.skip(!process.env.PREVIAS, "sólo con npm run previas");
// Doble densidad: en pantallas retina las vistas previas se ven nítidas.
test.use({ deviceScaleFactor: 2 });

const DESTINO = "public/previa";

/**
 * PNG → WebP con Pillow, recortado al contenido (sin el margen liso alrededor, que en el celular
 * achica el mapa). Las vistas previas quedan en una fracción del peso.
 */
function aWebp(png: string, webp: string) {
  const py = [
    "from PIL import Image, ImageChops",
    `im = Image.open("${png}").convert("RGB")`,
    "fondo = Image.new('RGB', im.size, im.getpixel((2, 2)))",
    "caja = ImageChops.difference(im, fondo).point(lambda v: 255 if v > 12 else 0).getbbox()",
    "m = 12",
    "im = im.crop((max(caja[0]-m,0), max(caja[1]-m,0), min(caja[2]+m,im.width), min(caja[3]+m,im.height))) if caja else im",
    `im.save("${webp}", "WEBP", quality=82, method=6)`,
    "print(im.size)",
  ].join("\n");
  console.log(webp, execFileSync("python", ["-c", py]).toString().trim());
}

test("vista previa de la pantalla de ingreso", async ({ page }) => {
  mkdirSync(DESTINO, { recursive: true });
  await simularMcp(page, { llamadas: [] });
  await conSesion(page);
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto("./?seccion=mapa");

  await expect.poll(() => page.locator(".mapa path.leaflet-interactive").count()).toBeGreaterThan(500);
  await page.waitForTimeout(800);
  // Sin los botones de zoom ni la atribución: es una imagen, no un mapa.
  await page.addStyleTag({ content: ".leaflet-control-container{display:none}" });
  await page.locator("#mapa .mapa").screenshot({ path: `${DESTINO}/mapa.png` });

  aWebp(`${DESTINO}/mapa.png`, `${DESTINO}/mapa.webp`);
  execFileSync("rm", [`${DESTINO}/mapa.png`]);
});
