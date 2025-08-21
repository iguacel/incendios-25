#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import math
from pathlib import Path

import geopandas as gpd
from shapely.validation import make_valid as _make_valid
from shapely.geometry import Polygon, MultiPolygon, mapping
import svgwrite


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
    """Devuelve serie de área en hectáreas, usando EPSG:3035 si es necesario."""
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


def draw_geoms_to_svg_scaled(geoms, out_path: Path, cols=14, cell=64, margin=24,
                             fill="#000", stroke="#000", stroke_width=0.4,
                             label=False, font_size=8):
    """Dibuja geometrías respetando escala global (área relativa)."""
    n = len(geoms)
    if n == 0:
        raise SystemExit("No hay geometrías para dibujar.")
    rows = math.ceil(n / cols)

    width = margin * 2 + cols * cell
    height = margin * 2 + rows * cell
    dwg = svgwrite.Drawing(str(out_path), size=(width, height), profile="full")

    inner_pad = 4
    inner = cell - inner_pad * 2

    # Escala global (según mancha más grande)
    max_w = max(g.bounds[2] - g.bounds[0] for g in geoms if not g.is_empty)
    max_h = max(g.bounds[3] - g.bounds[1] for g in geoms if not g.is_empty)
    global_scale = min(inner / max_w, inner / max_h)

    for i, geom in enumerate(geoms):
        if geom.is_empty:
            continue

        r, c = i // cols, i % cols
        ox_cell = margin + c * cell + inner_pad
        oy_cell = margin + r * cell + inner_pad

        bounds = geom.bounds
        scale = global_scale  # mismo para todas

        polys = []
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
            d = path_from_polygon(poly, ox_cell, oy_cell, scale, bounds, flip_y=True)
            d_total.append(d)

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
            dwg.add(dwg.text(
                f"{rank}",
                insert=(ox_cell + 2, oy_cell + 2 + font_size),
                font_size=font_size,
                font_family="MarcinAntB, sans-serif",
                fill="#555"
            ))

    dwg.save()
    return width, height


def main():
    ap = argparse.ArgumentParser(description="Small multiples respetando escala de hectáreas (ES 2025).")
    ap.add_argument("--in", dest="inp", required=True, help="GeoJSON de entrada")
    ap.add_argument("--out", dest="out", required=True, help="SVG de salida")
    ap.add_argument("--cols", type=int, default=14, help="Número de columnas")
    ap.add_argument("--cell", type=int, default=64, help="Tamaño de celda en px")
    ap.add_argument("--margin", type=int, default=24, help="Margen exterior en px")
    ap.add_argument("--stroke", type=float, default=0.4, help="Grosor del trazo px")
    ap.add_argument("--label", action="store_true", help="Pinta numeritos de ranking")
    args = ap.parse_args()

    inp, out = Path(args.inp), Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)

    gdf = gpd.read_file(inp)
    if gdf.empty:
        raise SystemExit("El GeoJSON está vacío.")

    gdf = gdf.set_geometry(gdf.geometry.apply(make_valid))
    gdf = ensure_crs_4326(gdf)

    gdf["area_ha_final"] = compute_area_ha(gdf, area_col_hint="area_ha")
    gdf_sorted = gdf.sort_values("area_ha_final", ascending=False).reset_index(drop=True)
    gdf_aea = gdf_sorted.to_crs(3035)

    geoms = list(gdf_aea.geometry)
    w, h = draw_geoms_to_svg_scaled(
        geoms,
        out,
        cols=args.cols,
        cell=args.cell,
        margin=args.margin,
        stroke_width=args.stroke,
        label=args.label,
    )

    print(f"SVG escrito en: {out}  ({int(w)}×{int(h)} px)")
    print("Sugerencia: PDF vectorial -> `cairosvg {out} -o {out.with_suffix('.pdf')}`")


if __name__ == "__main__":
    main()
