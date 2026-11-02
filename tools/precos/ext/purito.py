# Catálogo oficial purito.com (WordPress): todos os produtos com nome, link, preço US$, selos (Best/New/No.1),
# ordem de popularidade e, na página de cada produto, tamanho e foto principal.
import urllib.request, re, json, os, gzip, time, html
UA = {"user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129 Safari/537.36", "accept-language": "en-US,en;q=0.9"}
def get(u):
    r = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=90); b = r.read()
    if r.headers.get("content-encoding") == "gzip" or b[:2] == b"\x1f\x8b": b = gzip.decompress(b)
    return b.decode("utf-8", "replace")
txt = lambda s: re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()
def lista(base):
    itens = []
    for pg in range(1, 12):
        u = base if pg == 1 else base.replace("/product/", f"/product/page/{pg}/")
        try: t = get(u)
        except Exception as e: break
        bl = t.split('class="global-product-list__item')[1:]
        if not bl: break
        for b in bl:
            m = re.search(r'href="https://purito\.com/product/([^/"?]+)/?', b)
            if not m: continue
            itens.append({"handle": m.group(1), "nome": txt(re.search(r'__title[^>]*>(.*?)</h2>', b, re.S).group(1)) if re.search(r'__title[^>]*>(.*?)</h2>', b, re.S) else "",
                "preco": float(re.search(r'\$\s*([\d.,]+)', b).group(1).replace(",", "")) if re.search(r'\$\s*([\d.,]+)', b) else None,
                "selos": re.findall(r'__label--[a-z0-9]+[^>]*>([^<]+)<', b), "foto": (re.search(r'<img[^>]+src="([^"]+)"', b) or [None, None])[1]})
        time.sleep(1)
    return itens
todos = lista("https://purito.com/product/")
pop = [x["handle"] for x in lista("https://purito.com/product/?sort=popularity")]
best = [x["handle"] for x in lista("https://purito.com/product-labels/best/?sort=popularity".replace("product-labels/best/", "product/").replace("/product/?", "/product-labels/best/?"))] if False else []
vistos = {}
for x in todos: vistos.setdefault(x["handle"], x)
for h, x in vistos.items():
    try:
        t = get(f"https://purito.com/product/{h}/")
        tam = re.findall(r'(\d+(?:\.\d+)?\s?(?:ml|mL|g|fl\.?\s?oz|ea|EA|sheets|pads))', txt(t))
        x["tamanhos"] = list(dict.fromkeys(tam))[:6]
        og = re.search(r'<meta property="og:image" content="([^"]+)"', t); x["og"] = og.group(1) if og else None
        x["onde_comprar"] = sorted(set(re.findall(r'href="https?://(?:www\.)?(amazon\.com|target\.com|us\.oliveyoung\.com|yesstyle\.com|stylevana\.com|ulta\.com)[^"]*"', t)))
        x["descricao"] = txt((re.search(r'<meta name="description" content="([^"]+)"', t) or [None, ""])[1])[:300]
    except Exception as e: x["erro"] = str(e)[:120]
    time.sleep(1)
out = {"lido": time.strftime("%Y-%m-%d"), "total": len(vistos), "ordem_popularidade": pop, "produtos": list(vistos.values())}
json.dump(out, open("tools/precos/ext/dados/purito.json", "w"), indent=1, ensure_ascii=False)
print(len(vistos), len(pop))
