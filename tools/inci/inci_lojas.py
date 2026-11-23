# INCI (lista de ingredientes) das lojas oficiais (Shopify products.json). Saída: tools/inci/dados/<marca>.json
import urllib.request, urllib.error, re, json, os, time, gzip, html
UA = {"user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129 Safari/537.36", "accept-language": "en-US,en;q=0.9"}
def get(u):
    for t in range(4):
        try:
            r = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60); b = r.read()
            if r.headers.get("content-encoding") == "gzip": b = gzip.decompress(b)
            return b.decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code != 429 or t == 3: raise
            time.sleep(20 * (t + 1))
LOJAS = json.loads(open("tools/inci/lojas.json").read())
os.makedirs("tools/inci/dados", exist_ok=True)
log = {}
def txt(h): return html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " | ", re.sub(r"(?s)<(script|style)[^>]*>.*?</\1>", " ", h or ""))))
def tre(t): return [t[m.start():m.start()+3000] for m in re.finditer(r"(?i)ingredient", t)][:5]
for marca, cfg in LOJAS.items():
    out = []; usada = None; p = []
    for d in cfg["d"]:
        try:
            p = json.loads(get(f"https://{d}/products.json?limit=250&page=1"))["products"]
            if p: usada = d; break
        except Exception as e: log[f"{marca}:{d}"] = str(e)[:150]
    if not usada: json.dump(log, open("tools/inci/dados/_log.json", "w"), ensure_ascii=False, indent=1); continue
    todos = list(p)
    for pg in range(2, 12):
        time.sleep(2)
        try: p = json.loads(get(f"https://{usada}/products.json?limit=250&page={pg}"))["products"]
        except Exception as e: log[f"{marca}:pg{pg}"] = str(e)[:150]; break
        if not p: break
        todos += p
    for x in todos:
        ti = (x.get("title") or "").lower()
        if not any(k in ti for k in cfg["a"]): continue
        o = {"title": x.get("title"), "url": f"https://{usada}/products/{x.get('handle')}", "trechos": tre(txt(x.get("body_html")))}
        if not any(re.search(r"(?i)\bwater\b|aqua", s) for s in o["trechos"]):
            try: time.sleep(1); o["trechos"] = tre(txt(get(o["url"]))); o["pagina"] = 1
            except Exception as e: o["erro"] = str(e)[:100]
        out.append(o)
    log[marca] = {"loja": usada, "catalogo": len(todos), "alvos": len(out)}
    json.dump(out, open(f"tools/inci/dados/{marca}.json", "w"), ensure_ascii=False)
    json.dump(log, open("tools/inci/dados/_log.json", "w"), ensure_ascii=False, indent=1)
print(log)
