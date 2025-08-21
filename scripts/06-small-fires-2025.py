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


# ---------- helpers de formato/fechas ----------

MESES_ES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
]

def format_es_number(num, dec=0):
    """Formateo español sencillo para números (miles con punto)."""
    if num is None or pd.isna(num):
        return ""
    n = round(float(num), dec)
    if dec == 0:
        s = f"{int(n):,}"
        return s.replace(",", ".")
    else:
        s = f"{n:,.{dec}f}".replace(",", "X").replace(".", ",").replace("X", ".")
        return s

def isoformat_z(dt: datetime) -> str:
    """ISO con milisegundos y sufijo 'Z' en UTC."""
    if dt is None:
        return ""
    dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

def firedate_show_es(dt: datetime) -> str:
    """'08 de agosto' (día con cero inicial + mes en minúsculas)."""
    if dt is None:
        return ""
    dt = dt.astimezone(timezone.utc)
    dia = dt.strftime("%d")
    mes = MESES_ES[dt.month - 1]
    return f"{dia} de {mes}"

def parse_firedate(val):
    """Devuelve datetime con tz UTC si hay valor ISO; None si no es parseable."""
    if val is None or val == "":
        return None
    try:
        ts = pd.to_datetime(val, utc=True)
        if pd.isna(ts):
            return None
        return ts.to_pydatetime()
    except Exception:
        return None

def safe_int(val, default=None):
    try:
        if pd.isna(val):
            return default
        return int(str(val).strip())
    except Exception:
        return default


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


# ---------- colores (solo dos categorías para 2025) ----------

COLOR_ROSA = "#fac4c5"     # Antes del 8 de agosto
COLOR_GRANATE = "#a80127"  # Desde el 8 de agosto (incluido)

def pick_color_2025(row, cutoff_dt_utc):
    """
    Solo dos reglas:
      - firedate >= 2025-08-08 → GRANATE
      - firedate  < 2025-08-08 → ROSA
    Si no hay fecha, cae en ROSA por seguridad.
    """
    fd = parse_firedate(row.get("firedate"))
    if fd is not None:
        if fd.tzinfo is None:
            fd = fd.replace(tzinfo=timezone.utc)
        if fd >= cutoff_dt_utc:
            return COLOR_GRANATE
    return COLOR_ROSA


# ---------- draw (SVG gigante) ----------

