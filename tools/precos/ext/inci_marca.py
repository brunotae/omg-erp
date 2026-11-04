# Lista de ingredientes (INCI) e modo de usar das páginas de produtos da loja oficial (genérico; env LOJA, HANDLES, MARCA)
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
LOJA = os.environ["LOJA"]; M = os.environ["MARCA"]
for h in os.environ["HANDLES"].split(","):
    try:
        t = get(f"https://{LOJA}/products/{h}")
        txt = html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " | ", re.sub(r"(?s)<(script|style)[^>]*>.*?</\1>", " ", t))))
        i = [m.start() for m in re.finditer(r"(?i)ingredients", txt)]
        out[h] = {"trechos": [txt[k:k + 2500] for k in i[:6]], "como_usar": [txt[m.start():m.start() + 800] for m in re.finditer(r"(?i)how to use|application", txt)][:4]}
        if os.environ.get("TEXTO"):  # texto da página a partir do 1º "What It Is"/título, para kits e tamanhos
            k0 = next((m.start() for m in re.finditer(r"(?i)what it is|what's inside|includes|set includes", txt)), 0)
            out[h]["texto"] = txt[max(0, k0 - 3000):k0 + 9000]
            out[h]["tamanhos"] = sorted(set(re.findall(r"(?i)\b\d+(?:[.,]\d+)?\s?(?:ml|g|fl\.? ?oz|pcs|sheets|ea)\b", txt)))[:40]
    except Exception as e: out[h] = str(e)[:200]
    time.sleep(4)
os.makedirs(f"tools/precos/ext/dados/{M}", exist_ok=True)
json.dump(out, open(f"tools/precos/ext/dados/{M}/inci.json", "w"), ensure_ascii=False, indent=1)
print({k: (len(v["trechos"]) if isinstance(v, dict) else v) for k, v in out.items()})
