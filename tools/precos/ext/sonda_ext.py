# Sonda: o que dá para ler de YesStyle, Olive Young Global, Jolse e Sephora US para uma marca.
import urllib.request, json, os, re, gzip, time
UA={"user-agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129 Safari/537.36","accept-language":"en-US,en;q=0.9","accept":"text/html,application/json;q=0.9,*/*;q=0.8"}
M="numbuzin"
URLS={
 "jolse_1":f"https://jolse.com/product/search.html?keyword={M}&page=1",
 "jolse_cat":"https://jolse.com/category/numbuzin/2015/",
 "yes_list":f"https://www.yesstyle.com/en/list.html?q={M}",
 "yes_api":f"https://www.yesstyle.com/rest/products/v1/search?q={M}&pageSize=60",
 "yes_brand":"https://www.yesstyle.com/en/numbuzin/list.html/bpt.299_bid.330908",
 "oy_search":f"https://global.oliveyoung.com/display/search?query={M}",
 "oy_api":f"https://global.oliveyoung.com/display/search/api/v1/products?query={M}&page=1&size=60",
 "sep_api":f"https://www.sephora.com/api/v2/catalog/search/?type=keyword&q={M}&pageSize=60&currentPage=1",
 "sep_brand":"https://www.sephora.com/brand/numbuzin",
}
os.makedirs("tools/precos/ext/sonda",exist_ok=True)
res={}
for k,u in URLS.items():
    try:
        r=urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=40); b=r.read()
        if r.headers.get("content-encoding")=="gzip": b=gzip.decompress(b)
        t=b.decode("utf-8","replace"); open(f"tools/precos/ext/sonda/{k}.txt","w").write(t[:400000])
        res[k]={"ok":True,"status":r.status,"len":len(t),"final":r.geturl(),"usd":len(re.findall(r"(?:US\$|USD|\$)\s?\d+\.\d\d",t)),"numbuzin":t.lower().count("numbuzin")}
    except Exception as e: res[k]={"ok":False,"erro":str(e)[:200]}
    time.sleep(1)
json.dump(res,open("tools/precos/ext/sonda/resumo.json","w"),indent=1); print(json.dumps(res,indent=1))
