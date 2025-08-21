#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import json
import sys
import pandas as pd
import geopandas as gpd

# --- CONFIG ---
PROV_PATH = "./data/geo/output/provincia.geojson"      # debe tener NAMEUNIT
FIRES_2025_PATH = "./data/ES_2025_fuegos.geojson"      # incendios 2025
OUT_JSON = "./data/output/provincias_burn_2025.json"   # para el puente Node
OUT_CSV  = "./data/output/provincias_burn_2025.csv"    # para inspección
SHEET_NAME = "provincias 2025"

# CRS para cálculo de áreas en m²: LAEA Europe
AREA_EPSG = 3035

def ensure_dir(path: str):
    os.makedirs(os.path.dirname(path), exist_ok=True)

def safe_make_valid(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    gdf = gdf.copy()
    gdf["geometry"] = gdf["geometry"].buffer(0)
    return gdf

def add_area_ha(gdf_ll: gpd.GeoDataFrame, epsg_area=AREA_EPSG, out_col="area_total_ha"):
    gdf_m = gdf_ll.to_crs(epsg=epsg_area)
    gdf_ll[out_col] = (gdf_m.geometry.area / 10000.0).values
    return gdf_ll

def filter_fires_min_ha(fires: gpd.GeoDataFrame, min_ha=30.0) -> gpd.GeoDataFrame:
    area_field = None
    for cand in ["area_ha", "AREA_HA", "areaHA", "area", "ha"]:
        if cand in fires.columns:
            area_field = cand
            break
    if area_field is None:
        # calcular geométricamente
        fires_m = fires.to_crs(epsg=AREA_EPSG)
        fires = fires.copy()
        fires["area_ha_geom"] = fires_m.geometry.area / 10000.0
        area_field = "area_ha_geom"
    return fires[fires[area_field] >= min_ha].copy()

def main():
    # 1) Provincias
    if not os.path.exists(PROV_PATH):
        raise FileNotFoundError(f"No existe {PROV_PATH}")
    if not os.path.exists(FIRES_2025_PATH):
        raise FileNotFoundError(f"No existe {FIRES_2025_PATH}")

    prov = gpd.read_file(PROV_PATH)
    if prov.crs is None:
        raise ValueError("provincia.geojson no tiene CRS definido")
    if "NAMEUNIT" not in prov.columns:
        raise ValueError("provincia.geojson debe contener el campo 'NAMEUNIT'")

    prov = safe_make_valid(prov)

    # Disolver por NAMEUNIT por robustez (por si hay multipartes)
    prov_diss = prov.dissolve(by="NAMEUNIT", as_index=False)
    prov_diss = safe_make_valid(prov_diss)
    prov_diss = add_area_ha(prov_diss, out_col="area_total_ha")

    # 2) Fuegos 2025 filtrados ≥ 30 ha
    fires = gpd.read_file(FIRES_2025_PATH)
    if fires.crs is None:
        raise ValueError("ES_2025_fuegos.geojson no tiene CRS definido")
    fires = safe_make_valid(fires)
    fires_big = filter_fires_min_ha(fires, min_ha=30.0)
    fires_big = safe_make_valid(fires_big)

    # 3) Overlay en CRS métrico
    prov_m  = prov_diss.to_crs(epsg=AREA_EPSG)
    fires_m = fires_big.to_crs(epsg=AREA_EPSG)

    inter = gpd.overlay(prov_m, fires_m, how="intersection", keep_geom_type=True)
    inter["burn_ha"] = inter.geometry.area / 10000.0

    # 4) Agregado por provincia
    burn_by_prov = inter.groupby("NAMEUNIT", as_index=False)["burn_ha"].sum()

    # 5) Join con superficies totales
    surface_df = prov_diss[["NAMEUNIT", "area_total_ha"]].copy()
    out = pd.merge(surface_df, burn_by_prov, on="NAMEUNIT", how="left").fillna({"burn_ha": 0.0})
    out["pct"] = (out["burn_ha"] / out["area_total_ha"]) * 100.0
    out = out.sort_values("pct", ascending=False).reset_index(drop=True)

    # 6) Formato para Sheets
    header = ["Provincia", "Nombre provincia", "Superficie total (ha)", "Superficie quemada (ha)", "Porcentaje %"]
    rows = []
    for _, r in out.iterrows():
        name = r["NAMEUNIT"]
        total = r["area_total_ha"]
        burn = r["burn_ha"]
        pct = r["pct"]
        rows.append([name, name, f"{total:.2f}", f"{burn:.2f}", f"{pct:.2f}"])

    data_for_sheet = [header] + rows

    # 7) Salidas
    ensure_dir(OUT_JSON)
    ensure_dir(OUT_CSV)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump({"sheetName": SHEET_NAME, "data": data_for_sheet}, f, ensure_ascii=False, indent=2)
    pd.DataFrame(rows, columns=header).to_csv(OUT_CSV, index=False)

    print(f"✅ Provincias listo. Filas: {len(rows)}")
    print(f"   JSON: {OUT_JSON}")
    print(f"   CSV : {OUT_CSV}")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
