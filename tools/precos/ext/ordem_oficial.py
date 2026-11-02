# Ordem "mais vendidos" da loja oficial da marca (Shopify): /collections/all?sort_by=best-selling, página a página.
import urllib.request, re, json, os, time, gzip
LOJA = os.environ.get("LOJA", "numbuzinus.com")
UA = {"user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129 Safari/537.36"}
def get(u):
    r = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60); b = r.read()
    if r.headers.get("content-encoding") == "gzip": b = gzip.decompress(b)
    return b.decode("utf-8", "replace")
ordem = []
for pg in range(1, 15):
    t = get(f"https://{LOJA}/collections/all?sort_by=best-selling&page={pg}")
    hs = []
    for h in re.findall(r'href="(?:/[a-z]{2}(?:-[a-z]{2})?)?/(?:collections/[^/"]+/)?products/([a-z0-9][a-z0-9-]*)', t):
        if h not in ordem and h not in hs: hs.append(h)
    print(pg, len(hs))
    if not hs: break
    ordem += hs; time.sleep(2)
os.makedirs("tools/precos/ext/dados", exist_ok=True)
json.dump({"loja": LOJA, "lido": time.strftime("%Y-%m-%d"), "ordem": ordem}, open(f"tools/precos/ext/dados/ordem_{LOJA.split('.')[0]}.json", "w"), indent=0)
print(len(ordem))
