# Lê preço promocional: loja oficial Numbuzin EUA (preço atual, preço riscado, cupom do site) e Jini (preço, Pix).
import urllib.request, json, re, gzip, time, html
UA={"user-agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129 Safari/537.36","accept-language":"en-US,en;q=0.9,pt-BR;q=0.8"}
def get(u):
    r=urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=60); b=r.read()
    if r.headers.get("content-encoding")=="gzip": b=gzip.decompress(b)
    return b.decode("utf-8","replace")
def txt(s): return re.sub(r'\s+',' ',html.unescape(re.sub(r'<[^>]+>',' ',s)))
U=json.load(open("tools/precos/ext/promo_urls.json"))
out={"us":[],"jini":[]}
for u in U["us"]:
    h=u.rstrip('/').split('/')[-1]; it={"url":u}
    try:
        j=json.loads(get(f"https://numbuzinus.com/products/{h}.js"))
        it["variantes"]=[{"nome":v["title"],"preco":v["price"]/100,"riscado":(v.get("compare_at_price") or 0)/100,"disp":v.get("available")} for v in j["variants"]]
        t=get(u)
        it["cupons"]=sorted(set(re.findall(r'\b(NUMBUZIN\w*\d+\w*)\b',t)))
        i=t.find("Use Code"); it["trecho_cupom"]=txt(t[max(0,i-1500):i+400])[-500:] if i>=0 else ""
        m=re.search(r'(?:discount|desconto|percent)[^<]{0,40}?(\d{1,2})\s*%',t,re.I); it["pct"]=m.group(1) if m else None
    except Exception as e: it["erro"]=str(e)[:200]
    out["us"].append(it); time.sleep(1)
for u in U["jini"]:
    it={"url":u}
    try:
        t=get(u); T=txt(t)
        it["ld"]=re.findall(r'"price"\s*:\s*"?([\d.]+)',t)[:6]
        it["pix"]=[T[max(0,m.start()-160):m.end()+60] for m in re.finditer(r'[Pp]ix',T)][:4]
        it["precos"]=re.findall(r'R\$\s?[\d.]+,\d{2}',T)[:12]
        it["riscado"]=re.findall(r'(?:compare|price-compare|js-compare-price)[^>]*>\s*R\$\s?([\d.,]+)',t)[:3]
    except Exception as e: it["erro"]=str(e)[:200]
    out["jini"].append(it); time.sleep(1)
json.dump(out,open("tools/precos/ext/dados/promo.json","w"),ensure_ascii=False,indent=1)
print(len(out["us"]),len(out["jini"]))
