"""Gera bomi/fichas-produtos.json: ficha de cada produto do lote 1 para a Bomi.

Fonte: exportação de produtos do Shopify (CSV) + lista do lote 1 (seeds de fotos oficiais).
Cada ficha: handle, nome, marca, tipo, preço (R$), resumo, e o texto da página do produto
dividido por seção (Descrição, O que vem, Benefícios, Indicado para, Como usar, Ingredientes...).

Uso: python3 bomi/teste/fichas.py caminho/products_export_1.csv [products_export_2.csv ...]
"""
import csv
import glob
import html
import json
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
csv.field_size_limit(10**9)

lote = re.findall(
    r"^\('([^']+)'",
    "".join(Path(f).read_text() for f in sorted(glob.glob(str(RAIZ / "supabase/seeds/fotos_fila_lote1_parte*.sql")))),
    re.M,
)
lote = list(dict.fromkeys(lote))

prod = {}
for f in sys.argv[1:]:
    for r in csv.DictReader(open(f, encoding="utf-8")):
        h = r["Handle"]
        if h not in prod:
            prod[h] = dict(r)
            prod[h]["_precos"] = []
        if r.get("Variant Price"):
            prod[h]["_precos"].append(float(r["Variant Price"]))

SECOES = ["Descrição", "O que vem", "O que vem no kit", "Benefícios", "Indicado para", "Como usar", "Ingredientes principais", "Ingredientes", "Textura", "Cuidados", "Dica"]


def texto(body):
    b = re.sub(r"<style.*?</style>", " ", body or "", flags=re.S | re.I)
    b = re.sub(r"<(br|/p|/li|/h\d|/summary|/div)[^>]*>", "\n", b, flags=re.I)
    b = re.sub(r"<li[^>]*>", "\n• ", b, flags=re.I)
    b = re.sub(r"<[^>]+>", " ", b)
    b = html.unescape(b)
    b = re.sub(r"[ \t\r\f\v]+", " ", b)
    b = re.sub(r"\s*\n\s*", "\n", b).strip()
    return b


def secoes(t):
    linhas = [l.strip() for l in t.split("\n") if l.strip()]
    out, atual = {}, "Descrição"
    for l in linhas:
        if l in SECOES:
            atual = l
            continue
        out.setdefault(atual, []).append(l)
    return {k: " ".join(v)[:700] for k, v in out.items()}


def brl(v):
    return "R$ " + f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


fichas, faltam = [], []
for h in lote:
    r = prod.get(h)
    if not r:
        faltam.append(h)
        continue
    s = secoes(texto(r["Body (HTML)"]))
    precos = sorted(set(r["_precos"]))
    fichas.append({
        "handle": h,
        "nome": r["Title"],
        "marca": r["Vendor"],
        "tipo": r.get("Type", ""),
        "tags": r.get("Tags", ""),
        "preco": brl(precos[0]) if precos else "",
        "preco_max": brl(precos[-1]) if len(precos) > 1 else "",
        "secoes": s,
    })

saida = RAIZ / "bomi/fichas-produtos.json"
saida.write_text(json.dumps(fichas, ensure_ascii=False, separators=(",", ":")))
print(f"fichas: {len(fichas)} | sem dados no export: {len(faltam)} | {saida.stat().st_size // 1024} KB")
