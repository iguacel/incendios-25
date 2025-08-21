#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
from typing import Dict, List
import geopandas as gpd
import pandas as pd

# --- CONFIG ---
AUTONOMIAS_PATH = "./data/geo/output/autonomias.geojson"  # Debe contener NAMEUNIT
FIRES_TEMPLATE = "./data/ES_{year}_fuegos.geojson"        # GeoJSON anual
YEARS = list(range(2016, 2026))                           # 2016..2025
AREA_EPSG = 3035                                          # CRS métrico para áreas
OUT_CSV = "./data/output/evo_ccaa_2016_2025.csv"

def col(label: str) -> str:
    return f'<span style="font-weight:100">{label}</span>'

# Orden/columnas de salida (como en uno.csv)
DISPLAY_ORDER = [
    col("Andalucía"),
    col("Aragón"),
    col("Asturias"),
    col("Canarias"),
    col("Cantabria"),
    col("Castilla - La Mancha"),
    col("Castilla y León"),
    col("Cataluña"),
    col("Comunitat Valenciana"),
    col("Extremadura"),
    col("Galicia"),
    col("Madrid"),
    col("Murcia"),
    col("Navarra"),
    col("Illes Balears"),
    col("La Rioja"),
    col("País Vasco"),
]

# Entradas a ignorar (no van a Datawrapper en tu estructura)
IGNORE_UNITS = {
    "Ciudad Autónoma de Ceuta",
    "Ciudad Autónoma de Melilla",
    "Territorios no asociados a ninguna autonomía",
}

# Mapeo NAMEUNIT -> etiqueta de salida (con variantes y bilingües)
NAMEUNIT_TO_DISPLAY: Dict[str, str] = {
    "Andalucía": col("Andalucía"),
    "Aragón": col("Aragón"),
    "Principado de Asturias": col("Asturias"),
    "Asturias": col("Asturias"),
    "Canarias": col("Canarias"),
    "Cantabria": col("Cantabria"),
    "Castilla-La Mancha": col("Castilla - La Mancha"),
    "Castilla - La Mancha": col("Castilla - La Mancha"),
    "Castilla y León": col("Castilla y León"),
    "Cataluña": col("Cataluña"),
    "Catalunya": col("Cataluña"),
    "Cataluña/Catalunya": col("Cataluña"),           # <- añadido
    "Comunitat Valenciana": col("Comunitat Valenciana"),
    "Extremadura": col("Extremadura"),
    "Galicia": col("Galicia"),
    "Comunidad de Madrid": col("Madrid"),
    "Madrid": col("Madrid"),
    "Región de Murcia": col("Murcia"),
    "Murcia": col("Murcia"),
    "Comunidad Foral de Navarra": col("Navarra"),
    "Navarra": col("Navarra"),
    "Illes Balears": col("Illes Balears"),
    "Islas Baleares": col("Illes Balears"),
    "La Rioja": col("La Rioja"),
    "País Vasco": col("País Vasco"),
    "Euskadi": col("País Vasco"),
    "País Vasco/Euskadi": col("País Vasco"),         # <- añadido
}

def ensure_dir(path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)

