# Baixa o catálogo público (Shopify /products.json) dos sites oficiais encontrados, só dados (sem imagens).
import json, urllib.request, csv, time, os
def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (OMG catalog sync)"})
    with urllib.request.urlopen(req, timeout=30) as r: return json.loads(r.read())
os.makedirs("tools/fontes/catalogos", exist_ok=True)
resumo = []
for r in csv.DictReader(open("tools/fontes/resultado.csv", encoding="utf-8")):
    if r["tipo"] != "shopify": continue
    vistos, prods, page = set(), [], 1
    while page <= 40:
        try: ps = get(f"https://{r['site']}/products.json?limit=250&page={page}").get("products", [])
        except Exception as e: print(r["site"], e); break
        novos = [p for p in ps if p["id"] not in vistos]
        if not novos: break
        for p in novos:
            vistos.add(p["id"])
            prods.append(dict(id=p["id"], title=p.get("title"), handle=p.get("handle"), vendor=p.get("vendor"), type=p.get("product_type"),
                variants=[dict(sku=v.get("sku"), title=v.get("title"), grams=v.get("grams"), price=v.get("price")) for v in p.get("variants", [])],
                images=[i.get("src") for i in p.get("images", [])][:8], body=(p.get("body_html") or "")[:1500]))
        page += 1; time.sleep(0.4)
    fn = r["marca"].replace("/", "-").replace("'", "").replace("&", "e").replace(" ", "_")
    json.dump(dict(marca=r["marca"], site=r["site"], produtos=prods), open(f"tools/fontes/catalogos/{fn}.json", "w", encoding="utf-8"), ensure_ascii=False)
    resumo.append((r["marca"], r["site"], len(prods))); print(resumo[-1], flush=True)
