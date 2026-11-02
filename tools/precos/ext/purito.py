# Catálogo oficial purito.com (WooCommerce?): nome, link, preço US$, preço cheio, categorias, ordem de mais vendidos.
import urllib.request, re, json, os, gzip, time, html
UA = {"user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129 Safari/537.36", "accept-language": "en-US,en;q=0.9"}
def get(u):
    r = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=90); b = r.read()
    if r.headers.get("content-encoding") == "gzip" or b[:2] == b"\x1f\x8b": b = gzip.decompress(b)
    return b.decode("utf-8", "replace")
out = {"lido": time.strftime("%Y-%m-%d"), "produtos": [], "notas": []}
# 1) Store API do WooCommerce
try:
    pg = 1
    while pg < 10:
        j = json.loads(get(f"https://purito.com/wp-json/wc/store/v1/products?per_page=100&page={pg}"))
        if not j: break
        for p in j:
            pr = p.get("prices", {}); mu = 10 ** int(pr.get("currency_minor_unit", 2) or 2)
            out["produtos"].append({"id": p["id"], "nome": html.unescape(p["name"]), "link": p["permalink"], "sku": p.get("sku"),
                "preco": int(pr.get("price") or 0) / mu, "cheio": int(pr.get("regular_price") or 0) / mu, "promo": int(pr.get("sale_price") or 0) / mu,
                "moeda": pr.get("currency_code"), "estoque": p.get("is_in_stock"), "comprar": p.get("is_purchasable"),
                "categorias": [c["name"] for c in p.get("categories", [])], "tipo": p.get("type"),
                "variacoes": [{"id": v["id"], "attr": v.get("attributes")} for v in p.get("variations", [])],
                "fotos": [i["src"] for i in p.get("images", [])][:8], "resumo": re.sub(r"<[^>]+>", " ", html.unescape(p.get("short_description") or ""))[:400]})
        pg += 1; time.sleep(1)
    out["notas"].append("store api ok")
except Exception as e:
    out["notas"].append("store api: " + str(e)[:150])
# 2) Sitemap (se a API falhar ou para conferir)
try:
    t = get("https://purito.com/sitemap.xml"); out["sitemaps"] = re.findall(r"<loc>([^<]+)</loc>", t)[:40]
except Exception as e: out["notas"].append("sitemap: " + str(e)[:150])
# 3) Ordem de mais vendidos
try:
    ordem = []
    for pg in range(1, 6):
        t = get(f"https://purito.com/product-labels/best/page/{pg}/?sort=popularity" if pg > 1 else "https://purito.com/product-labels/best/?sort=popularity")
        hs = [h for h in re.findall(r'href="https://purito\.com/product/([a-z0-9-]+)/?"', t) if h not in ordem]
        if not hs: break
        ordem += list(dict.fromkeys(hs)); time.sleep(1)
    out["mais_vendidos"] = ordem
    t = get("https://purito.com/product/?sort=popularity"); out["todos_popularidade"] = list(dict.fromkeys(re.findall(r'href="https://purito\.com/product/([a-z0-9-]+)/?"', t)))
except Exception as e: out["notas"].append("best: " + str(e)[:150])
json.dump(out, open("tools/precos/ext/dados/purito.json", "w"), indent=1, ensure_ascii=False)
print(len(out["produtos"]), out["notas"], len(out.get("mais_vendidos", [])))
