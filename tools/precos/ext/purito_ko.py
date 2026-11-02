# Nome oficial em coreano (purito.com/ko/product/): casa com o produto em inglês pela mesma foto da vitrine.
import urllib.request, re, json, gzip, time, html
UA = {"user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129 Safari/537.36", "accept-language": "ko-KR,ko;q=0.9"}
def get(u):
    r = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=90); b = r.read()
    if r.headers.get("content-encoding") == "gzip" or b[:2] == b"\x1f\x8b": b = gzip.decompress(b)
    return b.decode("utf-8", "replace")
txt = lambda s: re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()
ko = []
for pg in range(1, 12):
    u = "https://purito.com/ko/product/" if pg == 1 else f"https://purito.com/ko/product/page/{pg}/"
    try: t = get(u)
    except Exception as e: print(pg, e); break
    bl = t.split('class="global-product-list__item')[1:]
    if not bl: break
    for b in bl:
        m = re.search(r'href="(https://purito\.com/ko/product/[^"?]+)', b); tt = re.search(r'__title[^>]*>(.*?)</h2>', b, re.S)
        img = re.search(r'<img[^>]+src="([^"]+)"', b); pr = re.search(r'__detail[^>]*>([^<]+)<', b)
        ko.append({"link": m.group(1) if m else None, "nome": txt(tt.group(1)) if tt else "", "foto": img.group(1) if img else None, "preco": txt(pr.group(1)) if pr else ""})
    time.sleep(1)
d = json.load(open("tools/precos/ext/dados/purito.json"))
porfoto = {k["foto"]: k for k in ko if k["foto"]}
n = 0
for p in d["produtos"]:
    p.pop("nome_ko_erro", None)
    k = porfoto.get(p.get("foto"))
    if k: p["nome_ko"] = k["nome"]; p["link_ko"] = k["link"]; p["preco_ko"] = k["preco"]; n += 1
d["ko_lista"] = ko
json.dump(d, open("tools/precos/ext/dados/purito.json", "w"), indent=1, ensure_ascii=False)
print(len(ko), n)
