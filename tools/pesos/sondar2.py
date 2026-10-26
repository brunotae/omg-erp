"""Sonda 2: lojas de K-beauty e serviços que podem ter peso/dimensões (roda no GitHub Actions).

Para cada site: busca "medicube zero pore pad", acha o 1º link de produto, abre a página do produto
e procura trechos com peso/dimensões. Grava tools/pesos/sondagem2.json.
"""
import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
Q = "medicube zero pore pad"
q = urllib.parse.quote(Q)
PAD = r"(weight|dimension|size\s*\(|무게|중량|크기|\b\d+(?:\.\d+)?\s?(?:kg|g|lbs?|oz|cm|mm|inch(?:es)?|in)\b\s*(?:x|×)?)"


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,application/json;q=0.9,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.9,ko;q=0.8"})
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            return r.status, r.geturl(), r.read(1_500_000).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, url, ""
    except Exception as e:  # noqa: BLE001
        return 0, url, str(e)[:200]


def trechos(html):
    t = re.sub(r"<script.*?</script>|<style.*?</style>", " ", html, flags=re.S | re.I)
    t = re.sub(r"<[^>]+>", " ", t)
    t = re.sub(r"\s+", " ", t)
    out = []
    for m in re.finditer(r"(weight|dimension|무게|중량|크기|package size|item size)", t, re.I):
        out.append(t[max(0, m.start() - 60): m.end() + 120])
        if len(out) >= 6:
            break
    return out


SITES = {
    "jolse": (f"https://jolse.com/product/search.html?keyword={q}", r'href="(/product/[^"]+?/\d+/[^"]*)"', "https://jolse.com"),
    "yesstyle": (f"https://www.yesstyle.com/en/list.html?q={q}", r'href="(/en/[^"]+?/info\.html/pid\.\d+)"', "https://www.yesstyle.com"),
    "stylekorean": (f"https://www.stylekorean.com/shop/search_result.php?search_str={q}", r'href="([^"]*?/shop/[^"]*?(?:it_id|item)[^"]*)"', "https://www.stylekorean.com"),
    "holastylekorean": (f"https://www.holastylekorean.com/search?q={q}", r'href="(/products/[^"?]+)"', "https://www.holastylekorean.com"),
    "siliconetwo": (f"https://www.siliconetwo.com/shop/search_result.php?search_str={q}", r'href="([^"]*?(?:it_id=|/item/|/product/)[^"]*)"', "https://www.siliconetwo.com"),
    "sephora": (f"https://www.sephora.com/search?keyword={q}", r'href="(/product/[^"?]+)"', "https://www.sephora.com"),
    "oliveyoung_global": (f"https://global.oliveyoung.com/display/search?query={q}", r'href="([^"]*product/detail[^"]*)"', "https://global.oliveyoung.com"),
    "stylevana": (f"https://www.stylevana.com/en_US/catalogsearch/result/?q={q}", r'href="(https://www\.stylevana\.com/en_US/[^"]+\.html)"', ""),
}

res = {}
for nome, (busca, padrao, base) in SITES.items():
    st, final, html = get(busca)
    r = {"busca_status": st, "busca_tam": len(html)}
    links = re.findall(padrao, html)
    r["links"] = links[:3]
    if links:
        url = links[0] if links[0].startswith("http") else base + links[0]
        st2, _, ph = get(url)
        r.update({"produto": url, "produto_status": st2, "produto_tam": len(ph), "trechos": trechos(ph)})
    else:
        r["trechos_busca"] = trechos(html)[:3]
    res[nome] = r

# Banco de códigos de barra (UPCitemdb, plano gratuito de teste: 100 consultas/dia) — traz dimensões e peso quando a loja informou
st, _, body = get(f"https://api.upcitemdb.com/prod/trial/search?s={q}&match_mode=0&type=product")
try:
    items = json.loads(body).get("items", [])
    res["upcitemdb"] = {"status": st, "itens": [{k: it.get(k) for k in ("title", "brand", "ean", "dimension", "weight", "size")} for it in items[:5]]}
except Exception:  # noqa: BLE001
    res["upcitemdb"] = {"status": st, "corpo": body[:200]}

Path(__file__).with_name("sondagem2.json").write_text(json.dumps(res, ensure_ascii=False, indent=1))
print(json.dumps(res, ensure_ascii=False, indent=1)[:6000])
