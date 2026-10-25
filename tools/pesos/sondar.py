"""Sonda quais lojas de K-beauty deixam ler peso/medidas dos produtos (roda no GitHub Actions).

Testa uma busca por produto conhecido em cada loja e grava tools/pesos/sondagem.json com:
status HTTP, se achou produto, e se a página traz peso/dimensões.
"""
import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
Q = "anua heartleaf 77 soothing toner"


def get(url, accept="text/html,application/json"):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept, "Accept-Language": "en-US,en;q=0.9"})
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            return r.status, r.read(400_000).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception as e:  # noqa: BLE001
        return 0, str(e)[:200]


def shopify(dom):
    st, body = get(f"https://{dom}/search/suggest.json?q={urllib.parse.quote(Q)}&resources[type]=product&resources[limit]=3")
    out = {"busca_status": st}
    try:
        prods = json.loads(body)["resources"]["results"]["products"]
    except Exception:  # noqa: BLE001
        out["erro"] = body[:120]
        return out
    out["achados"] = [p.get("title") for p in prods]
    if prods:
        h = prods[0]["handle"]
        st2, b2 = get(f"https://{dom}/products/{h}.js")
        out["produto_status"] = st2
        try:
            v = json.loads(b2)["variants"]
            out["pesos_g"] = [x.get("weight") for x in v]
        except Exception:  # noqa: BLE001
            out["erro_produto"] = b2[:120]
    return out


def pagina(nome, url, padroes):
    st, body = get(url)
    achou = {p: bool(re.search(p, body, re.I)) for p in padroes}
    trechos = []
    for p in padroes:
        m = re.search(r".{0,80}" + p + r".{0,120}", body, re.I | re.S)
        if m:
            trechos.append(re.sub(r"\s+", " ", m.group(0))[:220])
    return {"status": st, "tamanho": len(body), "achou": achou, "trechos": trechos[:4]}


res = {}
for dom in ["sokoglam.com", "ohlolly.com", "wishtrend.com", "www.beautyofjoseon.com", "kbeautyaddiction.com", "seoulplus.com"]:
    res[dom] = shopify(dom)

PAD = [r"weight", r"dimension", r"\b\d+(\.\d+)?\s?(kg|lb|oz)\b", r"중량", r"용량"]
qs = urllib.parse.quote(Q)
res["yesstyle"] = pagina("yesstyle", f"https://www.yesstyle.com/en/list.html?q={qs}", PAD)
res["stylevana"] = pagina("stylevana", f"https://www.stylevana.com/en_US/catalogsearch/result/?q={qs}", PAD)
res["oliveyoung_global"] = pagina("oy", f"https://global.oliveyoung.com/display/search?query={qs}", PAD)
res["oliveyoung_kr"] = pagina("oykr", "https://www.oliveyoung.co.kr/store/search/getSearchMain.do?query=" + urllib.parse.quote("아누아 어성초 77 토너"), PAD)
res["iherb"] = pagina("iherb", f"https://www.iherb.com/search?kw={qs}", PAD)
res["jolse"] = pagina("jolse", f"https://jolse.com/product/search.html?keyword={qs}", PAD)
res["amazon"] = pagina("amazon", f"https://www.amazon.com/s?k={qs}", PAD)

Path(__file__).with_name("sondagem.json").write_text(json.dumps(res, ensure_ascii=False, indent=1))
print(json.dumps(res, ensure_ascii=False, indent=1)[:4000])
