"""Monta peso e dimensões de cada SKU, na ordem de confiança, e grava tools/pesos/medidas_sku.json.

Uso: python3 tools/pesos/estimar.py products_export_1.csv [products_export_2.csv]

Prioridade (por SKU):
  1. medida real (tools/pesos/reais.json, pesada/medida pela equipe)
  2. fornecedor, unidade (planilha do fabricante com C × L × A e peso da unidade)
  3. fornecedor, caixa master ÷ quantidade (volume aproximado, com folga)
  4. peso do site oficial da marca / varejo (só peso)
  5. estimativa por tipo de embalagem e conteúdo (ml/g), calibrada com as medidas reais dos itens 1–2
"""
import csv
import json
import math
import re
import statistics
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

A = Path(__file__).resolve().parent
csv.field_size_limit(10**9)


def norm(s):
    s = unicodedata.normalize("NFD", str(s or "").lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


# classe: (regex no tipo+nome, conteúdo de referência, dimensões de referência em cm, embalagem em g)
CLASSES = [
    ("kit", r"\bkit\b|conjunto|dupla|\bduo\b|\bset\b|\btrio\b|\d\s?(ml|g|un|unidades|discos)\b\s*\+|\+\s*\d+\s?(ml|g)\b", None, None, None),
    ("patch pote", r"eye patch|patches? de hidrogel|adesivos de hidrogel|gel patch|hydrogel patch", 60, (9.0, 9.0, 6.0), 150),
    ("toner pad", r"toner pad|\bpads?\b|\bdiscos?\b|almofadas|\bpad\b", 70, (9.7, 8.9, 8.8), 145),
    ("sabonete barra", r"\bbarra\b|bar soap|soap bar", 100, (9.0, 6.0, 3.5), 15),
    ("mascara tubo", r"peel.?off|wrapping|mud pack|clay pack|pack cleanser|mascara de argila", 100, (5.0, 4.0, 18.0), 40),
    ("olhos make", r"sombra|paleta|palette|shadow|blush|iluminador|highlighter|po compacto|pressed|bronzer", 6, (6.0, 6.0, 2.0), 35),
    ("cushion", r"cushion|almofada de base", 15, (9.0, 9.0, 4.0), 110),
    ("mascara folha", r"mascara (facial|em folha|de tecido)|sheet mask|facial mask|face mask|\bmask(s)?\b(?!.*(sleeping|wash|noturna|capilar|hair))|mascara(s)? facia|mascara de colageno|mascara em gel|hidrogel", 1, (12.0, 18.0, 0.7), 8),
    ("mascara pote", r"sleeping|noturna|overnight|wash.?off|argila|clay|mascara capilar|hair mask|mascara de cabelo|mascara em creme", 100, (7.5, 7.5, 7.0), 110),
    ("batom", r"batom|tint|lip|labi|gloss|balm labial", 4, (2.5, 2.5, 10.0), 25),
    ("lapis", r"lapis|delineador|liner|rimel|mascara para cilios|mascara de cilios|sobrancelha|brow|pencil", 1, (2.0, 2.0, 15.0), 20),
    ("base", r"\bbase\b|foundation|\bbb\b|\bcc\b|corretivo|concealer|primer", 30, (4.0, 3.0, 14.0), 35),
    ("protetor", r"protetor|sunscreen|\bsun\b|fps|spf|solar", 50, (4.5, 3.5, 15.0), 30),
    ("olhos creme", r"olhos|eye", 30, (4.5, 4.5, 10.0), 55),
    ("oleo limpeza", r"oleo de limpeza|cleansing oil|balsamo|balm|bálsamo", 200, (6.0, 6.0, 18.0), 60),
    ("limpeza", r"limpeza|cleans|espuma|foam|gel de limpeza|sabonete facial|cleanser", 150, (5.5, 4.0, 19.0), 30),
    ("shampoo", r"shampoo|condicionador|conditioner", 500, (8.0, 5.5, 21.0), 60),
    ("capilar", r"capilar|hair|cabelo|couro cabeludo|scalp|tratamento", 200, (5.5, 5.5, 18.0), 50),
    ("corpo", r"corpo|corporal|body|banho|sabonete|maos|hand|intimo", 300, (7.0, 5.0, 20.0), 60),
    ("tonico", r"tonico|toner|mist|bruma|agua|water|essence water", 200, (6.5, 6.5, 17.0), 60),
    ("serum", r"serum|ampola|ampoule|essencia|essence|booster|concentrado", 50, (4.5, 4.5, 12.0), 70),
    ("creme", r"creme|cream|locao|lotion|emulsao|emulsion|gel|hidratante|moistur", 50, (7.0, 7.0, 7.0), 90),
    ("acessorio", r"acessori|accessory|sticker|adesivo|patch|esponja|puff|pincel|brush|aparelho|ferramenta", 1, (10.0, 15.0, 2.0), 25),
]
DEF = ("outros", None, 50, (5.0, 5.0, 12.0), 60)


def classe(tipo, nome):
    t = norm(tipo) + " | " + norm(nome)
    t = re.sub(r"pa\s?\+{1,4}|(spf|fps)\s?\d+\s?\+?", " ", t)
    for c in CLASSES:
        if re.search(c[1], t):
            return c
    return (DEF[0], "", DEF[2], DEF[3], DEF[4])


def conteudo(nome, var, cls):
    t = norm(nome + " " + var)
    if cls == "toner pad":
        m = re.search(r"(\d+)\s*(discos|pads?|unidades|ea|pcs)", t)
        return float(m.group(1)) if m else 70.0
    if cls == "mascara folha":
        m = re.search(r"(\d+)\s*(unidades|folhas|un\b|ea|pcs|mascaras|sheets|pares)", t)
        if m:
            return float(m.group(1))
        return 10.0 if re.search(r"\bcaixa\b|\bbox\b", t) else 1.0
    m = re.search(r"(\d+)\s?[x×]\s?(\d+(?:[.,]\d+)?)\s?(ml|g)\b", t) or re.search(r"(\d+(?:[.,]\d+)?)\s?(?:ml|g)\s?[x×]\s?(\d+)\b", t)
    if m and cls != "kit":
        a, b = float(m.group(1).replace(",", ".")), float(m.group(2).replace(",", "."))
        return a * b
    if cls == "patch pote":
        m = re.search(r"(\d+)\s*(unidades|patches|adesivos|ea|pcs|pares)", t)
        return float(m.group(1)) if m else 60.0
    vals = [float(x.replace(",", ".")) for x, _ in re.findall(r"(\d+(?:[.,]\d+)?)\s?(ml|g)\b", t)]
    vals = [v for v in vals if 0.5 <= v <= 2000]
    if not vals:
        return None
    if cls == "kit":
        mult = re.findall(r"(\d+(?:[.,]\d+)?)\s?(?:ml|g)\s?[x×]\s?(\d+)", t)
        return sum(vals) + sum(float(a.replace(",", ".")) * (int(b) - 1) for a, b in mult)
    return vals[0]


def caixa(dim_ref, vol):
    a, b, c = dim_ref
    k = (vol / (a * b * c)) ** (1 / 3)
    return [round(a * k, 1), round(b * k, 1), round(c * k, 1)]


def texto_corpo(html):
    t = re.sub(r"<style.*?</style>", " ", html or "", flags=re.S | re.I)
    t = re.sub(r"<[^>]+>", " ", t)
    return re.sub(r"\s+", " ", t)


def conteudo_corpo(corpo, cls):
    """Tamanho a partir da página do produto: 'Tamanho: 150 ml'; no kit, soma do trecho 'O que vem'."""
    t = norm(corpo)
    if cls == "kit":
        m = re.search(r"o que vem(.*?)(beneficios|indicado para|como usar|ingredientes|$)", t)
        trecho = m.group(1) if m else ""
        vals = [float(x.replace(",", ".")) for x, _ in re.findall(r"(\d+(?:[.,]\d+)?)\s?(ml|g)\b", trecho)]
        vals = [v for v in vals if 0.5 <= v <= 1000]
        return sum(vals) if vals else None
    m = re.search(r"tamanho:?\s*(\d+(?:[.,]\d+)?)\s?(ml|g)\b", t)
    return float(m.group(1).replace(",", ".")) if m else None


# ---------- dados ----------
skus, prod = [], {}
for f in sys.argv[1:]:
    for r in csv.DictReader(open(f, encoding="utf-8")):
        if r["Title"]:
            prod[r["Handle"]] = r
        p = prod.get(r["Handle"])
        if p and r["Variant SKU"]:
            var = " ".join(x for x in [r["Option1 Value"], r["Option2 Value"]] if x and x != "Default Title")
            skus.append({"sku": r["Variant SKU"], "handle": r["Handle"], "nome": p["Title"], "var": var, "tipo": p.get("Type", ""), "marca": p["Vendor"], "corpo": texto_corpo(p["Body (HTML)"])})

CAS = json.loads((A / "casados.json").read_text())
REAIS = json.loads((A / "reais.json").read_text()) if (A / "reais.json").exists() else {}
LOTE = {r["handle"]: r for r in csv.DictReader(open(A / "pesos_final.csv", encoding="utf-8"))}

# ---------- calibração por classe ----------
cal_vol, cal_peso = defaultdict(list), defaultdict(list)
for s in skus:
    c = classe(s["tipo"], s["nome"] + " " + s["var"])
    if c[0] in ("kit", "patch pote"):
        continue
    q = conteudo(s["nome"], s["var"], c[0])
    if not q:
        continue
    fonte = REAIS.get(s["sku"]) or (CAS.get(s["sku"]) if CAS.get(s["sku"], {}).get("tipo", "").startswith("unidade") else None)
    if fonte and fonte.get("dim_mm"):
        v = math.prod(fonte["dim_mm"]) / 1000
        cal_vol[c[0]].append(v / (q / c[2]) ** 0.85)
    peso = (fonte or {}).get("peso_g")
    if not peso:
        lt = LOTE.get(s["handle"])
        if lt and lt["fonte"] in ("site oficial da marca",) and lt["peso_g"]:
            peso = float(lt["peso_g"])
    if peso and q and c[0] not in ("toner pad", "mascara folha", "acessorio", "lapis"):
        emb = (peso - q) / (q / c[2]) ** (2 / 3)
        if 0 < emb < 2000:
            cal_peso[c[0]].append(emb)

VOLREF, EMBREF = {}, {}
for c in CLASSES + [(DEF[0], "", DEF[2], DEF[3], DEF[4])]:
    if c[2] is None or c[0] == "patch pote":
        continue
    base_v = math.prod(c[3])
    VOLREF[c[0]] = statistics.median(cal_vol[c[0]]) if len(cal_vol[c[0]]) >= 4 else base_v
    EMBREF[c[0]] = max(statistics.median(cal_peso[c[0]]), c[4] * 0.6) if len(cal_peso[c[0]]) >= 6 else c[4]


def estimar(s):
    c = classe(s["tipo"], s["nome"] + " " + s["var"])
    q = conteudo(s["nome"], s["var"], c[0])
    if c[0] == "kit" and not q:
        q = conteudo_corpo(s["corpo"], "kit") or q
    if q is None and c[0] not in ("kit",):
        q = conteudo_corpo(s["corpo"], c[0])
    tipico = False
    if c[0] == "kit":
        if not q:
            q, tipico = 150.0, True
        # kit: soma dos conteúdos como se fosse um frasco de sérum/creme, + 30% de caixa
        vol = VOLREF["serum"] * (q / 50) ** 0.85 * 1.3
        return {"classe": c[0], "conteudo": q, "tipico": tipico, "dim": caixa((12, 8, 15), vol), "vol": round(vol), "peso": round(q + EMBREF["serum"] * (q / 50) ** (2 / 3) * 1.4)}
    if q is None:
        q = c[2] if c[0] in ("acessorio", "lapis", "batom", "olhos make", "cushion") else None
    if q is None:
        q, tipico = c[2], True
    if c[0] == "mascara folha":
        dim = [12.0, 18.0, round(0.7 * q + 0.5, 1)] if q > 1 else [12.0, 18.0, 0.7]
        return {"classe": c[0], "conteudo": q, "dim": dim, "vol": round(math.prod(dim)), "peso": round(30 * q + (15 if q > 1 else 0))}
    if c[0] == "patch pote":
        return {"classe": c[0], "conteudo": q, "tipico": tipico, "dim": [9.0, 9.0, 6.0], "vol": 486, "peso": 180}
    if c[0] == "toner pad":
        vol = VOLREF["toner pad"] * (q / 70) ** 0.85
        return {"classe": c[0], "conteudo": q, "dim": caixa(c[3], vol), "vol": round(vol), "peso": round(300 * (q / 70) ** 0.9)}
    vol = VOLREF[c[0]] * (q / c[2]) ** 0.85
    peso = q * 1.0 + EMBREF[c[0]] * (q / c[2]) ** (2 / 3)
    return {"classe": c[0], "conteudo": q, "tipico": tipico, "dim": caixa(c[3], vol), "vol": round(vol), "peso": round(peso)}


out = {}
for s in skus:
    e = estimar(s) or {"classe": "kit"}
    r = {"classe": e.get("classe"), "conteudo": e.get("conteudo")}
    real, cas, lt = REAIS.get(s["sku"]), CAS.get(s["sku"]), LOTE.get(s["handle"])
    # dimensões
    if real and real.get("dim_mm"):
        r.update(dim=[x / 10 for x in real["dim_mm"]], dim_origem="medida real")
    elif cas and cas.get("dim_mm"):
        r.update(dim=[round(x / 10, 1) for x in cas["dim_mm"]], dim_origem=cas["fonte"] + " (unidade)")
    elif cas and cas.get("vol_cm3"):
        r.update(dim=caixa(next((c[3] for c in CLASSES if c[0] == e.get("classe") and c[3]), DEF[3]), cas["vol_cm3"]), dim_origem=cas["fonte"] + " (caixa master ÷ quantidade, aproximado)")
    elif e.get("dim"):
        r.update(dim=e["dim"], dim_origem="estimado por tipo (" + e["classe"] + (", tamanho típico: o produto não informa ml/g" if e.get("tipico") else "") + ")")
    else:
        r.update(dim=None, dim_origem="sem dimensão")
    # peso
    if real and real.get("peso_g"):
        r.update(peso=real["peso_g"], peso_origem="medida real")
    elif cas and cas.get("peso_g"):
        r.update(peso=cas["peso_g"], peso_origem=cas["fonte"] + (" (peso líquido)" if "líquido" in cas["tipo"] else ""))
    elif lt and lt["peso_g"] and lt["fonte"] != "estimado pelo tamanho" and not (
            e.get("peso") and not e.get("tipico") and not 0.4 <= float(lt["peso_g"]) / e["peso"] <= 3):
        r.update(peso=float(lt["peso_g"]), peso_origem=lt["fonte"])
    elif lt and lt["peso_g"] and lt["fonte"] != "estimado pelo tamanho":
        r.update(peso=e["peso"], peso_origem="estimado por tipo (" + e["classe"] + "); o peso do " + lt["fonte"] + " (" + str(round(float(lt["peso_g"]))) + " g) parecia errado")
    elif e.get("peso"):
        r.update(peso=e["peso"], peso_origem="estimado por tipo (" + e["classe"] + (", tamanho típico: o produto não informa ml/g" if e.get("tipico") else "") + ")")
    else:
        r.update(peso=None, peso_origem="sem peso")
    r["barcode"] = (cas or {}).get("barcode") or ""
    out[s["sku"]] = r

codigos = json.loads((A / "codigos_barra.json").read_text())
for k, v in codigos.items():
    if k in out and not out[k]["barcode"]:
        out[k]["barcode"] = v
(A / "medidas_sku.json").write_text(json.dumps(out, ensure_ascii=False, indent=0))
(A / "calibracao.json").write_text(json.dumps({"vol_ref_cm3": {k: round(v) for k, v in VOLREF.items()}, "amostras_vol": {k: len(v) for k, v in cal_vol.items()},
                                               "embalagem_g": {k: round(v) for k, v in EMBREF.items()}, "amostras_peso": {k: len(v) for k, v in cal_peso.items()}}, ensure_ascii=False, indent=1))
from collections import Counter
print("SKUs:", len(out))
print("dimensões:", Counter(v["dim_origem"].split(" (")[0] if not v["dim_origem"].startswith("estimado") else "estimado por tipo" for v in out.values()))
print("peso:", Counter(v["peso_origem"].split(" (")[0] if not v["peso_origem"].startswith("estimado") else "estimado por tipo" for v in out.values()))
print("classes:", Counter(v["classe"] for v in out.values()).most_common())
