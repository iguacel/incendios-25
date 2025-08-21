#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import math
from pathlib import Path
from datetime import datetime, timezone

import geopandas as gpd
import pandas as pd
from shapely.validation import make_valid as _make_valid
from shapely.geometry import Polygon, MultiPolygon, mapping
import svgwrite


# ---------- util geom ----------

def make_valid(geom):
    try:
        return _make_valid(geom)
    except Exception:
        try:
            return geom.buffer(0)
        except Exception:
            return geom


def ensure_crs_4326(gdf):
    """Si el GeoDataFrame no tiene CRS, asumimos EPSG:4326 (GeoJSON por defecto)."""
    return gdf.set_crs(4326) if gdf.crs is None else gdf


def compute_area_ha(gdf, area_col_hint="area_ha"):
    """
    Devuelve serie de área en hectáreas, usando el campo 'area_ha' si existe y es válido.
    Si faltan algunos valores, calcula en EPSG:3035 (LAEA Europe).
    """
    gdf = ensure_crs_4326(gdf)
    if area_col_hint in gdf.columns and gdf[area_col_hint].notna().any():
        out = gdf[area_col_hint].copy()
        missing = out.isna()
        if missing.any():
            aea = (gdf.loc[missing].to_crs(3035).geometry.area / 10_000.0)
            out.loc[missing] = aea
        return out.astype(float)
    else:
        return (gdf.to_crs(3035).geometry.area / 10_000.0).astype(float)


# ---------- svg helpers ----------

def path_from_polygon(poly: Polygon, ox: float, oy: float, scale: float,
                      bounds: tuple, flip_y=True, precision=2) -> str:
    minx, miny, maxx, maxy = bounds

    def fmt(x): return f"{x:.{precision}f}"

    def transform(x, y):
        X = (x - minx) * scale + ox
        Yraw = (y - miny) * scale + oy
        return (X, (oy + (maxy - miny) * scale - (Yraw - oy)) if flip_y else Yraw)

    def ring_to_cmds(coords):
        cmds, first = [], True
        for (x, y) in coords:
            X, Y = transform(x, y)
            cmds.append(("M" if first else "L", X, Y))
            first = False
        cmds.append(("Z", None, None))
        return cmds

    d_parts = []
    ext = list(poly.exterior.coords)
    for cmd, X, Y in ring_to_cmds(ext):
        d_parts.append("Z" if cmd == "Z" else f"{cmd} {fmt(X)} {fmt(Y)}")

    for hole in poly.interiors:
        for cmd, X, Y in ring_to_cmds(list(hole.coords)):
            d_parts.append("Z" if cmd == "Z" else f"{cmd} {fmt(X)} {fmt(Y)}")

    return " ".join(d_parts)


# ---------- color rules ----------

COLOR_2025 = "#fac4c5"
COLOR_RECENT = "#a80127"  # firedate >= cutoff
COLOR_DEFAULT = "#d8d0d0"

def parse_firedate(val):
    """
    Devuelve datetime con tz UTC si hay valor ISO; None si no es parseable.
    """
    if val is None or val == "":
        return None
    try:
        # pandas maneja bien 'Z' y milisegundos
        ts = pd.to_datetime(val, utc=True)
        if pd.isna(ts):
            return None
        return ts.to_pydatetime()
    except Exception:
        return None

def pick_color(row, cutoff_dt_utc):
    """
    Prioridad:
      1) firedate >= 2025-08-08 → COLOR_RECENT  (incluye el día 8)
      2) fireyear == 2025       → COLOR_2025
      3) resto                  → COLOR_DEFAULT
    """
    fd = parse_firedate(row.get("firedate"))
    if fd is not None:
        # asegurar tz-aware (UTC)
        if fd.tzinfo is None:
            fd = fd.replace(tzinfo=timezone.utc)
        if fd >= cutoff_dt_utc:   # <-- incluye el propio día 8
            return COLOR_RECENT
    if int(row.get("fireyear")) == 2025:
        return COLOR_2025
    return COLOR_DEFAULT


# ---------- draw ----------

