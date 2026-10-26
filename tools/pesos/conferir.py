"""Aponta SKUs com peso ou tamanho suspeito (para conferência humana) → tools/pesos/conferir.json {sku: [motivos]}.

Uso: python3 tools/pesos/conferir.py products_export_1.csv [products_export_2.csv]
"""
import csv
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

A = Path(__file__).resolve().parent
csv.field_size_limit(10**9)
M = json.loads((A / "medidas_sku.json").read_text())
SEM_CONTEUDO = ("mascara folha", "acessorio", "patch pote", "toner pad", "kit", "lapis")

nome = {}
prod = {}
for f in sys.argv[1:]:
    for r in csv.DictReader(open(f, encoding="utf-8")):
        if r["Title"]:
            prod[r["Handle"]] = r
        if r["Variant SKU"]:
            nome[r["Variant SKU"]] = prod[r["Handle"]]["Title"]

out = defaultdict(list)
for k, v in M.items():
    d, p, q, c = v["dim"], v["peso"], v["conteudo"], v["classe"]
    vol = math.prod(d) if d else None
    real = v["peso_origem"] == "medida real"
    if real:
        continue
    if vol and p and p / vol > 1.6:
        out[k].append(f"pesado demais para o tamanho: {p:g} g numa caixa de {vol:.0f} cm³")
    if vol and p and p / vol < 0.12 and c not in SEM_CONTEUDO:
        out[k].append(f"leve demais para o tamanho: {p:g} g numa caixa de {vol:.0f} cm³")
    if p and p > 1500:
        out[k].append(f"peso acima de 1,5 kg ({p:g} g): confirmar se é o produto ou uma caixa com vários")
    if "típico" in v["dim_origem"]:
        out[k].append("o produto não informa ml/g: tamanho e peso são do tipo, não do produto")
    if "parecia errado" in v["peso_origem"]:
        out[k].append("peso do site oficial descartado por não bater com o tamanho")
    if "grande demais" in v["dim_origem"]:
        out[k].append("caixa master do fornecedor dava volume grande demais; usado o tipo")
    if c == "kit" and "típico" not in v["dim_origem"]:
        out[k].append("kit: medida estimada pela soma dos conteúdos (confirmar caixa)")

(A / "conferir.json").write_text(json.dumps(out, ensure_ascii=False, indent=0))
from collections import Counter
cnt = Counter(m.split(":")[0] for l in out.values() for m in l)
print(len(out), "SKUs para conferir")
for k, n in cnt.most_common():
    print(f"  {n:5d}  {k}")
