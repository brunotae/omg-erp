"""Extrai medidas e pesos das planilhas dos fornecedores (CSV convertidos das .xlsx da pasta "OMG Fornecedores").

Uso: python3 tools/pesos/fornecedores.py PASTA_DOS_CSV  → grava tools/pesos/fornecedores.json

Cada registro: marca, barcode, nome_en, nome_kr, volume, dim_mm [C, L, A] da unidade (se houver),
vol_cm3 (volume da unidade: medido ou caixa master ÷ quantidade), peso_g, tipo (como o dado foi obtido), fonte.
"""
import csv
import json
import re
import sys
from pathlib import Path

PASTA = Path(sys.argv[1])
OUT = []


def rows(nome):
    p = PASTA / nome
    return list(csv.reader(open(p, encoding="utf-8"))) if p.exists() else []


def num(s):
    s = str(s or "").replace(",", ".").strip()
    m = re.search(r"-?\d+(?:\.\d+)?", s)
    return float(m.group(0)) if m else None


def dims(s, fator=1.0):
    """'4*4*11.7cm' / '160*20*180' / '52*29.8*18' → [a, b, c] em mm."""
    p = re.findall(r"\d+(?:\.\d+)?", str(s or "").replace(",", "."))
    if len(p) < 3:
        return None
    v = [float(x) * fator for x in p[:3]]
    return v if all(x > 0 for x in v) else None


def vol(d):
    return round(d[0] * d[1] * d[2] / 1000, 1) if d else None


def add(marca, fonte, barcode="", en="", kr="", volume="", dim_mm=None, vol_cm3=None, peso_g=None, tipo=""):
    if dim_mm and not all(dim_mm):
        dim_mm = None
    if not (dim_mm or vol_cm3 or peso_g):
        return
    OUT.append({"marca": marca, "barcode": str(barcode).strip().split(".")[0], "nome_en": en.strip(), "nome_kr": kr.strip(),
                "volume": str(volume).strip(), "dim_mm": dim_mm, "vol_cm3": vol_cm3 or vol(dim_mm),
                "peso_g": round(peso_g, 1) if peso_g else None, "tipo": tipo, "fonte": fonte})


# Growus / Parnell — unidade: L, W, H (mm) e peso (g)
for f, marca, c in [("202611CORPPriceList__0.csv", "Growus", (3, 6, 7, 8, 17, 18, 19, 20)),
                    ("202611CORPPriceList__1.csv", "Parnell", (3, 5, 6, 7, 15, 16, 17, 18))]:
    for r in rows(f)[3:]:
        if len(r) > c[7] and num(r[c[4]]):
            add(marca, "Price List 11CORP", r[c[0]], r[c[2]], r[c[1]], r[c[3]], [num(r[c[4]]), num(r[c[5]]), num(r[c[6]])], peso_g=num(r[c[7]]), tipo="unidade (fornecedor)")

# numbuzin — "4*4*11.7cm(117g)" por unidade
for r in rows("넘버즈인__0.csv")[8:]:
    if len(r) > 8 and "*" in r[8]:
        m = re.search(r"\((\d+(?:\.\d+)?)\s*g\)", r[8])
        add("numbuzin", "numbuzin 영세", r[7], "", r[4], r[6], dims(r[8].split("(")[0], 10), peso_g=float(m.group(1)) if m else None, tipo="unidade (fornecedor)")

# BIODANCE — Product Size (mm) e Product Weight (g)
for r in rows("바이오던스__0.csv")[2:]:
    if len(r) > 19:
        add("BIODANCE", "Biodance 영세", r[3], r[5], r[4], r[6], dims(r[17]), peso_g=num(r[19]), tipo="unidade (fornecedor)")

# Cell Fusion C — peso (g) por unidade; Dermablock: caixa master ÷ SPQ
for r in rows("셀퓨전씨__0.csv")[2:]:
    if len(r) > 10 and num(r[10]):
        add("Cell Fusion C", "CFC 영세", r[7], r[5], r[4], r[6], peso_g=num(r[10]), tipo="unidade (fornecedor)")
for r in rows("셀퓨전씨__1.csv")[2:]:
    if len(r) > 10:
        d, q = dims(r[10], 10), num(r[9])
        add("Cell Fusion C", "CFC Dermablock 영세", r[5], r[4], "", r[6], vol_cm3=round(vol(d) / q, 1) if d and q else None,
            peso_g=num(r[8]), tipo="volume = caixa master ÷ quantidade")

