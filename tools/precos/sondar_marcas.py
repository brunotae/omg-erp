# Sonda sites oficiais das marcas: quais respondem /products.json (Shopify) e em que moeda.
import json, urllib.request
C = {
 'COSRX': ['www.cosrx.com','cosrx.com','us.cosrx.com','cosrx.us'],
 'Anua': ['anua.us','www.anua.us','anuaglobal.com','anua.global','www.anua.com','anuausa.com'],
 'SKIN1004': ['skin1004.com','www.skin1004.com','us.skin1004.com','skin1004.us','skin1004global.com'],
 'Beauty of Joseon': ['beautyofjoseon.com','www.beautyofjoseon.com','beautyofjoseon.us'],
 'medicube': ['medicube.us','www.medicube.us','medicube.global'],
 'TIRTIR': ['tirtir.us','www.tirtir.us','tirtirglobal.com','tirtir.global','tirtirusa.com','us.tirtir.com'],
 'ROUND LAB': ['roundlab.us','roundlabus.com','www.roundlab.us','roundlab.global','roundlabglobal.com'],
 'celimax': ['celimax.us','celimaxus.com','celimax.global','celimaxglobal.com','www.celimax.com'],
 'BANILA CO': ['banilausa.com','banila.us','www.banilausa.com','banilaco.com','banilaco.us'],
 'numbuzin': ['numbuzin.com','numbuzin.us','www.numbuzin.com','numbuzinus.com','numbuzin.global'],
 'PURITO SEOUL': ['purito.com','puritoseoul.com','www.purito.com','purito.us','puritoseoul.us'],
 'Rejuran': ['rejuran.us','rejuranus.com','rejuranshop.com','rejuran.global','rejuranskin.com'],
 'VT Cosmetics': ['vtcosmetics.us','vtcosmeticsus.com','vt-cosmetics.com','vtcosmetics.com','vtglobal.com'],
}
UA = {'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129 Safari/537.36','Accept':'application/json'}
out = {}
for m, ds in C.items():
  out[m] = []
  for d in ds:
    r = {'dominio': d}
    try:
      x = urllib.request.urlopen(urllib.request.Request(f'https://{d}/products.json?limit=3', headers=UA), timeout=20)
      j = json.loads(x.read()); r['final'] = x.geturl(); r['ok'] = True
      r['exemplo'] = [(p['title'], p['variants'][0]['price']) for p in j.get('products', [])[:3]]
      try:
        mt = json.loads(urllib.request.urlopen(urllib.request.Request(f'https://{d}/meta.json', headers=UA), timeout=20).read())
        r['loja'] = mt.get('name'); r['moeda'] = mt.get('currency'); r['n'] = mt.get('published_products_count')
      except Exception as e: r['meta'] = str(e)[:80]
    except Exception as e:
      r['ok'] = False; r['erro'] = str(e)[:100]
    out[m].append(r); print(m, d, r.get('ok'), r.get('moeda'), r.get('n'), r.get('erro',''), flush=True)
json.dump(out, open('tools/precos/sonda_marcas.json','w'), ensure_ascii=False, indent=1)