def draw_geoms_to_svg_scaled(
    gdf,
    out_path: Path,
    cols=14,
    cell=64,
    margin=24,
    stroke="",
    stroke_width=0,
    label=False,
    font_size=7,
    cutoff_dt_utc=None
):
    """
    Dibuja geometrías con escala GLOBAL (comparables en área), en rejilla.
    Colorea cada feature con la regla 2025 (granate/rosa por fecha).
    Etiqueta (opcional): mun, prov, ha, ccaa, fireyear.
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
    global_scale = min(inner / max_w, inner / max_h) if max_w > 0 and max_h > 0 else 1.0

    # cutoff fijo: 2025-08-08 00:00:00Z (si no viene de fuera)
    if cutoff_dt_utc is None:
        cutoff_dt_utc = datetime(2025, 8, 8, 0, 0, 0, tzinfo=timezone.utc)

    for i, geom in enumerate(geoms):
        if geom.is_empty:
            continue

        r, c = i // cols, i % cols
        ox_cell = margin + c * cell + inner_pad
        oy_cell = margin + r * cell + inner_pad

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

        bounds = geom.bounds
        d_total = []
        for poly in polys:
            d_total.append(
                path_from_polygon(poly, ox_cell, oy_cell, global_scale, bounds, flip_y=True)
            )

        # color 2-categorías 2025
        fill = pick_color_2025(gdf.iloc[i], cutoff_dt_utc)

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
            mun = gdf.iloc[i].get("mun", "—")
            prov = gdf.iloc[i].get("prov", "—")
            ccaa = gdf.iloc[i].get("ccaa", "—")
            fireyear = gdf.iloc[i].get("fireyear", "—")
            ha = gdf.iloc[i].get("area_ha_final", "—")

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
                f"{format_es_number(ha, 0)} ha",
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


# ---------- lectura 2025 ----------

def find_es_2025(data_dir: Path) -> Path:
    """Devuelve la ruta a ES_2025_fuegos.geojson (error si no existe)."""
    matches = sorted(data_dir.glob("ES_2025_fuegos.geojson"))
    if not matches:
        raise SystemExit(f"No se encontró ES_2025_fuegos.geojson en {data_dir}")
    return matches[0]


# ---------- main ----------

def main():
    ap = argparse.ArgumentParser(
        description="SVG(s) de incendios 2025: dos colores (>=8 de agosto granate, resto rosa). Ordena por hectáreas y genera 1 SVG con todo y 2 SVGs filtrados."
    )
    ap.add_argument("--data", default="data", help="Directorio con ES_2025_fuegos.geojson")
    ap.add_argument("--out", required=True, help="SVG de salida (todos)")
    ap.add_argument("--out-granates", default=None, help="SVG solo granates (>= 2025-08-08)")
    ap.add_argument("--out-rosas", default=None, help="SVG solo rosas (< 2025-08-08)")
    ap.add_argument("--min-ha", type=float, default=0.0, help="Mínimo de hectáreas para incluir (>=). Por defecto 0.")
    ap.add_argument("--cols", type=int, default=14, help="Número de columnas")
    ap.add_argument("--cell", type=int, default=64, help="Tamaño de celda en px")
    ap.add_argument("--margin", type=int, default=24, help="Margen exterior en px")
    ap.add_argument("--stroke", type=float, default=0.0, help="Grosor del trazo px")
    ap.add_argument("--label", action="store_true", help="Pinta etiquetas pequeñas (mun, prov, ha, ccaa, fireyear)")
    args = ap.parse_args()

    data_dir = Path(args.data)
    out_all = Path(args.out)
    out_all.parent.mkdir(parents=True, exist_ok=True)

    # Si no se especifican, derivar nombres a partir de --out
    if args.out_granates is None:
        out_gran = out_all.with_name(out_all.stem + "_granates" + out_all.suffix)
    else:
        out_gran = Path(args.out_granates)
        out_gran.parent.mkdir(parents=True, exist_ok=True)

    if args.out_rosas is None:
        out_rosa = out_all.with_name(out_all.stem + "_rosas" + out_all.suffix)
    else:
        out_rosa = Path(args.out_rosas)
        out_rosa.parent.mkdir(parents=True, exist_ok=True)

    # Leer SOLO 2025
    file_2025 = find_es_2025(data_dir)
    gdf = gpd.read_file(file_2025)
    if gdf.empty:
        raise SystemExit("El GeoJSON de 2025 no tiene datos.")

    # Geometrías válidas y CRS
    gdf = gdf.set_geometry(gdf.geometry.apply(make_valid))
    gdf = ensure_crs_4326(gdf)

    # Área final para ordenar
    gdf["area_ha_final"] = compute_area_ha(gdf, area_col_hint="area_ha")

    # Filtro por área (opcional)
    gdf = gdf[gdf["area_ha_final"] >= float(args.min_ha)].copy()
    if gdf.empty:
        raise SystemExit(f"No hay incendios con area_ha >= {args.min_ha} ha en 2025.")

    # Orden global por hectáreas (desc)
    gdf.sort_values("area_ha_final", ascending=False, inplace=True)
    gdf.reset_index(drop=True, inplace=True)

    # Pasar a proyección métrica para dibujar proporciones reales
    gdf_aea = gdf.to_crs(3035)

    # cutoff: 2025-08-08 00:00:00Z
    cutoff_dt_utc = datetime(2025, 8, 8, 0, 0, 0, tzinfo=timezone.utc)

    # SVG grande con TODOS
    w_all, h_all = draw_geoms_to_svg_scaled(
        gdf_aea,
        out_all,
        cols=args.cols,
        cell=args.cell,
        margin=args.margin,
        stroke_width=args.stroke,
        label=args.label,
        font_size=7,
        cutoff_dt_utc=cutoff_dt_utc,
    )

    # Subconjuntos para dos SVGs extra
    def is_granate(row):
        fd = parse_firedate(row.get("firedate"))
        if fd is None:
            return False
        if fd.tzinfo is None:
            fd = fd.replace(tzinfo=timezone.utc)
        return fd >= cutoff_dt_utc

    mask_gran = gdf.apply(is_granate, axis=1)
    gdf_gran = gdf.loc[mask_gran].copy()
    gdf_rosa = gdf.loc[~mask_gran].copy()

    # Mantener el orden por área en cada subset
    gdf_gran.sort_values("area_ha_final", ascending=False, inplace=True)
    gdf_gran = gdf_gran.to_crs(3035)
    gdf_rosa.sort_values("area_ha_final", ascending=False, inplace=True)
    gdf_rosa = gdf_rosa.to_crs(3035)

    # SVG solo granates
    if len(gdf_gran) > 0:
        draw_geoms_to_svg_scaled(
            gdf_gran,
            out_gran,
            cols=args.cols,
            cell=args.cell,
            margin=args.margin,
            stroke_width=args.stroke,
            label=args.label,
            font_size=7,
            cutoff_dt_utc=cutoff_dt_utc,
        )
    else:
        # crear SVG vacío mínimo para no romper pipes
        svgwrite.Drawing(str(out_gran), size=(args.margin*2+args.cell, args.margin*2+args.cell)).save()

    # SVG solo rosas
    if len(gdf_rosa) > 0:
        draw_geoms_to_svg_scaled(
            gdf_rosa,
            out_rosa,
            cols=args.cols,
            cell=args.cell,
            margin=args.margin,
            stroke_width=args.stroke,
            label=args.label,
            font_size=7,
            cutoff_dt_utc=cutoff_dt_utc,
        )
    else:
        svgwrite.Drawing(str(out_rosa), size=(args.margin*2+args.cell, args.margin*2+args.cell)).save()

    print(f"[OK] SVG TODOS: {out_all}  ({int(w_all)}×{int(h_all)} px)")
    print(f"[OK] SVG GRANATES (>= 2025-08-08): {out_gran}")
    print(f"[OK] SVG ROSAS (< 2025-08-08): {out_rosa}")
    print("Colores: GRANATE=#a80127 | ROSA=#fac4c5")
    print("Nota: Ordenados por 'area_ha_final' (desc).")

if __name__ == "__main__":
    main()
