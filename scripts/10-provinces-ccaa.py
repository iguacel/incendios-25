#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
from typing import List
import geopandas as gpd
import pandas as pd

TASKS = [
    {
        "inputs": [
            "./data/geo/recintos_autonomicas_inspire_peninbal_etrs89.shp",
            "./data/geo/recintos_autonomicas_inspire_canarias_regcan95.shp",
        ],
        "output": "./data/geo/output/autonomias.geojson",
    },
    {
        "inputs": [
            "./data/geo/recintos_provinciales_inspire_peninbal_etrs89.shp",
            "./data/geo/recintos_provinciales_inspire_canarias_regcan95.shp",
        ],
        "output": "./data/geo/output/provincia.geojson",
    },
    {
        "inputs": [
            "./data/geo/recintos_municipales_inspire_peninbal_etrs89.shp",
            "./data/geo/recintos_municipales_inspire_canarias_regcan95.shp",
        ],
        "output": "./data/geo/output/municipios.geojson",
    },
]

TARGET_EPSG = 4326  # WGS84 lon/lat


def check_exists(path: str) -> None:
    if not os.path.exists(path):
        raise FileNotFoundError(f"No se encuentra el archivo: {path}")


def load_and_to_crs(path: str, epsg: int) -> gpd.GeoDataFrame:
    """Carga un SHP y reproyecta a EPSG indicado. Falla si el CRS de origen no está definido."""
    check_exists(path)
    gdf = gpd.read_file(path)
    if gdf.crs is None:
        raise ValueError(
            f"El shapefile no tiene CRS definido: {path}\n"
            f"Solución: asígnale su CRS original (por ej. gdf.set_crs('EPSG:25830', inplace=True)) y vuelve a ejecutar."
        )
    if gdf.crs.to_epsg() != epsg:
        gdf = gdf.to_crs(epsg=epsg)
    return gdf


def align_columns(gdfs: List[gpd.GeoDataFrame]) -> List[gpd.GeoDataFrame]:
    """Alinea columnas entre GeoDataFrames (unión de columnas, rellena faltantes con NA)."""
    all_cols = set()
    for g in gdfs:
        all_cols.update(g.columns)
    # Asegurarse de que 'geometry' va al final (GeoPandas lo maneja, pero ordenamos para limpieza)
    all_cols = [c for c in sorted(all_cols) if c != "geometry"] + ["geometry"]
    aligned = []
    for g in gdfs:
        # reindex asegura que todas tengan las mismas columnas
        aligned.append(g.reindex(columns=all_cols))
    return aligned


def merge_and_export(inputs: List[str], output: str, epsg: int = TARGET_EPSG) -> None:
    print(f"-> Procesando {output}")
    gdfs = []
    for p in inputs:
        g = load_and_to_crs(p, epsg)
        crs_str = g.crs.to_string() if g.crs is not None else "None"
        print(f"   leído {p} | CRS→ {crs_str} | features: {len(g)}")
        gdfs.append(g)

    gdfs = align_columns(gdfs)

    merged = gpd.GeoDataFrame(pd.concat(gdfs, ignore_index=True), crs=f"EPSG:{epsg}")

    # Carpeta salida
    os.makedirs(os.path.dirname(output), exist_ok=True)

    # Exportar GeoJSON (sin índice)
    merged.to_file(output, driver="GeoJSON")
    print(f"   Guardado: {output} | total features: {len(merged)} | CRS: EPSG:{epsg}")


def main():
    for task in TASKS:
        merge_and_export(task["inputs"], task["output"], TARGET_EPSG)
    print(">>> Todo terminado ✅")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\nERROR: {e}", file=sys.stderr)
        sys.exit(1)
