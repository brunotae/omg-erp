# Unleashia: catálogo da loja oficial coreana (Cafe24) + referências de preço no exterior (Jolse, YesStyle, Soko Glam, Stylevana).
# Roda no GitHub Actions (o ambiente do Claude não acessa sites coreanos). Saída: tools/marcas/unleashia/dados/
import urllib.request, urllib.error, urllib.parse, re, json, os, time, gzip, html as H
UA = {"user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129 Safari/537.36",
      "accept-language": "ko-KR,ko;q=0.9,en;q=0.8"}
BASE = "https://unleashiacosmetics.com"
OUT = "tools/marcas/unleashia/dados"; os.makedirs(OUT + "/html", exist_ok=True)
log = {}
def get(u, t=60, hdr=None):
    for tent in range(4):
        try:
            r = urllib.request.urlopen(urllib.request.Request(u, headers={**UA, **(hdr or {})}), timeout=t); b = r.read()
            if r.headers.get("content-encoding") == "gzip": b = gzip.decompress(b)
            return b.decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code in (404, 403) or tent == 3: raise
            time.sleep(10 * (tent + 1))
        except Exception:
            if tent == 3: raise
            time.sleep(5)
txt = lambda s: re.sub(r"\s+", " ", H.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()

# 1) lista: todas as categorias, todas as páginas
nos, cats = {}, {}
home = get(BASE + "/")
open(OUT + "/html/home.html", "w").write(home)
cate_ids = sorted(set(re.findall(r"cate_no=(\d+)", home)), key=int)
for c in cate_ids:
    for pg in range(1, 12):
        try: t = get(f"{BASE}/product/list.html?cate_no={c}&page={pg}")
        except Exception as e: log[f"lista_{c}_{pg}"] = str(e)[:120]; break
        if pg == 1: cats[c] = txt((re.findall(r"<title>(.*?)</title>", t, re.S) or [""])[0])
        if pg == 1 and c == "81": open(OUT + "/html/lista81.html", "w").write(t)
        achou = re.findall(r"product_no=(\d+)", t) + re.findall(r"/product/[^\"'\s]*?/(\d+)/category/", t)
        novos = [x for x in achou if x not in nos]
        for x in achou: nos.setdefault(x, set()).add(c)
        if not novos and pg > 1: break
        if not achou: break
        time.sleep(1)
for x in re.findall(r"product_no=(\d+)", home) + re.findall(r"/product/[^\"'\s]*?/(\d+)/category/", home): nos.setdefault(x, set()).add("home")
log["categorias"] = cats; log["produtos"] = len(nos)

# 2) cada produto
prods = []
for no in sorted(nos, key=int):
    u = f"{BASE}/product/detail.html?product_no={no}"
    try: t = get(u)
    except Exception as e: prods.append({"no": no, "erro": str(e)[:150]}); continue
    open(f"{OUT}/html/p{no}.html", "w").write(t)
    d = {"no": no, "url": u, "cats": sorted(nos[no], key=lambda x: (not x.isdigit(), int(x) if x.isdigit() else 0))}
    d["nome"] = txt((re.findall(r'<meta property="og:title" content="([^"]*)"', t) or [""])[0])
    d["og_img"] = (re.findall(r'<meta property="og:image" content="([^"]*)"', t) or [""])[0]
    d["descricao_curta"] = txt((re.findall(r'<meta property="og:description" content="([^"]*)"', t) or [""])[0])
    # preço: variáveis JS do Cafe24
    for k in ["product_price", "product_sale_price", "product_price_content", "option_type", "item_listing_type", "is_soldout_icon", "product_name"]:
        m = re.search(r"\bvar\s+" + k + r"\s*=\s*'([^']*)'", t) or re.search(r"\bvar\s+" + k + r"\s*=\s*([0-9.]+)\s*;", t)
        if m: d[k] = m.group(1)
    m = re.search(r"var\s+option_stock_data\s*=\s*'(.*?)';", t, re.S)
    if m:
        try:
            raw = m.group(1).encode().decode("unicode_escape").encode("latin-1").decode("utf-8", "replace")
            d["opcoes"] = [{"codigo": k, "valor": v.get("option_value_orginal") or v.get("option_value"), "nome": v.get("option_name"),
                            "preco_extra": v.get("option_price"), "estoque": v.get("stock_number"), "vende": v.get("is_selling"),
                            "usa_estoque": v.get("use_stock"), "usa_esgotado": v.get("use_soldout"), "esgotado": v.get("is_auto_soldout") or v.get("is_soldout"), "mostra": v.get("is_display")} for k, v in json.loads(raw).items()]
        except Exception as e: d["opcoes_erro"] = str(e)[:150]; d["opcoes_raw"] = m.group(1)[:3000]
    # tabela de informações (xans-product-detaildesign)
    info = {}
    for th, td in re.findall(r"<th[^>]*>(.*?)</th>\s*<td[^>]*>(.*?)</td>", t, re.S):
        k, v = txt(th), txt(td)
        if k and v and len(k) < 40: info[k] = v[:300]
    d["info"] = info
    # imagens: principal/galeria e detalhe
    d["galeria"] = list(dict.fromkeys(re.findall(r'(?:src|ec-data-src)="((?:https?:)?//[^"]+/(?:big|medium|extra/big|extra/small)/[^"]+)"', t)))[:20]
    det = re.search(r'(?:id="prdDetail"|class="cont"|ec-product-detail)(.*?)(?:id="prdInfo"|id="prdReview"|xans-product-additional)', t, re.S)
    imgs = re.findall(r'<img[^>]+(?:ec-data-src|src)="([^"]+)"', det.group(1) if det else "")
    d["detalhe_imgs"] = [("https:" + x if x.startswith("//") else (BASE + x if x.startswith("/") else x)) for x in dict.fromkeys(imgs)][:80]
    d["detalhe_txt"] = txt(det.group(1))[:3000] if det else ""
    d["esgotado_pag"] = bool(re.search(r"displaynone[^\"]*\"[^>]*>\s*SOLD OUT|class=\"[^\"]*soldout[^\"]*\"(?![^>]*displaynone)", t)) 
    prods.append(d); time.sleep(1.2)
json.dump({"lido": time.strftime("%Y-%m-%d %H:%M"), "produtos": prods}, open(OUT + "/kr.json", "w"), ensure_ascii=False, indent=1)

# 3) referências no exterior
def salvar(nome, u, hdr=None):
    try:
        t = get(u, 60, hdr); open(f"{OUT}/html/{nome}.html", "w").write(t); log[nome] = len(t); return t
    except Exception as e: log[nome] = str(e)[:150]; return ""
EN = {"accept-language": "en-US,en;q=0.9"}
jol = []
for pg in range(1, 10):
    t = salvar(f"jolse_{pg}", f"https://jolse.com/product/search.html?banner_action=&keyword=unleashia&page={pg}", EN)
    if not t or "anchorBoxId_" not in t: break
    for bl in re.split(r'<li id="anchorBoxId_', t)[1:]:
        nm = re.search(r'font-weight:bold;">([^<]+)</span></a></strong>', bl); hr = re.search(r'href="(/product/[^"]+)"', bl)
        jol.append({"id": bl.split('"')[0], "nome": H.unescape(nm.group(1)) if nm else "", "precos": re.findall(r"USD ([0-9.]+)", bl)[:2],
                    "url": "https://jolse.com" + hr.group(1) if hr else "", "esgotado": "soldout" in bl.lower() and "displaynone" not in bl.lower().split("soldout")[0][-80:]})
    time.sleep(2)
json.dump(jol, open(OUT + "/jolse.json", "w"), ensure_ascii=False, indent=1)
ys = []
for pg in range(1, 6):
    t = salvar(f"yesstyle_{pg}", f"https://www.yesstyle.com/en/list.html?q=unleashia&bt=1&pn={pg}", EN)
    novos = []
    for bl in t.split('_itemTitle">')[1:]:
        nm = bl.split("</div>")[0]; p1 = re.search(r"_itemPrice[^>]*>US\$\s*([0-9.]+)", bl[:1500]); p2 = re.search(r"_itemSellPrice[^>]*>US\$\s*([0-9.]+)", bl[:1500])
        novos.append((nm, p1.group(1) if p1 else "", p2.group(1) if p2 else ""))
    hrefs = re.findall(r'href="([^"]*info\.html/pid\.\d+)"', t)
    if not novos: break
    for nm, p1, p2 in novos: ys.append({"nome": txt(nm), "preco": p1, "de": p2})
    ys.append({"_links_pagina": pg, "links": list(dict.fromkeys(hrefs))})
    time.sleep(2)
json.dump(ys, open(OUT + "/yesstyle.json", "w"), ensure_ascii=False, indent=1)
# Soko Glam (Shopify): coleção da marca
try:
    t = get("https://sokoglam.com/collections/unleashia/products.json?limit=250", 60, EN)
    open(f"{OUT}/sokoglam.json", "w").write(t); log["sokoglam"] = len(json.loads(t).get("products", []))
except Exception as e: log["sokoglam"] = str(e)[:150]
salvar("stylevana", "https://www.stylevana.com/en_US/brands/unleashia.html", EN)
salvar("oy_global", "https://global.oliveyoung.com/display/search?query=unleashia", EN)
salvar("sephora_us", "https://www.sephora.com/brand/unleashia", EN)
json.dump(log, open(OUT + "/log.json", "w"), ensure_ascii=False, indent=1, default=list)
print(json.dumps(log, ensure_ascii=False, default=list)[:3000])
