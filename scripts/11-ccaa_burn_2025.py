#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import json
import math
import pandas as pd
import geopandas as gpd
from shapely.geometry import Polygon, MultiPolygon

# --- CONFIG ---
AUTONOMIAS_PATH = "./data/geo/output/autonomias.geojson"       # debe tener NAMEUNIT
FIRES_2025_PATH = "./data/ES_2025_fuegos.geojson"               # debe tener geometrías de incendios
OUT_JSON = "./data/output/autonomias_burn_2025.json"            # salida para el Node bridge
OUT_CSV  = "./data/output/autonomias_burn_2025.csv"             # por si quieres mirar
SHEET_NAME = "autonomías 2025"                                   # nombre de la pestaña en Sheets

# EPSG de cálculo de áreas (Europa LAEA, buena para España)
AREA_EPSG = 3035

# --- UTILS ---
def ensure_dir(path: str):
    os.makedirs(os.path.dirname(path), exist_ok=True)

def safe_make_valid(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    # Arregla geometrías no válidas (buffer(0) estilo shapely)
    gdf = gdf.copy()
    gdf["geometry"] = gdf["geometry"].buffer(0)
    return gdf

def add_area_ha(gdf_ll: gpd.GeoDataFrame, epsg_area=AREA_EPSG, out_col="area_ha_geom"):
    """Añade columna de área en hectáreas calculada geométricamente reproyectando a epsg_area."""
    gdf_m = gdf_ll.to_crs(epsg=epsg_area)
    areas = gdf_m.geometry.area / 10000.0  # m² -> ha
    gdf_ll[out_col] = areas.values
    return gdf_ll

def filter_fires_min_ha(fires: gpd.GeoDataFrame, min_ha=30.0):
    # Si existe 'area_ha', la utilizamos; si no, calculamos
    area_field = None
    for cand in ["area_ha", "AREA_HA", "areaHA", "area", "ha"]:
        if cand in fires.columns:
            area_field = cand
            break

    if area_field is None:
        fires = add_area_ha(fires, out_col="area_ha_geom")
        area_field = "area_ha_geom"

    return fires[fires[area_field] >= min_ha].copy()

# --- MAIN ---
def main():
    # 1) Cargar autonomías y disolver por NAMEUNIT
    if not os.path.exists(AUTONOMIAS_PATH):
        raise FileNotFoundError(f"No existe {AUTONOMIAS_PATH}")
    if not os.path.exists(FIRES_2025_PATH):
        raise FileNotFoundError(f"No existe {FIRES_2025_PATH}")

    ccaa = gpd.read_file(AUTONOMIAS_PATH)
    if "NAMEUNIT" not in ccaa.columns:
        raise ValueError("autonomias.geojson debe contener el campo 'NAMEUNIT'")

    # Normalizamos a 4326 si fuese necesario antes de medir
    if ccaa.crs is None:
        raise ValueError("autonomias.geojson no tiene CRS definido")
    ccaa = safe_make_valid(ccaa)

    # Disolver por NAMEUNIT (por si hay multiparte/islas)
    ccaa_diss = ccaa.dissolve(by="NAMEUNIT", as_index=False)
    ccaa_diss = safe_make_valid(ccaa_diss)

    # Área total por autonomía (en ha)
    ccaa_diss = add_area_ha(ccaa_diss, out_col="area_total_ha")

    # 2) Cargar fuegos, filtrar ≥30 ha
    fires = gpd.read_file(FIRES_2025_PATH)
    if fires.crs is None:
        raise ValueError("ES_2025_fuegos.geojson no tiene CRS definido")
    fires = safe_make_valid(fires)
    fires_big = filter_fires_min_ha(fires, min_ha=30.0)
    fires_big = safe_make_valid(fires_big)

    # 3) Intersección fuegos≥30ha × autonomías
    #   Para medir áreas con precisión, hacemos overlay en un CRS métrico
    ccaa_m = ccaa_diss.to_crs(epsg=AREA_EPSG)
    fires_m = fires_big.to_crs(epsg=AREA_EPSG)

    inter = gpd.overlay(ccaa_m, fires_m, how="intersection", keep_geom_type=True)
    # Área quemada en intersecciones (ha)
    inter["burn_ha"] = inter.geometry.area / 10000.0

    # 4) Agregado por autonomía (NAMEUNIT)
    burn_by_ccaa = inter.groupby("NAMEUNIT", as_index=False)["burn_ha"].sum()

    # 5) Unir con superficies totales
    #    Ojo: ccaa_m tiene la geometría en 3035; el área total está en ccaa_diss['area_total_ha'] (calculada ya)
    #    Usamos el dataframe de atributos de ccaa_diss para coger area_total_ha.
    surface_df = ccaa_diss[["NAMEUNIT", "area_total_ha"]].copy()

    out = pd.merge(surface_df, burn_by_ccaa, on="NAMEUNIT", how="left").fillna({"burn_ha": 0.0})
    out["pct"] = (out["burn_ha"] / out["area_total_ha"]) * 100.0
    # Orden por % descendente, por ejemplo
    out = out.sort_values("pct", ascending=False).reset_index(drop=True)

    # 6) Formateo para Google Sheets
    # Columnas solicitadas:
    # CCAA | Nombre autonomía | Superficie total (ha) | Superficie quemada (ha) | Porcentaje %
    header = ["CCAA", "Nombre autonomía", "Superficie total (ha)", "Superficie quemada (ha)", "Porcentaje %"]
    rows = []
    for _, r in out.iterrows():
        name = r["NAMEUNIT"]
        total = r["area_total_ha"]
        burn = r["burn_ha"]
        pct = r["pct"]
        rows.append([
            name,                     # CCAA
            name,                     # Nombre autonomía (si quieres otra etiqueta, dime el campo)
            f"{total:.2f}",
            f"{burn:.2f}",
            f"{pct:.2f}",
        ])

    data_for_sheet = [header] + rows

    # 7) Guardar en local (por si quieres revisar/versionar)
    ensure_dir(OUT_JSON)
    ensure_dir(OUT_CSV)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump({"sheetName": SHEET_NAME, "data": data_for_sheet}, f, ensure_ascii=False, indent=2)
    pd.DataFrame(rows, columns=header[0:5]).to_csv(OUT_CSV, index=False)

    print(f"✅ Listo. Filas: {len(rows)}")
    print(f"   JSON: {OUT_JSON}")
    print(f"   CSV : {OUT_CSV}")

if __name__ == "__main__":
    main()
