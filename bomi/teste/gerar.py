"""Gera bomi/teste/bomi-teste.html: página de teste da Bomi (artifact com o capability `sample`).

Junta num único HTML:
- o prompt de sistema (bomi/system-prompt.md);
- a base de conhecimento (bomi/base-conhecimento.json), versão enxuta para a busca;
- os 40 cenários de teste (bomi/testes/conversas.md);
- as fichas de produto do lote 1 (bomi/fichas-produtos.json);
- pedidos fictícios para testar a consulta de pedido.

Uso: python3 bomi/teste/gerar.py
"""
import glob
import json
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
AQUI = Path(__file__).resolve().parent

# 1. Prompt de sistema: o texto depois da primeira linha '---'
sp = (RAIZ / "bomi/system-prompt.md").read_text()
prompt = sp.split("\n---\n", 1)[1].strip()

# 2. Base enxuta
base = json.loads((RAIZ / "bomi/base-conhecimento.json").read_text())["entradas"]
base_min = [
    {
        "id": e["id"],
        "categoria": e.get("categoria", ""),
        "pergunta": e.get("pergunta", ""),
        "status": e.get("status", "ok"),
        "escalar_humano": e.get("escalar_humano", False),
        "gatilhos": e.get("gatilhos", []),
        "resposta_chat": e.get("resposta_chat", ""),
        "resposta_chat_alt": e.get("resposta_chat_alt", ""),
        "quando_escalar": e.get("quando_escalar", ""),
        "notas_internas": e.get("notas_internas", ""),
        "links": e.get("links", []),
    }
    for e in base
]

# 3. Cenários
t = (RAIZ / "bomi/testes/conversas.md").read_text()
cenarios = []
for s in re.split(r"^### ", t, flags=re.M)[1:]:
    linhas = s.strip().splitlines()
    titulo = linhas[0].strip()
    falas, esperado = [], []
    for ln in linhas[1:]:
        ln = ln.strip()
        if not ln.startswith("- "):
            continue
        ln = ln[2:]
        if ln.startswith("C:"):
            falas.append(ln[2:].strip())
        else:
            esperado.append(ln.replace("**", ""))
    if falas:
        cenarios.append({"titulo": titulo, "falas": falas, "esperado": esperado})

# 4. Fichas de produto do lote 1 (gere antes com bomi/teste/fichas.py)
produtos = json.loads((RAIZ / "bomi/fichas-produtos.json").read_text())

dados = {
    "prompt": prompt,
    "base": base_min,
    "cenarios": cenarios,
    "fichas": produtos,
}

modelo = (AQUI / "modelo.html").read_text()
js = json.dumps(dados, ensure_ascii=False).replace("</", "<\\/")
html = modelo.replace("/*__DADOS__*/null", js)
(AQUI / "bomi-teste.html").write_text(html)
print(f"ok: {len(base_min)} entradas, {len(cenarios)} cenários, {len(produtos)} produtos, {len(html)//1024} KB")
