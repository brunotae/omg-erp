# Sonda: a loja oficial é Shopify? quantos produtos? (products.json)
import urllib.request, json, os, gzip
L = os.environ.get("LOJA", "purito.com")
UA = {"user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129 Safari/537.36"}
out = {"loja": L}
for u in [f"https://{L}/products.json?limit=250", f"https://{L}/collections/all?sort_by=best-selling"]:
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60); b = r.read()
        if r.headers.get("content-encoding") == "gzip": b = gzip.decompress(b)
        t = b.decode("utf-8", "replace")
        if u.endswith("250"):
            p = json.loads(t)["products"]; out["produtos"] = len(p)
            out["exemplos"] = [(x["handle"], x["variants"][0]["price"], x["variants"][0].get("compare_at_price")) for x in p[:8]]
            out["moeda_dica"] = t[:0]
        else:
            out["cupons"] = sorted(set(__import__("re").findall(r"\b([A-Z]{4,}\d{1,3})\b", t)))[:10]; out["shopify"] = "Shopify" in t
    except Exception as e: out[u] = str(e)[:150]
os.makedirs("tools/precos/ext/dados", exist_ok=True)
json.dump(out, open(f"tools/precos/ext/dados/sonda_{L.split('.')[0]}.json", "w"), indent=1, ensure_ascii=False); print(out)