def safe_make_valid(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    gdf = gdf.copy()
    gdf["geometry"] = gdf["geometry"].buffer(0)
    return gdf

def add_area_ha(gdf_ll: gpd.GeoDataFrame, epsg_area=AREA_EPSG, out_col="area_ha"):
    gdf_m = gdf_ll.to_crs(epsg=epsg_area)
    gdf_ll[out_col] = (gdf_m.geometry.area / 10000.0).values
    return gdf_ll

def filter_fires_min_ha(fires: gpd.GeoDataFrame, min_ha=30.0) -> gpd.GeoDataFrame:
    field = next((c for c in ["area_ha", "AREA_HA", "areaHA", "area", "ha"] if c in fires.columns), None)
    if field is None:
        fires = add_area_ha(fires, out_col="area_ha_calc")
        field = "area_ha_calc"
    return fires[fires[field] >= min_ha].copy()

def map_nameunit_to_label(name: str) -> str:
    """Devuelve etiqueta DISPLAY o None si debe ignorarse."""
    if name in IGNORE_UNITS:
        return None
    if name in NAMEUNIT_TO_DISPLAY:
        return NAMEUNIT_TO_DISPLAY[name]
    # Si viene en forma bilingüe "A/B" y alguna parte mapea, úsala.
    if "/" in name:
        parts = [p.strip() for p in name.split("/")]
        for p in parts:
            if p in NAMEUNIT_TO_DISPLAY:
                return NAMEUNIT_TO_DISPLAY[p]
    return None  # si no mapea, preferimos no colarlo

def compute_year(year: int, ccaa_diss: gpd.GeoDataFrame) -> pd.Series:
    fires_path = FIRES_TEMPLATE.format(year=year)
    if not os.path.exists(fires_path):
        raise FileNotFoundError(f"No existe {fires_path}")

    fires = gpd.read_file(fires_path)
    if fires.crs is None:
        raise ValueError(f"{fires_path} no tiene CRS definido")
    fires = safe_make_valid(fires)
    fires_big = filter_fires_min_ha(fires, 30.0)
    fires_big = safe_make_valid(fires_big)
    if fires_big.empty:
        return pd.Series({label: 0 for label in DISPLAY_ORDER})

    ccaa_m  = ccaa_diss.to_crs(epsg=AREA_EPSG)
    fires_m = fires_big.to_crs(epsg=AREA_EPSG)
    inter = gpd.overlay(ccaa_m, fires_m, how="intersection", keep_geom_type=True)
    if inter.empty:
        return pd.Series({label: 0 for label in DISPLAY_ORDER})

    inter["burn_ha"] = inter.geometry.area / 10000.0
    grouped = inter.groupby("LABEL", as_index=False)["burn_ha"].sum()

    s = grouped.set_index("LABEL")["burn_ha"].reindex(DISPLAY_ORDER).fillna(0.0)
    return s

def main():
    if not os.path.exists(AUTONOMIAS_PATH):
        raise FileNotFoundError(f"No existe {AUTONOMIAS_PATH}")

    ccaa = gpd.read_file(AUTONOMIAS_PATH)
    if ccaa.crs is None:
        raise ValueError("autonomias.geojson no tiene CRS definido")
    if "NAMEUNIT" not in ccaa.columns:
        raise ValueError("autonomias.geojson debe contener el campo 'NAMEUNIT'")

    ccaa = safe_make_valid(ccaa)

    # Aplicar mapping / ignorar entradas
    ccaa["LABEL"] = ccaa["NAMEUNIT"].apply(map_nameunit_to_label)
    # Avisos de lo que ignoramos (opcional)
    ignored = ccaa[ccaa["LABEL"].isna()]["NAMEUNIT"].unique().tolist()
    if ignored:
        print("ℹ️  Ignoradas por diseño (fuera del dataset destino):", ignored, file=sys.stderr)

    # Quedarnos solo con las que están en DISPLAY_ORDER
    ccaa_keep = ccaa[ccaa["LABEL"].isin(DISPLAY_ORDER)].copy()
    if ccaa_keep.empty:
        raise RuntimeError("No quedaron CCAA válidas tras el mapping.")

    # Disolver por LABEL
    ccaa_diss = ccaa_keep.dissolve(by="LABEL", as_index=False)
    ccaa_diss = safe_make_valid(ccaa_diss)

    # Tabla año a año
    rows: List[dict] = []
    for y in YEARS:
        print(f"-> Año {y}")
        s = compute_year(y, ccaa_diss)
        row = {"fireyear": y}
        row.update({label: float(s[label]) for label in DISPLAY_ORDER})
        rows.append(row)

    df = pd.DataFrame(rows, columns=["fireyear"] + DISPLAY_ORDER)
    ensure_dir(OUT_CSV)
    df.to_csv(OUT_CSV, index=False, float_format="%.0f")  # entero en ha como en uno.csv
    print(f"✅ Guardado CSV: {OUT_CSV}")
    print(df.head(3).to_string(index=False))

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
