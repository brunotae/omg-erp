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

Uso: python3 tools/fotos/regra_todos.py EXPORT1.csv EXPORT2.csv → tools/fotos/decisao_resto.json (produtos fora do lote 1; fontes: sites oficiais e lojas)
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


VAREJO = ["www.dodoskin.com", "www.mirai-skin.com", "sokoglam.com", "ohlolly.com", "www.kollab.com.br", "koreanskincare.nl", "seoulceuticals.com", "fwee.us", "manyo.us"]
ALIAS = {"centellian24": "centellian 24", "lador": "la'dor", "vt": "vt cosmetics", "dr. g": "dr.g", "dr.althea": "dr. althea", "medi-peel": "medipeel",
         "romand": "rom&nd", "rom nd": "rom&nd", "dalba": "d'alba", "purito": "purito seoul", "ma:nyo": "manyo", "ongredients": "ongredients", "biodance": "biodance"}
def nm(v):
    v = norm(v).strip(); v = re.sub(r"[^a-z0-9&:' .]", "", v); return ALIAS.get(v, v)
FONTES = {}  # marca normalizada -> [(origem, site, produto)]
for f in glob.glob(str(A.parent / "fontes/catalogos/*.json")):
    d = json.load(open(f))
    for o in d["produtos"]: FONTES.setdefault(nm(d["marca"]), []).append(("oficial", d["site"], o))
for s in VAREJO:
    p = A.parent / "fontes/catalogos_varejo" / f"{s}.json"
    if not p.exists(): continue
    for o in json.load(open(p))["produtos"]:
        if o.get("vendor"): FONTES.setdefault(nm(o["vendor"]), []).append(("loja", s, o))

# palavras do nome da marca como aparecem nas lojas (ex.: "purito" para PURITO SEOUL)
MARCAS_TOK = {}
for m, lst in FONTES.items():
    MARCAS_TOK[m] = set(toks(m)) | {w for _, _, o in lst[:1] for w in toks(o.get("vendor") or "")}
for m in list(MARCAS_TOK):
    for a, b in ALIAS.items():
        if b == m: MARCAS_TOK[m] |= set(toks(a))
prod = {}
for arq in sys.argv[1:]:
    for r in csv.DictReader(open(arq, encoding="utf-8")):
        if r["Title"]:
            prod[r["Handle"]] = {"handle": r["Handle"], "titulo": r["Title"], "marca": r["Vendor"], "fotos": []}
        if r["Image Src"] and r["Handle"] in prod:
            prod[r["Handle"]]["fotos"].append(r["Image Src"])
lote1 = set(json.load(open(A.parent.parent / "site/lote1.json")))

EXTRA_GEN = set("pa spf spf50 spf30 spf45 spf35 spf40 spf15 expiration imminen imminent new renewal renewed upgraded big size box ea 1ea 2ea 1 x ml g oz fl seoul".split())
def limpa_titulo(t):
    t = re.sub(r"\[[^\]]*\]", " ", t)          # [PURITO SEOUL], [Expiration imminent]
    t = re.sub(r"\bspf\s*\d+\+?|pa\s*\+{2,4}", " ", t, flags=re.I)
    return t
TIPOS = set("cream serum ampoule essence toner mask pad patch shampoo conditioner treatment foam cleanser oil balm stick lotion mist gel cushion tint lip eye sun sunscreen suncream powder scrub wash kit set duo trio bundle refill mini palette mascara liner brush emulsion spray soap body hand hair scalp pack peel exfoliator primer foundation concealer blush".split())
def numeros(t):
    t = norm(t)
    t = re.sub(r"\d+(?:[.,]\d+)?\s*(ml|g|fl\s*oz|oz|ea|pcs|pads?|patches|sheets?|unidades?|un|x)\b", " ", t)
    t = re.sub(r"spf\s*\d+|pa\s*\+*", " ", t)
    return set(re.findall(r"\d+(?:[.,]\d+)?", t))
