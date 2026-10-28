"""Fotos oficiais com regra rígida (sem nota de "parecido").

Uma foto oficial só é aceita quando TODOS os critérios passam:
 1. mesma marca (catálogo oficial da própria marca);
 2. mesmo produto: todas as palavras do nome em inglês do nosso produto estão no título oficial,
    e o título oficial não tem nenhuma palavra a mais além de palavras genéricas (sheet, ea, pads…);
 3. mesmo tamanho: se o nosso título tem ml/g/quantidade, o oficial tem que ter o mesmo número
    (no título ou numa variante); se o oficial tiver tamanhos diferentes e nenhum igual, recusa;
    se o oficial não escreve o tamanho, só passa quando a página oficial tem uma única versão (sem outro tamanho);
 4. único: se mais de um produto oficial passar, recusa (ambíguo).
Depois disso ainda há a conferência visual (contato.py gera as folhas para olhar).

Uso: python3 tools/fotos/regra_rigida.py EXPORT1.csv EXPORT2.csv  → tools/fotos/decisao.json
"""
import csv, glob, json, re, sys, unicodedata
from pathlib import Path

A = Path(__file__).resolve().parent
csv.field_size_limit(10**9)

def norm(s):
    s = unicodedata.normalize("NFD", str(s).lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")

SIN = {"pads": "pad", "patches": "patch", "masks": "mask", "toners": "toner", "creams": "cream", "serums": "serum",
       "ampoules": "ampoule", "sheets": "sheet", "cleansers": "cleanser", "foams": "foam", "gels": "gel", "essences": "essence",
       "suncream": "sun cream", "sunscreens": "sunscreen", "lips": "lip", "balms": "balm", "oils": "oil", "pcs": "ea"}
GENERICAS = set("sheet ea the and with for of in a to by new set count piece pieces pc x".split())
PARE = set("the and with for of in a to by".split())

def toks(s):
    s = norm(s).replace("&", " and ")
    s = re.sub(r"\d+(?:[.,]\d+)?\s*(ml|g|fl\s*oz|oz|ea|pcs|pads?|patches|sheets?|unidades?|un)\b", " ", s)
    s = re.sub(r"\(.*?\)", " ", s)
    out = []
    for w in re.findall(r"[a-z0-9]+", s):
        w = SIN.get(w, w)
        out += w.split()
    return [w for w in out if not w.isdigit()]

def tamanhos(s):
    s = norm(s).replace(",", ".")
    r = set()
    for n, u in re.findall(r"(\d+(?:\.\d+)?)\s*(ml|g|ea|pcs|pads?|patches|sheets?|unidades?|un)\b", s):
        u = {"pcs": "un", "pad": "un", "pads": "un", "patches": "un", "sheet": "un", "sheets": "un", "unidade": "un", "unidades": "un", "ea": "un"}.get(u, u)
        r.add((float(n), u))
    return r

# catálogos oficiais
CAT = {}
for f in glob.glob(str(A.parent / "fontes/catalogos/*.json")):
    d = json.load(open(f))
    CAT[norm(d["marca"])] = d
ALIAS = {"round lab": "round lab", "beauty of joseon": "beauty of joseon", "cell fusion c": "cell fusion c", "dr.melaxin": "dr.melaxin",
         "centellian 24": "centellian 24", "skin1004": "skin1004"}

prod = {}
for arq in sys.argv[1:]:
    for r in csv.DictReader(open(arq, encoding="utf-8")):
        if r["Title"]:
            prod[r["Handle"]] = {"handle": r["Handle"], "titulo": r["Title"], "marca": r["Vendor"], "fotos": []}
        if r["Image Src"] and r["Handle"] in prod:
            prod[r["Handle"]]["fotos"].append(r["Image Src"])

lote1 = set(json.load(open(A.parent.parent / "site/lote1.json")))
# título atual de cada produto (o export é mais antigo; as fichas têm o nome que está no site hoje)
for f in json.load(open(A.parent.parent / "bomi/fichas-produtos.json")):
    if f["handle"] in prod: prod[f["handle"]]["titulo"] = f["nome"]; prod[f["handle"]]["marca"] = f["marca"] or prod[f["handle"]]["marca"]
saida = {}
for h in sorted(lote1):
    p = prod.get(h)
    if not p:
        saida[h] = {"ok": False, "motivo": "não está no export do Shopify"}; continue
    cat = CAT.get(norm(p["marca"]))
    if not cat:
        saida[h] = {"ok": False, "motivo": "marca sem catálogo oficial baixado", "fotos_originais": p["fotos"]}; continue
    en = p["titulo"].split(":")[0]
    marca_t = set(toks(cat["marca"])) | set(toks(p["marca"]))
    nosso = [w for w in toks(en) if w not in marca_t and w not in PARE]
    tam = tamanhos(p["titulo"])
    if not nosso:
        saida[h] = {"ok": False, "motivo": "nome sem palavras suficientes para comparar", "fotos_originais": p["fotos"]}; continue
    achados = []
    for o in cat["produtos"]:
        if not o.get("images"): continue
        ot = [w for w in toks(o["title"]) if w not in marca_t]
        if not set(nosso) <= set(ot): continue
        extras = set(ot) - set(nosso) - GENERICAS - PARE
        if extras: continue
        vt = [o["title"]] + [v.get("title", "") for v in o.get("variants", [])]
        otam = set().union(*[tamanhos(x) for x in vt])
        if tam:
            if not otam:
                # o site oficial não escreve o tamanho: só aceita se a marca tem UMA página com esse nome e UMA versão
                # (não existe outro tamanho para confundir); o rótulo é conferido na folha visual
                if any(re.search(r"\d\s*(ml|g|oz)\b", norm(v.get("title", ""))) for v in o.get("variants", [])): continue
            elif not (tam & otam): continue            # tamanho diferente
            if len({t for t in otam if t[1] in {u for _, u in tam}}) > 1 and len(o.get("variants", [])) > 1:
                continue                               # vários tamanhos na mesma página: a foto pode ser do outro
        achados.append(o)
    if len(achados) != 1:
        saida[h] = {"ok": False, "motivo": "nenhum produto oficial idêntico" if not achados else "mais de um produto oficial possível", "fotos_originais": p["fotos"]}
        continue
    o = achados[0]
    saida[h] = {"ok": True, "titulo": p["titulo"], "marca": p["marca"], "oficial": o["title"], "url": "https://" + cat["site"] + "/products/" + o["handle"],
                "fotos": o["images"][:8], "fotos_originais": p["fotos"]}

(A / "decisao.json").write_text(json.dumps(saida, ensure_ascii=False, indent=0))
from collections import Counter
print("lote 1:", len(lote1), "· confirmados pela regra:", sum(v["ok"] for v in saida.values()))
print(Counter(v.get("motivo", "ok") for v in saida.values()).most_common())
