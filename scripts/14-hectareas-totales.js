// ourense_2025_sheet.mjs
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const filePath = resolve("data", "ES_2025_fuegos.geojson");

// Rango de fechas para agosto
const startDate = new Date("2025-08-08T00:00:00Z");
const endDate = new Date("2025-08-22T23:59:59Z");

// Umbral de área mínima (excluir <= 30 ha)
const minArea = 30;

async function sumFires() {
  const raw = await readFile(filePath, "utf-8");
  const geojson = JSON.parse(raw);

  const features = geojson.features.filter(
    (f) => (Number(f.properties.area_ha) || 0) >= minArea
  );

  // Total entre 8–22 agosto 2025 (excluyendo <= 30 ha)
  const totalAug = features
    .filter((f) => {
      const fireDate = new Date(f.properties.firedate);
      return fireDate >= startDate && fireDate <= endDate;
    })
    .reduce((acc, f) => acc + Number(f.properties.area_ha), 0);

  // Total todo 2025 (excluyendo <= 30 ha)
  const totalYear = features
    .filter((f) => f.properties.fireyear === 2025)
    .reduce((acc, f) => acc + Number(f.properties.area_ha), 0);

  console.log(`Área total (ha) >30 ha entre 8–22 agosto 2025: ${totalAug}`);
  console.log(`Área total (ha) >30 ha todo 2025: ${totalYear}`);
}

sumFires().catch((err) => {
  console.error("Error al procesar el archivo:", err);
});
