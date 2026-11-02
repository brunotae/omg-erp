import urllib.request, gzip, os, re, html
UA = {"user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129 Safari/537.36", "accept-language": "en-US,en;q=0.9"}
def get(u):
    r = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=90); b = r.read()
    if r.headers.get("content-encoding") == "gzip" or b[:2] == b"\x1f\x8b": b = gzip.decompress(b)
    return b.decode("utf-8", "replace")
os.makedirs("tools/precos/ext/dados/purito", exist_ok=True)
for h in ["wonder-releaf-centella-serum-unscented", "daily-soft-touch-sunscreen-spf50-pa", "wonder-releaf-centella-bb-cushion", "wonder-releaf-centella-toner-unscented", "wonder-releaf-centella-cream-unscented", "wonder-releaf-centella-daily-sun-lotion-spf50-pa"]:
    t = get(f"https://purito.com/product/{h}/"); open(f"tools/precos/ext/dados/purito/p_{h}.html", "w").write(t)
    print(h, re.findall(r'\$\s?[\d.]+', t)[:10])