PT = set("de da do das dos com para e em o a os as kit conjunto creme serum mascara tonico espuma oleo limpeza protetor solar unidades un ml g".split())
def casa(p, origem, nome=None):
    en = limpa_titulo(nome if nome is not None else p["titulo"].split(":")[0])
    marca_t = set(toks(p["marca"])) | {"the"} | set(toks(nm(p["marca"]))) | set(toks(nm(p["marca"]).replace(" ", "")))
    nosso = [w for w in toks(en) if w not in marca_t and w not in PARE]
    tam = tamanhos(p["titulo"])
    if len(nosso) < 2: return None, "nome curto ou só em português"
    achados = []
    for org, site, o in FONTES.get(nm(p["marca"]), []):
        if org != origem or not o.get("images"): continue
        ot = [w for w in toks(limpa_titulo(o["title"])) if w not in marca_t and w not in MARCAS_TOK.get(nm(p["marca"]), set())]
        if not set(nosso) <= set(ot): continue
        if (set(ot) & TIPOS) != (set(nosso) & TIPOS): continue           # mesmo tipo de produto (creme ≠ sérum ≠ máscara…)
        nn, on = numeros(en), numeros(o["title"])
        if nn != on and (nn or on - {"1"}): continue                      # No.3 ≠ No.5, Retinol 0.1 ≠ 0.3
        vt = [o["title"]] + [v if isinstance(v, str) else v.get("title", "") for v in o.get("variants", [])]
        otam = set().union(*[tamanhos(x) for x in vt])
        if tam:
            if not otam:
                if any(re.search(r"\d\s*(ml|g|oz)\b", norm(x)) for x in vt[1:]): continue
            elif not (tam <= otam): continue
            if len({t for t in otam if t[1] in {u for _, u in tam}}) > 1 and len(vt) > 2: continue
        achados.append((site, o))
    # o mesmo produto em vários sites/lojas conta como um só se o título for igual
    # entre os que passaram, fica o de nome mais parecido (menos palavras a mais); empate entre produtos diferentes = ambíguo
    def extra(o): return len(set(w for w in toks(limpa_titulo(o["title"])) if w not in marca_t) - set(nosso) - EXTRA_GEN)
    if achados:
        m = min(extra(o) for _, o in achados); achados = [(s_, o) for s_, o in achados if extra(o) == m]
    unicos = {}
    for s_, o in achados:
        ch = (frozenset(w for w in toks(limpa_titulo(o["title"])) if w not in marca_t and w not in EXTRA_GEN), frozenset(tamanhos(o["title"])))
        if ch not in unicos or (s_ in ("www.dodoskin.com",) and unicos[ch][0] != "www.dodoskin.com"): unicos[ch] = (s_, o)
    if len(unicos) == 1: return list(unicos.values())[0], None
    return None, ("nenhum idêntico" if not unicos else "mais de um possível")

saida = {}
for h, p in sorted(prod.items()):
    if h in lote1: continue
    if nm(p["marca"]) not in FONTES:
        saida[h] = {"ok": False, "motivo": "marca sem fonte", "titulo": p["titulo"], "marca": p["marca"], "fotos_originais": p["fotos"]}; continue
    r, mot = casa(p, "oficial")
    org = "oficial"
    if not r: r, mot = casa(p, "loja"); org = "loja"
    if not r:  # nome só em português: tenta pelo endereço (handle), que costuma vir em inglês
        hn = " ".join(w for w in re.split(r"[-_]", h) if w and not w.isdigit() and w not in PT and len(w) > 1)
        hn = re.sub(r"\b(\d+)\s+(ml|g|ea)\b", r"\1\2", hn)
        for org in ("oficial", "loja"):
            r, mot2 = casa(p, org, hn)
            if r: org = org + " (pelo endereço)"; break
    if not r:
        saida[h] = {"ok": False, "motivo": mot, "titulo": p["titulo"], "marca": p["marca"], "fotos_originais": p["fotos"]}; continue
    site, o = r
    saida[h] = {"ok": True, "origem": org, "titulo": p["titulo"], "marca": p["marca"], "oficial": o["title"], "url": "https://" + site + "/products/" + o["handle"],
                "fotos": o["images"][:8], "fotos_originais": p["fotos"]}
(A / "decisao_resto.json").write_text(json.dumps(saida, ensure_ascii=False, indent=0))
from collections import Counter
print("resto:", len(saida), "· casados:", sum(v["ok"] for v in saida.values()), Counter(v.get("origem") for v in saida.values() if v["ok"]))
print(Counter(v.get("motivo", "ok") for v in saida.values()).most_common())
c = Counter((v["marca"], v["ok"]) for v in saida.values())
for m in sorted({v["marca"] for v in saida.values()}, key=lambda m: -(c[(m, True)] + c[(m, False)]))[:40]:
    print(f"{m:22s} ok {c[(m, True)]:4d}  não {c[(m, False)]:4d}")
