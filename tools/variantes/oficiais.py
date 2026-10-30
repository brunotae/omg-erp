# Baixa do site oficial as versões (variantes) dos produtos que no nosso site estão sem escolha.
import json, urllib.request, re
UA={'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129 Safari/537.36','Accept':'application/json'}
ALVOS={
 'medicube.us':['affordable glass glow 7-day','azelaic acid exosome shot','hyaluronic acid capsule cream','pdrn pink collagen exosome shot','pdrn pink glow full set','pdrn pink peptide toner','zero exosome shot'],
 'tirtir.us':['waterism lip plumper','my glow cream cushion','mask fit red cushion mini','mask fit all-cover cushion','mask fit all cover cushion','all-cover cushion mini','all cover cushion mini'],
 'beautyofjoseon.com':['tinted mineral dayscreen'],
 'roundlab.com':['birch','sun cushion'],
 'mixsoon.us':['plumping glow balm','glow balm'],
 'mixsoon.com':['plumping glow balm','glow balm'],
}
def get(u):
    return json.loads(urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=40).read())
out={}
for dom,kws in ALVOS.items():
    try:
        prods=[];p=1
        while p<10:
            L=get(f'https://{dom}/products.json?limit=250&page={p}')['products'];prods+=L
            if len(L)<250:break
            p+=1
    except Exception as e:
        out[dom]={'erro':str(e)[:120]};continue
    hits=[]
    for pr in prods:
        t=pr['title'].lower()
        if any(k in t for k in kws) and not re.search(r'subscr|gift\]',t):
            imgs={i['id']:i['src'] for i in pr.get('images',[])}
            hits.append({'titulo':pr['title'],'handle':pr['handle'],'link':f"https://{dom}/products/{pr['handle']}",
              'opcoes':[o['name'] for o in pr.get('options',[])],
              'variantes':[{'nome':v['title'],'preco':v['price'],'disp':v.get('available'),'sku':v.get('sku'),'img':(v.get('featured_image') or {}).get('src') or imgs.get(v.get('image_id'))} for v in pr['variants']],
              'imagens':[i['src'] for i in pr.get('images',[])][:12]})
    out[dom]=hits
    print(dom,len(hits))
json.dump(out,open('tools/variantes/oficiais.json','w'),ensure_ascii=False,indent=1)
