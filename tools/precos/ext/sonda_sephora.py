# Sonda: a Sephora Brasil vende a marca? (procura o nome da marca nos links do sitemap de produtos)
import urllib.request, re, os, json, gzip
M = os.environ.get("MARCA", "purito")
UA = {"user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129 Safari/537.36"}
def get(u):
    r = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=90); b = r.read()
    if r.headers.get("content-encoding") == "gzip" or b[:2] == b"\x1f\x8b": b = gzip.decompress(b)
    return b.decode("utf-8", "replace")
t = get("https://www.sephora.com.br/sitemap_0-product.xml")
todos = sorted(set(re.findall(r"https://www\.sephora\.com\.br/[^<\s\"']+\.html", t)))
achou = [u for u in todos if M in u.lower()]
out = {"marca": M, "links_no_sitemap": len(todos), "achados": achou}
json.dump(out, open(f"tools/precos/ext/dados/sephora_{M}.json", "w"), indent=1); print(len(todos), len(achou), achou[:20])