def draw_geoms_to_svg_scaled(gdf, out_path: Path, cols=14, cell=64, margin=24,
                             stroke="", stroke_width=0,
                             label=False, font_size=7):
    """
    Dibuja geometrías con escala GLOBAL (comparables en área), en rejilla.
    Colorea cada feature según reglas (firedate / fireyear).
    Etiqueta: rank, mun, prov, ccaa, fireyear (si label=True).
    """
    geoms = list(gdf.geometry)
    n = len(geoms)
    if n == 0:
        raise SystemExit("No hay geometrías para dibujar.")
    rows = math.ceil(n / cols)

    width = margin * 2 + cols * cell
    height = margin * 2 + rows * cell
    dwg = svgwrite.Drawing(str(out_path), size=(width, height), profile="full")

    inner_pad = 4
    inner = cell - inner_pad * 2

    # Escala global a partir de todas las geometrías
    max_w = max(g.bounds[2] - g.bounds[0] for g in geoms if not g.is_empty)
    max_h = max(g.bounds[3] - g.bounds[1] for g in geoms if not g.is_empty)
    global_scale = min(inner / max_w, inner / max_h)

    # cutoff: 2025-08-08 00:00:00Z
    cutoff_dt_utc = datetime(2025, 8, 8, 0, 0, 0, tzinfo=timezone.utc)

    for i, geom in enumerate(geoms):
        if geom.is_empty:
            continue

        r, c = i // cols, i % cols
        ox_cell = margin + c * cell + inner_pad
        oy_cell = margin + r * cell + inner_pad
        bounds = geom.bounds
        scale = global_scale

        # path (admite MultiPolygon)
        if isinstance(geom, Polygon):
            polys = [geom]
        elif isinstance(geom, MultiPolygon):
            polys = list(geom.geoms)
        else:
            mapped = mapping(geom)
            if mapped.get("type") == "Polygon":
                polys = [geom]
            elif mapped.get("type") == "MultiPolygon":
                polys = list(geom.geoms)
            else:
                continue

        d_total = []
        for poly in polys:
            d_total.append(path_from_polygon(poly, ox_cell, oy_cell, scale, bounds, flip_y=True))

        # color por reglas
        fill = pick_color(gdf.iloc[i], cutoff_dt_utc)

        path = dwg.path(
            d=" ".join(d_total),
            fill=fill,
            stroke=stroke,
            stroke_width=stroke_width,
            fill_rule="evenodd",
            style="vector-effect:non-scaling-stroke",
        )
        dwg.add(path)

        if label:
            rank = i + 1
            mun = gdf.iloc[i].get("mun", "—")
            prov = gdf.iloc[i].get("prov", "—")
            ccaa = gdf.iloc[i].get("ccaa", "—")
            fireyear = gdf.iloc[i].get("fireyear", "—")
            ha = gdf.iloc[i].get("area_ha", "—")

            # 5 líneas muy compactas
            y0 = oy_cell + 2 + font_size
            dy = font_size * 1.2

            dwg.add(dwg.text(
                f"{mun}",
                insert=(ox_cell + 2, y0),
                font_size=font_size,
                font_family="MarcinAntB, sans-serif",
                fill="#444"
            ))
            dwg.add(dwg.text(
                f"{prov}",
                insert=(ox_cell + 2, y0 + dy),
                font_size=font_size,
                font_family="MarcinAntB, sans-serif",
                fill="#222"
            ))
            dwg.add(dwg.text(
                f"{ha}",
                insert=(ox_cell + 2, y0 + dy * 2),
                font_size=font_size,
                font_family="MarcinAntB, sans-serif",
                fill="#222"
            ))
            dwg.add(dwg.text(
                f"{ccaa}",
                insert=(ox_cell + 2, y0 + dy * 3),
                font_size=font_size,
                font_family="MarcinAntB, sans-serif",
                fill="#000"
            ))
            dwg.add(dwg.text(
                f"{fireyear}",
                insert=(ox_cell + 2, y0 + dy * 4),
                font_size=font_size,
                font_family="MarcinAntB, sans-serif",
                fill="#000"
            ))

    dwg.save()
    return width, height


# ---------- main ----------

def find_es_geojsons(data_dir: Path, min_year=2016):
    files = []
    for p in sorted(data_dir.glob("ES_*_fuegos.geojson")):
        try:
            # Nombre esperado: ES_YYYY_fuegos.geojson
            year = int(p.name.split("_")[1])
            if year >= min_year:
                files.append((year, p))
        except Exception:
            continue
    files.sort(key=lambda x: x[0])
    return files


def main():
    ap = argparse.ArgumentParser(
        description="Small multiples (2016+) con escala real, filtrado por área y coloreado por reglas de fecha/año."
    )
    ap.add_argument("--data", default="data", help="Directorio con ES_YYYY_fuegos.geojson")
    ap.add_argument("--out", required=True, help="SVG de salida")
    ap.add_argument("--min-ha", type=float, default=500.0, help="Mínimo de hectáreas para incluir (>=)")
    ap.add_argument("--cols", type=int, default=14, help="Número de columnas")
    ap.add_argument("--cell", type=int, default=64, help="Tamaño de celda en px")
    ap.add_argument("--margin", type=int, default=24, help="Margen exterior en px")
    ap.add_argument("--stroke", type=float, default=0.0, help="Grosor del trazo px")
    ap.add_argument("--label", action="store_true", help="Pinta rank, mun, prov, ccaa, fireyear (tamaño pequeño)")
    args = ap.parse_args()

    data_dir = Path(args.data)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)

    files = find_es_geojsons(data_dir, min_year=2016)
    if not files:
        raise SystemExit(f"No se encontraron ES_YYYY_fuegos.geojson >= 2016 en {data_dir}")

    # Leer y concatenar
    gdfs = []
    for year, pathfile in files:
        gdf = gpd.read_file(pathfile)
        if gdf.empty:
            continue
        gdf["__source_year"] = year  # por si hace falta
        gdfs.append(gdf)

    if not gdfs:
        raise SystemExit("No hay datos válidos en los ficheros encontrados.")

    gdf_all = gpd.pd.concat(gdfs, ignore_index=True)
    gdf_all = gdf_all.set_geometry(gdf_all.geometry.apply(make_valid))
    gdf_all = ensure_crs_4326(gdf_all)

    # área final
    gdf_all["area_ha_final"] = compute_area_ha(gdf_all, area_col_hint="area_ha")

    # filtro por área (excluye < min_ha)
    gdf_big = gdf_all[gdf_all["area_ha_final"] >= float(args.min_ha)].copy()
    if gdf_big.empty:
        raise SystemExit(f"No hay incendios con area_ha >= {args.min_ha} ha.")

    # ordenar desc por área
    gdf_big.sort_values("area_ha_final", ascending=False, inplace=True)
    gdf_big.reset_index(drop=True, inplace=True)

    # proyección para dibujar
    gdf_aea = gdf_big.to_crs(3035)

    # dibujar
    w, h = draw_geoms_to_svg_scaled(
        gdf_aea,
        out,
        cols=args.cols,
        cell=args.cell,
        margin=args.margin,
        stroke_width=args.stroke,
        label=args.label,
        font_size=7,
    )

    print(f"SVG escrito en: {out}  ({int(w)}×{int(h)} px)")
    print("Colores: >=2025-08-08 → #a80127 | year==2025 → #fac4c5 | resto → #d8d0d0")


if __name__ == "__main__":
    main()
