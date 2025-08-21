// effis_split_by_year.mjs

// scripts/effis_split_by_year.mjs
// Node 18+, ESM. Descarga EFFIS, lee SHP y exporta GeoJSONs por año:
//   - data/ES_YYYY_fuegos.geojson        (country === 'ES')
//   - data/REST_YYYY_fuegos.geojson      (country !== 'ES')

import fs from "fs-extra";
import path from "path";
import unzipper from "unzipper";
import * as shapefile from "shapefile";
import { snakeCase } from "change-case";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
dayjs.extend(utc);

// --- Config básica del proyecto ---
const OUTPUT_DIR = path.resolve("data");

// URL EFFIS (WFS → Shapefile ZIP)
const EFFIS_WFS =
  "https://maps.effis.emergency.copernicus.eu/effis?service=WFS&request=getfeature&typename=ms:modis.ba.poly&version=1.1.0&outputformat=SHAPEZIP";

// --- Utilidades ---
function toSnakeCaseProps(feature) {
  const props = feature.properties ?? {};
  const out = {};
  for (const [k, v] of Object.entries(props)) out[snakeCase(k)] = v;
  return { ...feature, properties: out };
}

function parseDate(val) {
  const d = dayjs.utc(val);
  return d.isValid() ? d.toISOString() : null;
}

function parseNumber(x) {
  if (x === null || x === undefined || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function cleanFeature(f) {
  // Normaliza nombres y controla campos relevantes
  const p0 = f.properties || {};
  const p = { ...p0 };

  // Campos usados: id, country, province, commune, class, area_ha, firedate, lastupdate
  const firedate = parseDate(p.firedate ?? p.FIREDATE);
  const lastupdate = parseDate(p.lastupdate ?? p.LASTUPDATE);
  const area_ha = parseNumber(p.area_ha ?? p.AREA_HA);
  const country = p.country ?? p.COUNTRY ?? null;
  const prov = p.province ?? p.PROVINCE ?? null;
  const mun = p.commune ?? p.COMMUNE ?? null;
  const klass = p.class ?? p.CLASS ?? null;

  const fireyear = firedate ? dayjs.utc(firedate).year() : null;

  return {
    type: "Feature",
    geometry: f.geometry,
    properties: {
      id: p.id ?? p.objectid ?? p.fid ?? null,
      country,
      prov,
      mun,
      class: klass,
      area_ha,
      firedate,
      lastupdate,
      fireyear,
    },
  };
}

// --- Main ---
async function main() {
  await fs.ensureDir(OUTPUT_DIR);

  const tmpDir = await fs.mkdtemp(path.join(process.cwd(), "tmp_effis_"));
  const zipPath = path.join(tmpDir, "effis.zip");

  try {
    console.log("Descargando EFFIS WFS…");
    const res = await fetch(EFFIS_WFS, { cache: "no-store" });
    if (!res.ok) throw new Error(`Descarga falló (${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(zipPath, buf);

    console.log("Descomprimiendo…");
    await fs
      .createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: tmpDir }))
      .promise();

    const files = await fs.readdir(tmpDir);
    const shpName = files.find((f) => f.toLowerCase().endsWith(".shp"));
    if (!shpName) throw new Error("No se encontró ningún .shp en el ZIP");
    const shpPath = path.join(tmpDir, shpName);

    console.log("Leyendo Shapefile…");
    const source = await shapefile.open(shpPath);

    // Leemos todo (podrías stream/gruop on the fly; aquí mantenemos simple)
    const raw = [];
    while (true) {
      const { done, value } = await source.read();
      if (done) break;
      if (!value || !value.geometry) continue;
      raw.push({
        type: "Feature",
        geometry: value.geometry,
        properties: value.properties || {},
      });
    }
    console.log(`Leídas ${raw.length} features.`);

    // Normaliza nombres → limpia → añade fireyear
    const cleaned = raw.map(toSnakeCaseProps).map(cleanFeature);

    // Agrupa por año
    const byYear = new Map(); // year -> { es: [], rest: [] }
    for (const feat of cleaned) {
      const y = feat.properties.fireyear;
      if (!Number.isInteger(y)) continue; // descarta sin año
      if (!byYear.has(y)) byYear.set(y, { es: [], rest: [] });
      if (feat.properties.country === "ES") byYear.get(y).es.push(feat);
      else byYear.get(y).rest.push(feat);
    }

    // Exporta GeoJSON por año
    const years = [...byYear.keys()].sort((a, b) => a - b);
    if (years.length === 0) {
      console.warn("No hay features con año válido para exportar.");
      return;
    }

    for (const y of years) {
      const { es, rest } = byYear.get(y);

      // ES
      if (es.length > 0) {
        const outPathES = path.join(OUTPUT_DIR, `ES_${y}_fuegos.geojson`);
        await fs.writeJson(
          outPathES,
          { type: "FeatureCollection", features: es },
          { spaces: 0 }
        );
        console.log("✓", outPathES, `(${es.length} features)`);
      } else {
        console.log(`(sin ES para ${y})`);
      }

      // RESTO
      if (rest.length > 0) {
        const outPathREST = path.join(OUTPUT_DIR, `REST_${y}_fuegos.geojson`);
        await fs.writeJson(
          outPathREST,
          { type: "FeatureCollection", features: rest },
          { spaces: 0 }
        );
        console.log("✓", outPathREST, `(${rest.length} features)`);
      } else {
        console.log(`(sin REST para ${y})`);
      }
    }
  } catch (err) {
    console.error("Error:", err.message || err);
    process.exitCode = 1;
  } finally {
    await fs.remove(tmpDir).catch(() => {});
  }
}

main();
