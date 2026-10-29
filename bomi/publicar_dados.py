"""Copia o conteúdo da Bomi para dentro da função do Supabase (supabase/functions/bomi/dados/).

Rode depois de mudar system-prompt.md, base-conhecimento.json ou fichas-produtos.json:
    python3 bomi/publicar_dados.py
O robô "Publicar funções" sobe a função nova sozinho quando isso for para o GitHub.
"""
import json
from pathlib import Path

R = Path(__file__).resolve().parent
D = R.parent / "supabase/functions/bomi/dados"
D.mkdir(parents=True, exist_ok=True)

prompt = (R / "system-prompt.md").read_text().split("\n---\n", 1)[1].strip()
(D / "prompt.json").write_text(json.dumps({"texto": prompt}, ensure_ascii=False))

CAMPOS = ["id", "categoria", "pergunta", "status", "escalar_humano", "gatilhos", "resposta_chat", "resposta_chat_alt", "quando_escalar", "notas_internas", "links"]
base = json.loads((R / "base-conhecimento.json").read_text())["entradas"]
(D / "base.json").write_text(json.dumps([{k: e.get(k) for k in CAMPOS if e.get(k) is not None} for e in base], ensure_ascii=False))

fichas = json.loads((R / "fichas-produtos.json").read_text())
# Só produtos à venda no site: lote 1 menos os duplicados tirados do ar.
_raiz = R.parent if (R.parent / "site").exists() else R.parent.parent
_lote = set(json.loads((_raiz / "site" / "lote1.json").read_text()))
for _f in sorted((_raiz / "site").glob("duplicados_rascunho_*.json")):
    _lote -= {x["handle"] for x in json.loads(_f.read_text())["rascunho"]}
fichas = [f for f in fichas if f.get("handle") in _lote]
(D / "fichas.json").write_text(json.dumps(fichas, ensure_ascii=False))
print("prompt:", len(prompt), "caracteres · base:", len(base), "entradas · fichas:", len(fichas), "produtos")
