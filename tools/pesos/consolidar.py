"""Junta as fontes de peso do lote 1 em tools/pesos/pesos_final.csv.

Ordem de prioridade: site oficial da marca → loja de varejo (Soko Glam/Ohlolly, confiança ≥ 0,8) →
estimativa pelo tamanho (ml/g) e tipo de produto → sem peso.
A coluna `fonte` diz de onde veio; o peso real (pesado na embalagem) substitui tudo quando existir.
"""
import csv, json, re, statistics
from collections import defaultdict
from pathlib import Path
A = Path(__file__).resolve().parent
RAIZ = A.parents[1]
E = json.loads((A / "entrada.json").read_text())
P = json.loads((A / "pesos.json").read_text())
F = {f["handle"]: f for f in json.loads((RAIZ / "bomi/fichas-produtos.json").read_text())}

def ml(t):
    m = re.match(r"([\d.]+)", t or "")
    return float(m.group(1)) if m else None

# fator peso/tamanho por tipo, aprendido dos produtos com peso oficial e tamanho
fat = defaultdict(list)
for e in E:
    s = ml(e["tamanho"])
    if e["peso_oficial_g"] and s and 5 <= s <= 1000:
        fat[F.get(e["handle"], {}).get("tipo", "")].append(e["peso_oficial_g"] / s)
geral = statistics.median([x for v in fat.values() for x in v])
FAT = {k: statistics.median(v) for k, v in fat.items() if len(v) >= 8}

linhas = []
for e in E:
    h, s = e["handle"], ml(e["tamanho"])
    tipo = F.get(h, {}).get("tipo", "")
    var = [a for a in P.get(h, []) if "kollab" not in a["loja"] and a["confianca"] >= 0.8]
    if e["peso_oficial_g"]:
        peso, fonte = e["peso_oficial_g"], "site oficial da marca"
    elif var:
        peso, fonte = var[0]["peso_g"], "varejo (" + var[0]["loja"] + ")"
    elif s and 5 <= s <= 1000:
        peso, fonte = round(s * FAT.get(tipo, geral)), "estimado pelo tamanho"
    else:
        peso, fonte = "", "sem peso"
    linhas.append({"handle": h, "marca": e["marca"], "produto": e["nome"], "tipo": tipo, "tamanho": e["tamanho"], "peso_g": peso, "fonte": fonte})

with open(A / "pesos_final.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(linhas[0])); w.writeheader(); w.writerows(linhas)
from collections import Counter
print(Counter(l["fonte"].split(" (")[0] for l in linhas), "fator geral g/ml:", round(geral, 2))
