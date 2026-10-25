#!/usr/bin/env python3
"""Gera bomi/base-conhecimento.json a partir de:
  - docs/ajuda/base-bot.json (Central de Ajuda, fonte dos fatos)
  - bomi/fonte/chat_a..e.py  (respostas no tom de chat para cada id)
  - bomi/fonte/chat_novos.py (intenções só do chat)
Uso: python3 bomi/fonte/gerar.py
"""
import json, re, unicodedata, pathlib, importlib.util

RAIZ = pathlib.Path(__file__).resolve().parents[2]
FONTE = RAIZ / "bomi" / "fonte"

def carregar(nome, var):
    spec = importlib.util.spec_from_file_location(nome, FONTE / f"{nome}.py")
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return getattr(m, var)

CHAT = {}
for n in "abcde":
    CHAT.update(carregar(f"chat_{n}", "C"))
NOVOS = carregar("chat_novos", "N")
BASE = json.loads((RAIZ / "docs/ajuda/base-bot.json").read_text())
if isinstance(BASE, dict):
    BASE = BASE.get("entradas") or BASE.get("itens") or next(v for v in BASE.values() if isinstance(v, list))

def sem_acento(t):
    return "".join(c for c in unicodedata.normalize("NFD", t) if unicodedata.category(c) != "Mn")

ABREV = [(r"\bvocês\b","vcs"),(r"\bvocê\b","vc"),(r"\bporque\b","pq"),(r"\bpor que\b","pq"),
         (r"\btambém\b","tb"),(r"\bo que\b","oq"),(r"\bque\b","q"),(r"\btudo\b","td"),
         (r"\bmesmo\b","msm"),(r"\bnão\b","n"),(r"\bpra\b","p"),(r"\bpara\b","pra"),
         (r"\bquando\b","qnd"),(r"\bbeleza\b","blz"),(r"\bobrigada\b","obg")]

def typo(t):
    # erro de digitação simples e determinístico: troca duas letras do meio da palavra mais longa
    ps = t.split()
    if not ps: return t
    i = max(range(len(ps)), key=lambda k: len(ps[k]))
    w = ps[i]
    if len(w) < 6: return t
    j = len(w) // 2
    ps[i] = w[:j-1] + w[j] + w[j-1] + w[j+1:]
    return " ".join(ps)

def limpa(t):
    t = t.strip().rstrip("?!. ").lower()
    return re.sub(r"\s+", " ", t)

def gatilhos(base_frases, extras, minimo=8, maximo=15):
    vistos, out = set(), []
    def add(t):
        t = t.strip()
        k = sem_acento(limpa(t))
        if t and k not in vistos and len(out) < maximo:
            vistos.add(k); out.append(t)
    for t in extras: add(t)
    for t in base_frases: add(limpa(t) + ("?" if t.strip().endswith("?") else ""))
    # variações informais
    for t in list(base_frases):
        s = sem_acento(limpa(t))
        for a, b in ABREV:
            s = re.sub(a, b, s)
        add(s)
        if len(out) >= minimo + 2: break
    for t in list(base_frases)[:3]:
        if len(out) >= minimo: break
        add(typo(sem_acento(limpa(t))))
    i = 0
    while len(out) < minimo and i < len(out):
        add(typo(out[i])); add(out[i] + " por favor"); i += 1
    return out

ESCALA_CAT = {
 "Trocas": "Reembolso, produto com defeito, avariado ou errado: transferir com número do pedido, fotos e resumo.",
 "Remessa": "Retenção na alfândega, cobrança de imposto na entrega ou dúvida sobre declaração: transferir.",
 "Pagamento": "Cobrança em duplicidade, estorno ou contestação: transferir.",
 "Rastreamento": "Rastreio parado além do prazo informado ou extravio: transferir.",
 "Frete": "Atraso além do prazo ou endereço errado após o envio: transferir.",
 "Pedidos": "Alteração, cancelamento ou problema com um pedido específico: transferir com o número do pedido.",
 "Autenticidade": "Suspeita de produto falsificado em um pedido recebido: transferir com fotos.",
 "Golpes": "Cliente que já pagou fora do site ou recebeu contato falso: transferir com print.",
 "Afiliados": "Proposta de influencer, parceria ou atacado: transferir/registrar como lead.",
 "Fale com a gente": "Se pedir pessoa: transferir.",
}
GERAL = "Cliente irritada após uma tentativa, ameaça de Procon/processo ou qualquer dúvida sem resposta na base: transferir."

def status_de(e):
    st = e.get("status", "ok")
    resp = e.get("resposta", "") + e.get("resposta_longa", "")
    if "[A DEFINIR" in resp or st not in ("ok", "publicado"):
        return "a_definir" if "[A DEFINIR" in resp or "D" in str(st) else st
    return "ok"

AJUSTE = {
 "sobre-02": (False, "Se pedirem o endereço físico da MPOEMA INC (ainda [A DEFINIR #D31]): dizer que vai confirmar com a equipe e transferir."),
}

entradas = []
faltando = []
for e in BASE:
    i = e["id"]
    if i not in CHAT:
        faltando.append(i); continue
    rc, alt, extras = CHAT[i]
    st = status_de(e)
    esc = bool(e.get("escalar_humano")) or st == "a_definir"
    q = ESCALA_CAT.get(e.get("categoria", ""), "")
    if st == "a_definir":
        q = "Regra ainda não definida pela OMG: dizer que vai confirmar com a equipe e transferir. " + q
    if i in AJUSTE:
        esc, q = AJUSTE[i]
    entradas.append({
        "id": i,
        "categoria": e.get("categoria", ""),
        "pergunta": e.get("pergunta", ""),
        "status": st,
        "escalar_humano": esc,
        "gatilhos": gatilhos([e.get("pergunta", "")] + list(e.get("variacoes", [])), extras),
        "resposta_chat": rc,
        "resposta_chat_alt": alt,
        "quando_escalar": (q + " " + GERAL).strip(),
        "notas_internas": "Fonte: Central de Ajuda (" + i + "). Fato oficial: " + e.get("resposta", ""),
        "links": e.get("links", []),
    })

for (i, cat, perg, gat, rc, alt, esc, quando, notas) in NOVOS:
    entradas.append({
        "id": i, "categoria": cat, "pergunta": perg, "status": "ok",
        "escalar_humano": esc,
        "gatilhos": gatilhos([re.sub(r"\s*\(.*?\)|^[^:]*:\s*", "", perg)], gat),
        "resposta_chat": rc, "resposta_chat_alt": alt,
        "quando_escalar": ((quando + " ") if quando else "") + GERAL,
        "notas_internas": ("Intenção só do chat. " + notas).strip(),
        "links": [],
    })

if faltando:
    raise SystemExit("Sem resposta de chat para: " + ", ".join(faltando))

ids = [x["id"] for x in entradas]
assert len(ids) == len(set(ids)), "ids repetidos"
saida = {
    "versao": "1.0",
    "gerado_por": "bomi/fonte/gerar.py",
    "assistente": "Bomi (봄이), assistente virtual da OMG",
    "total": len(entradas),
    "entradas": entradas,
}
(RAIZ / "bomi" / "base-conhecimento.json").write_text(json.dumps(saida, ensure_ascii=False, indent=1) + "\n")
print("entradas:", len(entradas), "| da Central:", len(BASE), "| novas:", len(NOVOS))
