# Marca (genérico, a partir do script da Rejuran): catálogo da loja oficial dos EUA (Shopify products.json), ordem de mais vendidos,
# cupons visíveis e sonda de outras fontes (Sephora US, loja coreana). Saída: tools/precos/ext/dados/rejuran/
import urllib.request, urllib.error, urllib.parse, re, json, os, time, gzip
UA = {"user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129 Safari/537.36",
      "accept-language": "en-US,en;q=0.9"}
M = os.environ.get("MARCA", "torriden"); OUT = f"tools/precos/ext/dados/{M}"; os.makedirs(OUT, exist_ok=True)
def get(u, t=60):
    for tent in range(5):
        try: return get0(u, t)
        except urllib.error.HTTPError as e:
            if e.code != 429 or tent == 4: raise
            time.sleep(30 * (tent + 1))
def get0(u, t=60):
    r = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=t); b = r.read()
    if r.headers.get("content-encoding") == "gzip": b = gzip.decompress(b)
    return b.decode("utf-8", "replace"), r.geturl()
log = {}
loja = None
for L in os.environ.get("LOJAS", "torriden.us,torridenus.com,us.torriden.com,torriden.com,www.torriden.com,torriden.co.kr").split(","):
    try:
        t, fin = get(f"https://{L}/products.json?limit=250&page=1")
        p = json.loads(t)["products"]; log[L] = {"ok": len(p), "final": fin}
        if p: loja = L; break
    except Exception as e: log[L] = str(e)[:200]
prods = []
if loja:
    for pg in range(1, 10):
        time.sleep(5)
        if pg > 1: t, _ = get(f"https://{loja}/products.json?limit=250&page={pg}")
        p = json.loads(t)["products"]
        if not p: break
        prods += p
        if len(p) < 250: break
    json.dump({"loja": loja, "lido": time.strftime("%Y-%m-%d %H:%M"), "produtos": prods}, open(f"{OUT}/us_products.json", "w"), ensure_ascii=False)
    ordem = []
    for pg in range(1, 15):
        try: t, _ = get(f"https://{loja}/collections/all?sort_by=best-selling&page={pg}")
        except Exception as e: log["ordem_erro"] = str(e)[:200]; break
        hs = []
        for h in re.findall(r'href="(?:/[a-z]{2}(?:-[a-z]{2})?)?/(?:collections/[^/"]+/)?products/([a-z0-9][a-z0-9-]*)', t):
            if h not in ordem and h not in hs: hs.append(h)
        if not hs: break
        ordem += hs; time.sleep(2)
    try:
        t, _ = get(f"https://{loja}/")
        log["cupons_home"] = sorted(set(re.findall(r"\b([A-Z][A-Z0-9]{3,14}\d{1,3})\b", t)))[:30]
        log["textos_off"] = sorted(set(re.findall(r"[^<>\"]{0,60}\d{1,2}% (?:off|OFF|Off)[^<>\"]{0,60}", t)))[:20]
    except Exception as e: log["home"] = str(e)[:200]
    json.dump({"loja": loja, "lido": time.strftime("%Y-%m-%d"), "ordem": ordem}, open(f"{OUT}/ordem_us.json", "w"), indent=0)
# outras fontes (só sonda: status e tamanho)
for nome, u in [("sephora_br", f"https://www.sephora.com.br/busca?q={M}"), ("sephora_br2", f"https://www.sephora.com.br/{M}")]:
    try:
        t, fin = get(u, 40); log[nome] = {"final": fin, "tam": len(t), "titulo": (re.findall(r"<title>([^<]{0,120})", t) or [""])[0]}
        open(f"{OUT}/{nome}.html", "w").write(t)
    except Exception as e: log[nome] = str(e)[:200]
# Brasil: Mercado Livre (API pública) e Amazon BR (busca)
for q in [M]:
    try:
        t, _ = get("https://api.mercadolibre.com/sites/MLB/search?limit=50&q=" + urllib.parse.quote(q))
        open(f"{OUT}/ml_{q.replace(' ', '_')}.json", "w").write(t); log["ml_" + q] = len(json.loads(t).get("results", []))
    except Exception as e: log["ml_" + q] = str(e)[:200]
    try:
        t, _ = get("https://lista.mercadolivre.com.br/" + q.replace(" ", "-"))
        open(f"{OUT}/mlhtml_{q.replace(' ', '_')}.html", "w").write(t); log["mlhtml_" + q] = len(t)
    except Exception as e: log["mlhtml_" + q] = str(e)[:200]
    try:
        t, _ = get("https://www.amazon.com.br/s?k=" + urllib.parse.quote(q))
        open(f"{OUT}/amz_{q.replace(' ', '_')}.html", "w").write(t); log["amz_" + q] = len(t)
    except Exception as e: log["amz_" + q] = str(e)[:200]
    time.sleep(3)
json.dump(log, open(f"{OUT}/log.json", "w"), indent=1, ensure_ascii=False)
print(json.dumps(log, ensure_ascii=False)[:3000]); print("produtos", len(prods))
