# Descobre quais sites oficiais de marca liberam o catálogo (Shopify /products.json).
import json, sys, urllib.request, csv, time
def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (OMG catalog check)"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.status, r.read()
out = []
for line in open("tools/fontes/candidatos.txt", encoding="utf-8"):
    line = line.strip()
    if not line: continue
    marca, doms = line.split("|")
    achou = None
    for d in doms.split(","):
        d = d.strip()
        try:
            st, body = get(f"https://{d}/products.json?limit=250")
            j = json.loads(body)
            ps = j.get("products", [])
            if ps:
                tot = len(ps); page = 2
                while len(ps) == 250 and page < 20:
                    _, b2 = get(f"https://{d}/products.json?limit=250&page={page}")
                    ps = json.loads(b2).get("products", []); tot += len(ps); page += 1
                imgs = sum(1 for p in json.loads(body)["products"] if p.get("images"))
                grams = sum(1 for p in json.loads(body)["products"] for v in p.get("variants", []) if v.get("grams"))
                achou = dict(marca=marca, site=d, tipo="shopify", produtos=tot, com_foto_pag1=imgs, variantes_com_peso_pag1=grams)
                break
        except Exception as e:
            last = f"{d}: {type(e).__name__}"
        time.sleep(0.5)
    if not achou:
        # site existe mas não é shopify?
        for d in doms.split(","):
            try:
                st, _ = get(f"https://{d.strip()}/"); achou = dict(marca=marca, site=d.strip(), tipo="site sem catálogo aberto", produtos="", com_foto_pag1="", variantes_com_peso_pag1=""); break
            except Exception: pass
    out.append(achou or dict(marca=marca, site="", tipo="não encontrado", produtos="", com_foto_pag1="", variantes_com_peso_pag1=""))
    print(out[-1], flush=True)
with open("tools/fontes/resultado.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(out[0].keys())); w.writeheader(); w.writerows(out)
