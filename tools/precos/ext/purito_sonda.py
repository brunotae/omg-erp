import urllib.request, gzip, os, re
UA = {"user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129 Safari/537.36", "accept-language": "en-US,en;q=0.9"}
def get(u):
    r = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=90); b = r.read()
    if r.headers.get("content-encoding") == "gzip" or b[:2] == b"\x1f\x8b": b = gzip.decompress(b)
    return b.decode("utf-8", "replace")
os.makedirs("tools/precos/ext/dados/purito", exist_ok=True)
for nome, u in [("produtos", "https://purito.com/product/"), ("best", "https://purito.com/product-labels/best/"), ("page_sitemap", "https://purito.com/page-sitemap.xml"), ("misc", "https://purito.com/sitemap-misc.xml")]:
    try: t = get(u); open(f"tools/precos/ext/dados/purito/{nome}.html", "w").write(t); print(nome, len(t))
    except Exception as e: print(nome, e)
