// scripts/effis_split_by_year.mjs
// Node 18+, ESM. Descarga EFFIS, lee SHP y exporta GeoJSONs por año:
//   - data/ES_YYYY_fuegos.geojson        (country === 'ES')  -> añade ccaa y ccaa_code
//   - data/REST_YYYY_fuegos.geojson      (country !== 'ES')
// además: registra provincias no reconocidas en data/log.txt

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

// ======== Mapeo PROVINCIA → CCAA ========

// Normalizador: baja, quita tildes, quita signos, compacta espacios, gestiona "X, La/El/Les/Las"
function normalizeName(s) {
  if (!s) return "";
  let t = s
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // sin diacríticos

  // cambiar "palmas, las" -> "las palmas"
  t = t.replace(
    /^\s*([\w' ]+)\s*,\s*(la|el|los|las)\s*$/i,
    (_, base, art) => `${art} ${base}`
  );

  // normalizaciones leves
  t = t
    .replace(/\/|-/g, " ")
    .replace(/\s+/g, " ")
    .replace(/’/g, "'")
    .replace(/^\s+|\s+$/g, "");

  return t;
}

// Alias frecuentes → forma canónica
const provinceAliases = new Map([
  // --- BALEARES (islas) ---
  ["eivissa y formentera", "balears illes"],
  ["ibiza y formentera", "balears illes"],
  ["mallorca", "balears illes"],
  ["menorca", "balears illes"],

  // --- CANARIAS (islas) ---
  ["gran canaria", "las palmas"],
  ["lanzarote", "las palmas"],
  ["fuerteventura", "las palmas"],
  ["tenerife", "santa cruz de tenerife"],
  ["la palma", "santa cruz de tenerife"],
  ["la gomera", "santa cruz de tenerife"],
  ["el hierro", "santa cruz de tenerife"],

  // --- ASTURIAS (regiones internas que a veces aparecen) ---
  ["oriente", "asturias"],

  // --- GALICIA / VASCAS / CATALUÑA (bilingües y variantes) ---
  ["a coruna", "coruna a"],
  ["coruna a", "coruna a"],
  ["coruna", "coruna a"],
  ["la coruna", "coruna a"],

  ["alava", "araba alava"],
  ["araba", "araba alava"],
  ["araba/alava", "araba alava"],
  ["araba alava", "araba alava"],

  ["castellon", "castellon castello"],
  ["castello", "castellon castello"],
  ["castellon/castello", "castellon castello"],
  ["castellon castello", "castellon castello"],

  ["valencia", "valencia valencia"],
  ["valencia valencia", "valencia valencia"],

  ["alicante", "alicante alacant"],
  ["alicante alacant", "alicante alacant"],

  ["lleida", "lleida"],
  ["lerida", "lleida"],
  ["girona", "girona"],
  ["gerona", "girona"],

  ["bizkaia", "bizkaia"],
  ["vizcaya", "bizkaia"],
  ["gipuzkoa", "gipuzkoa"],
  ["guipuzcoa", "gipuzkoa"],

  ["palmas las", "las palmas"],
  ["las palmas", "las palmas"],
  ["santa cruz de tenerife", "santa cruz de tenerife"],

  ["rioja la", "la rioja"],
  ["la rioja", "la rioja"],

  // --- resto identidad (sin tildes) ---
  ["avila", "avila"],
  ["cadiz", "cadiz"],
  ["caceres", "caceres"],
  ["murcia", "murcia"],
  ["ourense", "ourense"],
  ["barcelona", "barcelona"],
  ["tarragona", "tarragona"],
  ["lugo", "lugo"],
  ["pontevedra", "pontevedra"],
  ["palencia", "palencia"],
  ["zamora", "zamora"],
  ["leon", "leon"],
  ["soria", "soria"],
  ["valladolid", "valladolid"],
  ["burgos", "burgos"],
  ["segovia", "segovia"],
  ["salamanca", "salamanca"],
  ["toledo", "toledo"],
  ["cuenca", "cuenca"],
  ["guadalajara", "guadalajara"],
  ["ciudad real", "ciudad real"],
  ["albacete", "albacete"],
  ["huesca", "huesca"],
  ["teruel", "teruel"],
  ["zaragoza", "zaragoza"],
  ["sevilla", "sevilla"],
  ["cordoba", "cordoba"],
  ["jaen", "jaen"],
  ["malaga", "malaga"],
  ["granada", "granada"],
  ["almeria", "almeria"],
  ["huelva", "huelva"],
  ["badajoz", "badajoz"],
  ["cantabria", "cantabria"],
  ["asturias", "asturias"],
  ["navarra", "navarra"],
  ["madrid", "madrid"],
  ["ceuta", "ceuta"],
  ["melilla", "melilla"],
]);

// Provincia canónica -> { ccaa_code, ccaa_name }
const provToCCAA = new Map([
  // 01 Andalucía
  ["almeria", { code: "01", name: "Andalucía" }],
  ["cadiz", { code: "01", name: "Andalucía" }],
  ["cordoba", { code: "01", name: "Andalucía" }],
  ["granada", { code: "01", name: "Andalucía" }],
  ["huelva", { code: "01", name: "Andalucía" }],
  ["jaen", { code: "01", name: "Andalucía" }],
  ["malaga", { code: "01", name: "Andalucía" }],
  ["sevilla", { code: "01", name: "Andalucía" }],

  // 02 Aragón
  ["huesca", { code: "02", name: "Aragón" }],
  ["teruel", { code: "02", name: "Aragón" }],
  ["zaragoza", { code: "02", name: "Aragón" }],

  // 03 Asturias
  ["asturias", { code: "03", name: "Asturias, Principado de" }],

  // 04 Illes Balears
  ["illes balears", { code: "04", name: "Balears, Illes" }],
  ["balears illes", { code: "04", name: "Balears, Illes" }],
  ["balears, illes", { code: "04", name: "Balears, Illes" }],
  ["islas baleares", { code: "04", name: "Balears, Illes" }],

  // 05 Canarias
  ["las palmas", { code: "05", name: "Canarias" }],
  ["santa cruz de tenerife", { code: "05", name: "Canarias" }],

  // 06 Cantabria
  ["cantabria", { code: "06", name: "Cantabria" }],

  // 07 Castilla y León
  ["avila", { code: "07", name: "Castilla y León" }],
  ["burgos", { code: "07", name: "Castilla y León" }],
  ["leon", { code: "07", name: "Castilla y León" }],
  ["palencia", { code: "07", name: "Castilla y León" }],
  ["salamanca", { code: "07", name: "Castilla y León" }],
  ["segovia", { code: "07", name: "Castilla y León" }],
  ["soria", { code: "07", name: "Castilla y León" }],
  ["valladolid", { code: "07", name: "Castilla y León" }],
  ["zamora", { code: "07", name: "Castilla y León" }],

  // 08 Castilla-La Mancha
  ["albacete", { code: "08", name: "Castilla - La Mancha" }],
  ["ciudad real", { code: "08", name: "Castilla - La Mancha" }],
  ["cuenca", { code: "08", name: "Castilla - La Mancha" }],
  ["guadalajara", { code: "08", name: "Castilla - La Mancha" }],
  ["toledo", { code: "08", name: "Castilla - La Mancha" }],

  // 09 Cataluña
  ["barcelona", { code: "09", name: "Cataluña" }],
  ["girona", { code: "09", name: "Cataluña" }],
  ["lleida", { code: "09", name: "Cataluña" }],
  ["tarragona", { code: "09", name: "Cataluña" }],

  // 10 Comunitat Valenciana
  ["alicante alacant", { code: "10", name: "Comunitat Valenciana" }],
  ["castellon castello", { code: "10", name: "Comunitat Valenciana" }],
  ["valencia valencia", { code: "10", name: "Comunitat Valenciana" }],

  // 11 Extremadura
  ["badajoz", { code: "11", name: "Extremadura" }],
  ["caceres", { code: "11", name: "Extremadura" }],

  // 12 Galicia
  ["coruna a", { code: "12", name: "Galicia" }],
  ["lugo", { code: "12", name: "Galicia" }],
  ["ourense", { code: "12", name: "Galicia" }],
  ["pontevedra", { code: "12", name: "Galicia" }],

  // 13 Madrid
  ["madrid", { code: "13", name: "Madrid, Comunidad de" }],

  // 14 Región de Murcia
  ["murcia", { code: "14", name: "Murcia, Región de" }],

  // 15 Navarra
  ["navarra", { code: "15", name: "Navarra, Comunidad Foral de" }],

  // 16 País Vasco
  ["araba alava", { code: "16", name: "País Vasco" }],
  ["gipuzkoa", { code: "16", name: "País Vasco" }],
  ["bizkaia", { code: "16", name: "País Vasco" }],

  // 17 La Rioja
  ["la rioja", { code: "17", name: "Rioja, La" }],

  // 18 Ceuta
  ["ceuta", { code: "18", name: "Ceuta" }],

  // 19 Melilla
  ["melilla", { code: "19", name: "Melilla" }],
]);

function provinceToCCAA(provRaw) {
  const norm = normalizeName(provRaw);
  let canonical = provinceAliases.get(norm) || norm;
  if (canonical === "balears") canonical = "balears illes";
  const hit = provToCCAA.get(canonical);
  return hit ? { ...hit, canonical } : null;
}

// ======== NUEVO: Reglas de sustitución de municipios ========
// - Match exacto (tal cual viene)
// - Match normalizado (sin tildes, minúsculas, etc.)
const munExactReplace = new Map([
  ["Rúa, A", "Larouco"],
  ["Benuza", "Llamas de Cabrera"],
  ["Veiga, A", "A Veiga"],
  ["Mezquita, A", "A Mezquita"],
  ["Vall d'Ebo, la", "Vall d'Ebo"],
  ["Guájares, Los", "Los Guájares"],
  ["Paso, El", "El Paso"],
  ["Tábara", "Losacio"],
]);

const munNormalizedReplace = new Map([
  [normalizeName("Rúa, A"), "Larouco"],
  [normalizeName("Benuza"), "Llamas de Cabrera"],
  [normalizeName("Veiga, A"), "A Veiga"],
  [normalizeName("Mezquita, A"), "A Mezquita"],
  [normalizeName("Vall d'Ebo, la"), "Vall d'Ebo"],
  [normalizeName("Guájares, Los"), "Los Guájares"],
  [normalizeName("Paso, El"), "El Paso"],
  [normalizeName("Tábara", "Losacio")],
]);

function fixMunicipio(munRaw) {
  if (!munRaw) return munRaw;
  if (munExactReplace.has(munRaw)) return munExactReplace.get(munRaw);
  const norm = normalizeName(munRaw);
  if (munNormalizedReplace.has(norm)) return munNormalizedReplace.get(norm);
  return munRaw;
}

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

  const firedate = parseDate(p.firedate ?? p.FIREDATE);
  const lastupdate = parseDate(p.lastupdate ?? p.LASTUPDATE);
  const area_ha = parseNumber(p.area_ha ?? p.AREA_HA);
  const country = p.country ?? p.COUNTRY ?? null;
  const prov = p.province ?? p.PROVINCE ?? null;

  // APLICAR REGLA DE MUNICIPIOS
  const munRaw = p.commune ?? p.COMMUNE ?? null;
  const mun = fixMunicipio(munRaw);

  const klass = p.class ?? p.CLASS ?? null;
  const fireyear = firedate ? dayjs.utc(firedate).year() : null;

  // ccaa solo si ES y hay provincia
  let ccaa_name = null;
  let ccaa_code = null;

  if (country === "ES" && prov) {
    const ccaa = provinceToCCAA(prov);
    if (ccaa) {
      ccaa_name = ccaa.name;
      ccaa_code = ccaa.code;
    }
  }

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
      ccaa: ccaa_name,
      ccaa_code,
    },
  };
}