# UNOVE — W × L × H (mm) e peso (g) por unidade
for r in rows("어노브__0.csv")[1:]:
    if len(r) > 7:
        add("UNOVE", "Unove 영세", r[1], r[4], r[3], "", dims(r[6]), peso_g=num(r[7]), tipo="unidade (fornecedor)")

# Beauty of Joseon — peso líquido da unidade; volume = caixa master (cm) ÷ quantidade
for r in rows("조선미녀__0.csv")[2:]:
    if len(r) > 11:
        d, q = dims(r[7], 10), num(r[6])
        add("Beauty of Joseon", "BoJ 영세", r[4], r[2], r[3], r[5], vol_cm3=round(vol(d) / q, 1) if d and q else None,
            peso_g=num(r[11]), tipo="peso líquido; volume = caixa master ÷ quantidade")

# CLIO (grupo: CLIO, Peripera, Goodal, Healthy Place…) — inner box: peso e tamanho ÷ quantidade
for r in rows("클리오__0.csv")[3:]:
    if len(r) > 23 and num(r[23]):
        q = num(r[23])
        d = dims(r[21])
        kg = num(r[19])
        add("CLIO", "CLIO 영세", r[4], r[6], r[5], r[17], vol_cm3=round(vol(d) / q, 1) if d else None,
            peso_g=kg * 1000 / q if kg else None, tipo="inner box ÷ quantidade")

# VT — caixa master (cm) ÷ itens por caixa
for r in rows("vt_0.csv")[2:]:
    if len(r) > 18 and num(r[14]) and dims(f"{r[16]}*{r[17]}*{r[18]}"):
        d = dims(f"{r[16]}*{r[17]}*{r[18]}", 10)
        add("VT Cosmetics", "VT 영세", r[6], r[9], r[8], r[13], vol_cm3=round(vol(d) / num(r[14]), 1), tipo="volume = caixa master ÷ quantidade")

# PURITO — peso total da unidade (g)
for r in rows("퓨리토__0.csv")[2:]:
    if len(r) > 7 and num(r[7]):
        add("PURITO SEOUL", "Purito 영세", r[3], r[5], r[4], r[6], peso_g=num(r[7]), tipo="unidade (fornecedor)")

# Fornecedores sem medida, mas com código de barras + nome (servem para casar e para o Keepa)
BAR = []
for f, marca, cb, en, kr, vo, hdr in [
    ("믹순__0.csv", "mixsoon", 5, 3, 2, 7, 3), ("마녀공장__0.csv", "ma:nyo", 7, 5, 4, 6, 4), ("토리든__0.csv", "Torriden", 0, 1, None, 2, 1),
    ("코스알엑스__0.csv", "COSRX", 1, 3, 2, 4, 2), ("달바__0.csv", "d'Alba", 0, 1, None, 2, 2), ("아비브__0.csv", "Abib", 1, 5, 4, 12, 4),
    ("메디큐브__1.csv", "medicube", 5, 7, 6, 9, 2), ("메디큐브__2.csv", "medicube", 5, 7, 6, 8, 4), ("롬앤__0.csv", "Rom&nd", 1, 3, 2, None, 6),
    ("어뮤즈__0.csv", "AMUSE", 2, 4, 3, 6, 2), ("20260818현물리스트.xlsx__0.csv", "", 2, 4, 3, None, 2),
]:
    for r in rows(f)[hdr:]:
        if len(r) > cb and re.fullmatch(r"\d{8,14}", r[cb].strip().split(".")[0] or "x"):
            BAR.append({"marca": marca or (r[1] if len(r) > 1 else ""), "barcode": r[cb].strip().split(".")[0], "nome_en": r[en] if en is not None else "",
                        "nome_kr": r[kr] if kr is not None else "", "volume": r[vo] if vo is not None and len(r) > vo else "", "fonte": f.split("__")[0]})

saida = Path(__file__).with_name("fornecedores.json")
saida.write_text(json.dumps({"medidas": OUT, "codigos": BAR}, ensure_ascii=False, indent=0))
from collections import Counter
print("registros com medida/peso:", len(OUT), Counter(o["marca"] for o in OUT))
print("com dimensão/volume:", sum(1 for o in OUT if o["vol_cm3"]), "· com peso:", sum(1 for o in OUT if o["peso_g"]))
print("códigos de barra (sem medida):", len(BAR))
