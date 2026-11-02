# Lê o varejo do exterior para uma marca (YesStyle e Jolse; Olive Young Global e Sephora US bloqueiam/sem a marca).
import urllib.request, json, os, re, gzip, time, html, sys
UA={"user-agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129 Safari/537.36","accept-language":"en-US,en;q=0.9"}
M=os.environ.get("MARCA","numbuzin")
def get(u):
    r=urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=60); b=r.read()
    if r.headers.get("content-encoding")=="gzip": b=gzip.decompress(b)
    return b.decode("utf-8","replace")
usd=lambda s: float(s.replace(",","")) if s else None
out=[]
# YesStyle
seen=set()
for pn in range(1,8):
    try: t=get(f"https://www.yesstyle.com/en/list.html?q={M}&pn={pn}")
    except Exception as e: print("yes",pn,e); break
    n=0
    for bl in t.split('listImageGrid-module-scss-module__20EZDa__itemContent')[1:]:
        tit=re.search(r'itemTitle">(.*?)</div>',bl,re.S); 
        if not tit: continue
        nome=html.unescape(re.sub(r'<[^>]+>','',tit.group(1))).replace(' - ',' - ',1).strip()
        p1=re.search(r'itemPrice notranslate">US\$ ([\d.,]+)',bl); p2=re.search(r'itemSellPrice notranslate">US\$ ([\d.,]+)',bl)
        badge=re.search(r'textLimitedDeal[^>]*>([^<]+)<',bl)
        prev=t[:t.find(bl)][-8000:]; hrefs=re.findall(r'href="(/en/[^"]+/info\.html/pid\.\d+)"',prev)
        url="https://www.yesstyle.com"+hrefs[-1] if hrefs else None
        if (nome,url) in seen: continue
        seen.add((nome,url)); n+=1
        venda=usd(p1.group(1)) if p1 else None; cheio=usd(p2.group(1)) if p2 else venda
        vs=[x for x in (venda,cheio) if x]
        out.append({"site":"YesStyle","nome":nome,"url":url,"usd_venda":venda,"usd_cheio":max(vs) if vs else None,"selo":(badge.group(1) if badge else "")+("" if vs else "sem preço/esgotado")})
    print("yes pn",pn,n)
    if n==0: break
    time.sleep(2)
# Jolse
for pg in range(1,10):
    try: t=get(f"https://jolse.com/product/search.html?keyword={M}&page={pg}")
    except Exception as e: print("jolse",pg,e); break
    bls=t.split('<li id="anchorBoxId_')[1:]; n=0
    for bl in bls:
        href=re.search(r'<strong class="name"><a href="([^"]+)"',bl)
        nomes=[x.strip() for x in re.findall(r'<span class="" style="[^"]*font-weight:bold;">([^<]+)</span>',bl) if x.strip() and x.strip()!="Product Name"]
        precos=[usd(x) for x in re.findall(r'USD\s*([\d.,]+)',bl)]
        if not href or not nomes or not precos: continue
        n+=1; out.append({"site":"Jolse","nome":html.unescape(nomes[0]),"url":"https://jolse.com"+href.group(1),"usd_venda":min(precos),"usd_cheio":max(precos),"selo":""})
    print("jolse pg",pg,n)
    if n==0: break
    time.sleep(2)
os.makedirs("tools/precos/ext/dados",exist_ok=True)
json.dump({"marca":M,"lido_em":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),"itens":out},open(f"tools/precos/ext/dados/{M}.json","w"),ensure_ascii=False,indent=1)
print(len(out))