// --- Main ---
async function main() {
  await fs.ensureDir(OUTPUT_DIR);

  const tmpDir = await fs.mkdtemp(path.join(process.cwd(), "tmp_effis_"));
  const zipPath = path.join(tmpDir, "effis.zip");

  // recolector de provincias no reconocidas
  const unknownProvs = new Set();

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

    // Limpieza + CCAA + FIX de municipios
    const cleaned = raw.map(toSnakeCaseProps).map((f) => {
      const cf = cleanFeature(f);
      // recolecta provincias ES sin ccaa (para log)
      if (
        cf.properties.country === "ES" &&
        cf.properties.prov &&
        !cf.properties.ccaa
      ) {
        unknownProvs.add(cf.properties.prov);
      }
      return cf;
    });

    // Agrupación por año
    const byYear = new Map(); // year -> { es: [], rest: [] }
    for (const feat of cleaned) {
      const y = feat.properties.fireyear;
      if (!Number.isInteger(y)) continue;
      if (!byYear.has(y)) byYear.set(y, { es: [], rest: [] });
      if (feat.properties.country === "ES") byYear.get(y).es.push(feat);
      else byYear.get(y).rest.push(feat);
    }

    const years = [...byYear.keys()].sort((a, b) => a - b);
    if (years.length === 0) {
      console.warn("No hay features con año válido para exportar.");
      return;
    }

    for (const y of years) {
      const { es, rest } = byYear.get(y);

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

    // ---- LOG de provincias desconocidas ----
    if (unknownProvs.size > 0) {
      const logPath = path.join(OUTPUT_DIR, "log.txt");
      const lines = [...unknownProvs]
        .sort()
        .map((p) => `Unmatched province: ${p}`);
      await fs.appendFile(logPath, lines.join("\n") + "\n");
      console.warn(`⚠ Provincias no reconocidas registradas en ${logPath}`);
    }
  } catch (err) {
    console.error("Error:", err.message || err);
    process.exitCode = 1;
  } finally {
    await fs.remove(tmpDir).catch(() => {});
  }
}

main();
