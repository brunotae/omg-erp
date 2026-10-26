"""Casa as medidas dos fornecedores (fornecedores.json) com os SKUs do Shopify.

Uso: python3 tools/pesos/casar.py products_export_1.csv [products_export_2.csv]
Grava tools/pesos/casados.json: {sku: {fonte, confianca, dim_mm, vol_cm3, peso_g, tipo, barcode, nome_fornecedor}}
e tools/pesos/codigos_barra.json: {sku: barcode} (inclui os fornecedores sem medida; serve para o Keepa).
"""
import csv
import json
import re
import sys
import unicodedata
from pathlib import Path

A = Path(__file__).resolve().parent
csv.field_size_limit(10**9)
F = json.loads((A / "fornecedores.json").read_text())

PARE = set("the and for with of a to in de da do com para e o set kit ml g ea pcs".split())


def norm(s):
    s = unicodedata.normalize("NFD", str(s).lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def toks(s):
    return {w for w in re.findall(r"[a-z0-9]+", norm(s)) if w not in PARE and not w.isdigit() and len(w) > 1}


def tam(s):
    m = re.search(r"(\d+(?:\.\d+)?)\s?(ml|g)\b", norm(s))
    return float(m.group(1)) if m else None


def numeros(s):
    return set(re.findall(r"\b\d{2,4}\b", norm(s)))


MARCA = {  # marca do fornecedor → marcas (Vendor) no nosso Shopify
    "CLIO": {"clio", "peripera"}, "Beauty of Joseon": {"beauty of joseon"}, "BIODANCE": {"biodance"}, "Cell Fusion C": {"cell fusion c"},
    "numbuzin": {"numbuzin"}, "VT Cosmetics": {"vt cosmetics"}, "PURITO SEOUL": {"purito seoul"}, "UNOVE": {"unove"}, "Growus": {"growus"},
    "Parnell": {"parnell"}, "mixsoon": {"mixsoon"}, "ma:nyo": {"ma:nyo"}, "Torriden": {"torriden"}, "COSRX": {"cosrx"}, "d'Alba": {"d'alba"},
    "Abib": {"abib"}, "medicube": {"medicube"}, "Rom&nd": {"rom&nd"},
}

# SKUs do Shopify
skus, prod = [], {}
for f in sys.argv[1:]:
    for r in csv.DictReader(open(f, encoding="utf-8")):
        if r["Title"]:
            prod[r["Handle"]] = r
        p = prod.get(r["Handle"])
        if p and r["Variant SKU"]:
            var = " ".join(x for x in [r["Option1 Value"], r["Option2 Value"]] if x and x != "Default Title")
            en = p["Title"].split(":")[0]
            skus.append({"sku": r["Variant SKU"], "marca": p["Vendor"].lower(), "en": en + " " + var, "titulo": p["Title"] + " " + var, "handle": r["Handle"]})


def melhor(rec_list, s):
    alvo = toks(s["en"]) - toks(s["marca"])
    t_s = tam(s["titulo"])
    best, bs = None, 0
    for rec in rec_list:
        nome = rec["nome_en"] or ""
        if not nome:
            continue
        rt = toks(nome) - toks(rec["marca"]) - {"peripera", "clio", "vt", "purito", "cosrx", "medicube", "abib"}
        if not rt or not alvo:
            continue
        inter = len(alvo & rt)
        sc = inter / max(len(rt), len(alvo)) ** 0.5 / max(1, min(len(rt), len(alvo))) ** 0.5
        t_r = tam(rec["volume"] + " " + nome)
        if t_s and t_r:
            sc += 0.2 if abs(t_s - t_r) < 0.6 else -0.5
        n_s, n_r = numeros(s["en"]) - {str(int(t_s))} if t_s else numeros(s["en"]), numeros(nome)
        if n_r and n_s and not (n_s & n_r):
            sc -= 0.3  # ex.: cor 01 x 02, "Reedle Shot 100" x "300"
        if sc > bs:
            best, bs = rec, sc
    return best, round(bs, 2)


por_marca = {}
for rec in F["medidas"]:
    for m in MARCA.get(rec["marca"], {rec["marca"].lower()}):
        por_marca.setdefault(m, []).append(rec)
cod_marca = {}
for rec in F["codigos"]:
    for m in MARCA.get(rec["marca"], {rec["marca"].lower()}):
        cod_marca.setdefault(m, []).append(rec)

casados, codigos = {}, {}
for s in skus:
    rec, sc = melhor(por_marca.get(s["marca"], []), s)
    if rec and sc >= 0.75:
        casados[s["sku"]] = {"confianca": sc, "dim_mm": rec["dim_mm"], "vol_cm3": rec["vol_cm3"], "peso_g": rec["peso_g"], "tipo": rec["tipo"],
                             "fonte": "fornecedor: " + rec["fonte"], "barcode": rec["barcode"], "nome_fornecedor": rec["nome_en"] or rec["nome_kr"]}
        if rec["barcode"]:
            codigos[s["sku"]] = rec["barcode"]
    rc, sc2 = melhor(cod_marca.get(s["marca"], []), s)
    if rc and sc2 >= 0.75 and rc["barcode"]:
        codigos.setdefault(s["sku"], rc["barcode"])

(A / "casados.json").write_text(json.dumps(casados, ensure_ascii=False, indent=0))
(A / "codigos_barra.json").write_text(json.dumps(codigos, ensure_ascii=False, indent=0))
from collections import Counter
print("SKUs:", len(skus), "· com medida de fornecedor:", len(casados), "· com código de barras:", len(codigos))
print(Counter(s["marca"] for s in skus if s["sku"] in casados).most_common())
