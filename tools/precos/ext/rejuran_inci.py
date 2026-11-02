# Rejuran: lista de ingredientes (INCI) e texto das páginas dos produtos novos (rejuranusa.com)
import urllib.request, urllib.error, re, json, os, time, gzip, html
UA = {"user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129 Safari/537.36"}
def get(u):
    for t in range(5):
        try:
            r = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60); b = r.read()
            if r.headers.get("content-encoding") == "gzip": b = gzip.decompress(b)
            return b.decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code != 429 or t == 4: raise
            time.sleep(30 * (t + 1))
out = {}
for h in ["perfect-v-tighter", "skin-barrier-sunscreen", "skin-barrier-sun-stick", "refreshing-emulsion", "skin-barrier-duo-set"]:
    try:
        t = get(f"https://rejuranusa.com/products/{h}")
        txt = html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " | ", re.sub(r"(?s)<(script|style)[^>]*>.*?</\1>", " ", t))))
        i = [m.start() for m in re.finditer(r"(?i)ingredients", txt)]
        out[h] = {"trechos": [txt[k:k + 2500] for k in i[:6]], "como_usar": [txt[m.start():m.start() + 800] for m in re.finditer(r"(?i)how to use", txt)][:3]}
    except Exception as e: out[h] = str(e)[:200]
    time.sleep(4)
os.makedirs("tools/precos/ext/dados/rejuran", exist_ok=True)
json.dump(out, open("tools/precos/ext/dados/rejuran/inci.json", "w"), ensure_ascii=False, indent=1)
print({k: (len(v["trechos"]) if isinstance(v, dict) else v) for k, v in out.items()})
