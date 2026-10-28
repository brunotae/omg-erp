"""Baixa catálogos completos (Shopify /products.json) de varejistas de K-beauty e de sites oficiais extras.
Saída: tools/fontes/catalogos_varejo/<dominio>.json {site, produtos:[{title,handle,vendor,variants,images}]}"""
import json, os, time, urllib.request
SITES = ["www.dodoskin.com", "www.mirai-skin.com", "sokoglam.com", "ohlolly.com", "www.kollab.com.br", "shop.soil911.com",
         "koreanskincare.nl", "kbeautyaddiction.co.uk", "www.beautytap.com", "seoulceuticals.com", "www.yesstyle.com",
         "abib.us", "abib.com", "mediheal.us", "global.mediheal.com", "aromatica.us", "numbuzin.us", "vtcosmetics.us", "vt-cosmetics.us",
         "gongskin.us", "somebymi.us", "somebymi-us.com", "romand.us", "dalba.us", "purito.com", "puritoseoul.com", "drg.us",
         "sonatural.us", "eqqualberry.us", "dralthea.com", "dralthea.us", "rejuran.us", "apieu.us", "beplain.us", "beplain.com",
         "kaine.us", "ilsoskin.com", "wellage.us", "clio-global.com", "clubclio.us", "periperabeauty.com", "ongredients.us",
         "purcell.us", "fwee.us", "fwee.kr", "hince.us", "hince.co", "banilaco.com", "banila.us", "aestura.us", "sungboon-editor.com",
         "anotherface.us", "manyo.us", "manyoshop.com", "growus.us", "unove.us", "coeval.us", "lilyeve.us", "freshian.us",
         "gyeolhaus.com", "arcanic.us", "drforhair.us", "tsshampoo.us", "addict.us", "for-cosmetic.com", "drreju-all.com"]
def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Macintosh) Chrome/126"})
    with urllib.request.urlopen(req, timeout=30) as r: return json.loads(r.read())
os.makedirs("tools/fontes/catalogos_varejo", exist_ok=True)
for s in SITES:
    prods, vistos = [], set()
    for page in range(1, 80):
        try: ps = get(f"https://{s}/products.json?limit=250&page={page}").get("products", [])
        except Exception as e:
            if page == 1: print(s, "X", type(e).__name__)
            break
        novos = [p for p in ps if p["id"] not in vistos]
        if not novos: break
        for p in novos:
            vistos.add(p["id"])
            prods.append(dict(title=p.get("title"), handle=p.get("handle"), vendor=p.get("vendor"),
                              variants=[v.get("title") for v in p.get("variants", [])][:30], images=[i.get("src") for i in p.get("images", [])][:10]))
        time.sleep(0.3)
    if prods:
        json.dump(dict(site=s, produtos=prods), open(f"tools/fontes/catalogos_varejo/{s}.json", "w"), ensure_ascii=False)
        print(s, len(prods), flush=True)
