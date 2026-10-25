"""Busca peso de envio dos produtos do lote 1 em lojas de K-beauty que usam Shopify (roda no GitHub Actions).

Entrada: tools/pesos/entrada.json (handle, marca, titulo_en, tamanho, peso_oficial_g).
Saída:   tools/pesos/pesos.json — por handle: lista de achados {loja, titulo, peso_g, confianca}.

Busca todos os produtos (inclusive os que já têm peso oficial, para comparar).
Confiança: proporção de palavras do título oficial encontradas no título da loja,
com bônus quando o tamanho (ml/g) bate e penalidade quando não bate.
"""
import json
import re
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

AQUI = Path(__file__).resolve().parent
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
LOJAS = ["sokoglam.com", "ohlolly.com", "www.kollab.com.br"]
PARE = set("the and for with of a to in de da do com para e o".split())


def norm(s):
    s = unicodedata.normalize("NFD", s.lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def toks(s):
    return [w for w in re.findall(r"[a-z0-9]+", norm(s)) if w not in PARE and len(w) > 1]


def tam(s):
    m = re.search(r"(\d+(?:[.,]\d+)?)\s?(ml|g)\b", norm(s))
    return (m.group(1).replace(",", "."), m.group(2)) if m else None


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    for i in range(3):
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read().decode("utf-8", "replace"))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(5 * (i + 1))
                continue
            return None
        except Exception:  # noqa: BLE001
            time.sleep(1)
    return None


def buscar(loja, item):
    q = f"{item['marca']} {item['titulo_en']}"[:120]
    d = get(f"https://{loja}/search/suggest.json?q={urllib.parse.quote(q)}&resources[type]=product&resources[limit]=5")
    try:
        prods = d["resources"]["results"]["products"]
    except Exception:  # noqa: BLE001
        return []
    alvo = set(toks(item["titulo_en"]))
    marca = set(toks(item["marca"]))
    t_alvo = tam(item["titulo_en"]) or tam(item.get("tamanho", ""))
    melhores = []
    for p in prods:
        tit = p.get("title", "")
        tt = set(toks(tit))
        if marca and not (marca & tt) and norm(item["marca"]) not in norm(p.get("vendor", "") + " " + tit):
            continue
        if not alvo:
            continue
        conf = len(alvo & tt) / len(alvo)
        tp = tam(tit)
        if t_alvo and tp:
            conf += 0.15 if tp == t_alvo else -0.3
        if conf < 0.6:
            continue
        pj = get(f"https://{loja}/products/{p['handle']}.js")
        if not pj:
            continue
        variantes = [(v.get("title", ""), v.get("weight")) for v in pj.get("variants", [])]
        pesos = [w for _, w in variantes if w]
        if not pesos:
            continue
        # se houver variante com o tamanho certo, usa ela
        peso = pesos[0]
        if t_alvo:
            for vt, w in variantes:
                if w and tam(vt) == t_alvo:
                    peso = w
        melhores.append({"loja": loja, "titulo": tit, "peso_g": peso, "confianca": round(min(conf, 1.0), 2)})
        time.sleep(0.2)
    return sorted(melhores, key=lambda x: -x["confianca"])[:2]


entrada = json.loads((AQUI / "entrada.json").read_text())
saida_p = AQUI / "pesos.json"
res = json.loads(saida_p.read_text()) if saida_p.exists() else {}
inicio = time.time()
for i, item in enumerate(entrada):
    if item["handle"] in res:
        continue
    if time.time() - inicio > 45 * 60:
        print("tempo esgotado; continua na próxima rodada")
        break
    achados = []
    for loja in LOJAS:
        achados += buscar(loja, item)
        time.sleep(0.3)
    res[item["handle"]] = achados
    if i % 50 == 0:
        saida_p.write_text(json.dumps(res, ensure_ascii=False))
        print(i, "de", len(entrada), "· com peso:", sum(1 for v in res.values() if v))
saida_p.write_text(json.dumps(res, ensure_ascii=False))
print("fim:", len(res), "processados ·", sum(1 for v in res.values() if v), "com peso")
