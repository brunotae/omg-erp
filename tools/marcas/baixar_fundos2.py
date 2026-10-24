# Busca fotos de produto em sites OFICIAIS das marcas que ainda estão com padrão bojagi.
# Ordem: Shopify /products.json → WooCommerce Store API → página inicial (links de produto + og:image, imagens cafe24 /web/product/).
# Grava até 8 candidatas por marca em tools/marcas/fundos/<slug>/N.jpg e um relatório em tools/marcas/fundos2_relatorio.json.
import csv, json, os, io, re, urllib.request, urllib.parse, html
from PIL import Image
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"}
def get(url, t=25):
    r = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=t)
    return r.geturl(), r.read()
def txt(b):
    for enc in ("utf-8", "euc-kr", "latin-1"):
        try: return b.decode(enc)
        except Exception: pass
    return ""
def absu(base, u):
    u = html.unescape(u.strip())
    if u.startswith("//"): return "https:" + u
    return urllib.parse.urljoin(base, u)
RUIM = re.compile(r"logo|icon|banner|bnr|sprite|btn|arrow|blank|pixel|sns|kakao|naver|insta|facebook|youtube|payment|badge|award|event|popup|svg$", re.I)
rel = {}
for r in csv.DictReader(open("tools/marcas/sites2.csv", encoding="utf-8"), delimiter="|"):
    slug, termo = r["slug"], r["termo"].lower()
    res = {"marca": r["marca"], "tentativas": [], "site": "", "metodo": "", "titulo_pagina": "", "candidatos": []}
    for d in [x.strip() for x in r["sites"].split(",") if x.strip()]:
        base = f"https://{d}/"
        # 1) Shopify
        try:
            fu, b = get(base + "products.json?limit=250")
            ps = json.loads(b).get("products", [])
            if ps:
                vend = {p.get("vendor", "") for p in ps}
                cands = [{"titulo": p["title"], "url": p["images"][0]["src"]} for p in ps if p.get("images")]
                res.update(site=d, metodo="shopify", vendors=sorted(vend)[:6], candidatos=cands[:40]); res["tentativas"].append(f"{d}: shopify ok ({len(ps)})"); break
        except Exception as e: res["tentativas"].append(f"{d}: shopify {type(e).__name__}")
        # 2) Woo
        try:
            fu, b = get(base + "wp-json/wc/store/products?per_page=40")
            ps = json.loads(b)
            if isinstance(ps, list) and ps:
                cands = [{"titulo": p.get("name"), "url": p["images"][0]["src"]} for p in ps if p.get("images")]
                res.update(site=d, metodo="woocommerce", candidatos=cands[:40]); res["tentativas"].append(f"{d}: woo ok"); break
        except Exception as e: res["tentativas"].append(f"{d}: woo {type(e).__name__}")
        # 3) HTML
        try:
            fu, b = get(base); h = txt(b)
            m = re.search(r"<title[^>]*>(.*?)</title>", h, re.S | re.I); tit = html.unescape(m.group(1).strip())[:120] if m else ""
            imgs = []
            for u in re.findall(r"""(?:src|data-src|data-original|ec-data-src)=["']([^"']+\.(?:jpe?g|png|webp)[^"']*)["']""", h, re.I):
                if re.search(r"/web/product/(big|medium|extra|tiny|small)|/goods/|/product/|/products/|/upload/.*prd|/item/", u, re.I) and not RUIM.search(u):
                    imgs.append(absu(fu, u))
            links = []
            for u in re.findall(r"""href=["']([^"']+)["']""", h):
                if re.search(r"/product/[^\"']*\d|product_no=\d|goods_view|goodsNo=\d|/goods/\d|/products/[a-z0-9\-]+$|/shop/view", u, re.I):
                    links.append(absu(fu, u))
            links = list(dict.fromkeys(links))[:14]
            ogs = []
            for L in links:
                try:
                    _, b2 = get(L, 20); h2 = txt(b2)
                    m = re.search(r"""property=["']og:image["'][^>]*content=["']([^"']+)""", h2) or re.search(r"""content=["']([^"']+)["'][^>]*property=["']og:image""", h2)
                    mt = re.search(r"""property=["']og:title["'][^>]*content=["']([^"']+)""", h2)
                    if m and not RUIM.search(m.group(1)): ogs.append({"titulo": html.unescape(mt.group(1)) if mt else L, "url": absu(L, m.group(1))})
                except Exception: pass
            cands = ogs + [{"titulo": "home", "url": u} for u in dict.fromkeys(imgs)]
            if cands:
                res.update(site=d, metodo="html", titulo_pagina=tit, candidatos=cands[:40]); res["tentativas"].append(f"{d}: html ok ({len(ogs)} og, {len(imgs)} img)"); break
            res["tentativas"].append(f"{d}: html sem produtos ({tit})")
        except Exception as e: res["tentativas"].append(f"{d}: html {type(e).__name__}")
    # baixa até 8 (preferindo títulos com o termo da marca quando a loja é multimarca)
    cs = res["candidatos"]
    pref = [c for c in cs if termo in (c.get("titulo") or "").lower()]
    escolha = (pref + [c for c in cs if c not in pref])[:20]
    os.makedirs(f"tools/marcas/fundos/{slug}", exist_ok=True)
    ok = []
    for c in escolha:
        if len(ok) >= 8: break
        try:
            _, data = get(c["url"], 30)
            im = Image.open(io.BytesIO(data)).convert("RGBA")
            if min(im.size) < 300: continue
            bg = Image.new("RGBA", im.size, (255, 255, 255, 255)); bg.alpha_composite(im); im = bg.convert("RGB"); im.thumbnail((800, 800))
            im.save(f"tools/marcas/fundos/{slug}/{len(ok)}.jpg", quality=85); ok.append(c)
        except Exception: pass
    res["baixadas"] = ok
    rel[slug] = res
    print(slug, res["site"], res["metodo"], len(ok), "|", " ; ".join(res["tentativas"])[:300], flush=True)
json.dump(rel, open("tools/marcas/fundos2_relatorio.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
