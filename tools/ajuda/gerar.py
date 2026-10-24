# Gera a Central de Ajuda a partir de tools/ajuda/conteudo.py
import json, re, sys, os, html, unicodedata
sys.path.insert(0, os.path.dirname(__file__))
import conteudo as C

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PEND = re.compile(r"\[A (DEFINIR|VERIFICAR) #([DV]\d+): ([^\]]+)\]")

def texto(q):
    return q["l"] or q["r"]

def status(q):
    t = q["r"] + " " + (q["l"] or "")
    if "[A DEFINIR" in t: return "a_definir"
    if "[A VERIFICAR" in t: return "a_verificar"
    return "ok"

def slugify(s):
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:60]

# ---------- markdown por categoria
os.makedirs(f"{RAIZ}/docs/ajuda", exist_ok=True)
for f in os.listdir(f"{RAIZ}/docs/ajuda"):
    if re.match(r"^\d\d-.*\.md$", f): os.remove(f"{RAIZ}/docs/ajuda/{f}")
indice = ["# Central de Ajuda OMG\n", "Fonte: `tools/ajuda/conteudo.py` (edite lá e rode `python3 tools/ajuda/gerar.py`).\n",
          "Pendências estão marcadas como **[A DEFINIR #Dn]** e **[A VERIFICAR #Vn]** — ver [DECISOES.md](DECISOES.md).\n"]
for i, (slug, titulo, desc, qs) in enumerate(C.CATS, 1):
    fn = f"{i:02d}-{slug}.md"
    linhas = [f"# {titulo}\n", f"_{desc}_\n"]
    for q in qs:
        linhas.append(f"### {q['p']}\n")
        linhas.append(texto(q).strip() + "\n")
    open(f"{RAIZ}/docs/ajuda/{fn}", "w", encoding="utf-8").write("\n".join(linhas))
    indice.append(f"{i}. [{titulo}]({fn}) — {len(qs)} perguntas")
open(f"{RAIZ}/docs/ajuda/README.md", "w", encoding="utf-8").write("\n".join(indice) + "\n")

# ---------- base do bot
base = []
for slug, titulo, desc, qs in C.CATS:
    for j, q in enumerate(qs, 1):
        e = dict(id=f"{slug}-{j:02d}", categoria=titulo, pergunta=q["p"], variacoes=q["v"],
                 resposta=q["r"], links=q["links"], status=status(q), escalar_humano=bool(q["h"]))
        if q["l"]: e["resposta_longa"] = q["l"]
        base.append(e)
json.dump(base, open(f"{RAIZ}/docs/ajuda/base-bot.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)

# ---------- decisões
uso = {}
for slug, titulo, desc, qs in C.CATS:
    for j, q in enumerate(qs, 1):
        for m in PEND.finditer(q["r"] + " " + (q["l"] or "")):
            uso.setdefault(m.group(2), set()).add(f"{titulo} › {q['p']}")
dec = ["# Decisões pendentes da Central de Ajuda\n",
       "Cada item aparece no texto como [A DEFINIR #Dn] ou [A VERIFICAR #Vn]. Decida, edite `tools/ajuda/conteudo.py` e rode `python3 tools/ajuda/gerar.py`.\n",
       "## A DEFINIR (decisões de negócio)\n"]
for k, (o_que, sug) in C.DECISOES.items():
    onde = sorted(uso.get(k, []))
    dec.append(f"**{k}. {o_que}**  \nSugestão: {sug}  \nAparece em ({len(onde)}): " + ("; ".join(onde) if onde else "—") + "\n")
dec.append("## A VERIFICAR (fatos a confirmar)\n")
for k, (o_que, sug) in C.VERIFICAR.items():
    onde = sorted(uso.get(k, []))
    dec.append(f"**{k}. {o_que}**  \nComo: {sug}  \nAparece em ({len(onde)}): " + ("; ".join(onde) if onde else "—") + "\n")
open(f"{RAIZ}/docs/ajuda/DECISOES.md", "w", encoding="utf-8").write("\n".join(dec))
faltando = set(uso) - set(C.DECISOES) - set(C.VERIFICAR)
assert not faltando, f"pendências sem descrição: {faltando}"

# ---------- HTML para página do Shopify
def inline(s):
    s = html.escape(s, quote=False)
    s = PEND.sub(lambda m: f'<mark class="pend" title="Pendente {m.group(2)}">⚠ {m.group(1).title()} {m.group(2)}: {m.group(3)}</mark>', s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<![\w*])\*(?!\s)(.+?)\*(?!\w)", r"<em>\1</em>", s)
    s = re.sub(r"(https?://[^\s<]+)", r'<a href="\1">\1</a>', s)
    return s

def md2html(t):
    out, lista = [], None
    for linha in t.strip().split("\n"):
        l = linha.rstrip()
        m_ul, m_ol = re.match(r"^- (.*)", l), re.match(r"^\d+\. (.*)", l)
        tipo = "ul" if m_ul else "ol" if m_ol else None
        if lista and tipo != lista:
            out.append(f"</{lista}>"); lista = None
        if tipo:
            if not lista: out.append(f"<{tipo}>"); lista = tipo
            out.append(f"<li>{inline((m_ul or m_ol).group(1))}</li>")
        elif l.startswith("> "):
            out.append(f'<p class="aviso">{inline(l[2:])}</p>')
        elif l:
            out.append(f"<p>{inline(l)}</p>")
    if lista: out.append(f"</{lista}>")
    return "\n".join(out)

cats_html, chips = [], []
for slug, titulo, desc, qs in C.CATS:
    chips.append(f'<button type="button" class="chip" data-cat="{slug}">{html.escape(titulo)}</button>')
    itens = "\n".join(
        f'<details class="q" id="{slugify(q["p"])}" data-busca="{html.escape((q["p"]+" "+" ".join(q["v"])).lower())}">'
        f'<summary>{html.escape(q["p"])}</summary><div class="r">{md2html(texto(q))}</div></details>' for q in qs)
    cats_html.append(f'<section class="cat" id="cat-{slug}" data-cat="{slug}"><h2>{html.escape(titulo)}</h2>'
                     f'<p class="desc">{html.escape(desc)}</p>\n{itens}\n</section>')

CSS = """
.omg-ajuda{--chiclete:#F48FB1;--framboesa:#D9577F;--pri:#B83D66;--bebe:#FDE4EC;--creme:#FFF9F6;--ameixa:#4A2638;--menta:#9EDFC4;
 font-family:Poppins,"Helvetica Neue",Arial,sans-serif;color:var(--ameixa);background:var(--creme);max-width:980px;margin:0 auto;padding:24px 16px 48px;line-height:1.55;font-size:15px}
.omg-ajuda *{box-sizing:border-box}
.omg-ajuda .topo{text-align:center;padding:8px 0 18px}
.omg-ajuda .topo h1{font-size:clamp(24px,4vw,34px);margin:0 0 6px;color:var(--ameixa);font-weight:800}
.omg-ajuda .topo p{margin:0;color:#7A5566}
.omg-ajuda .busca{display:flex;gap:8px;align-items:center;background:#fff;border:2px solid var(--bebe);border-radius:999px;padding:10px 16px;margin:16px auto 14px;max-width:620px}
.omg-ajuda .busca input{flex:1;border:0;outline:0;font:inherit;color:inherit;background:transparent;min-width:0}
.omg-ajuda .chips{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:22px}
.omg-ajuda .chip{border:1px solid var(--bebe);background:#fff;color:var(--pri);border-radius:999px;padding:6px 14px;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.omg-ajuda .chip.on,.omg-ajuda .chip:hover{background:var(--pri);color:#fff;border-color:var(--pri)}
.omg-ajuda .destaques{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:26px}
.omg-ajuda .destaques div{background:#fff;border:1px solid var(--bebe);border-radius:16px;padding:14px}
.omg-ajuda .destaques b{display:block;color:var(--pri);margin-bottom:4px}
.omg-ajuda .cat{margin:0 0 26px}
.omg-ajuda .cat h2{font-size:20px;margin:0 0 2px;color:var(--ameixa)}
.omg-ajuda .cat .desc{margin:0 0 10px;color:#7A5566;font-size:13.5px}
.omg-ajuda details.q{background:#fff;border:1px solid var(--bebe);border-radius:14px;margin:8px 0;overflow:hidden}
.omg-ajuda details.q summary{cursor:pointer;padding:13px 44px 13px 16px;font-weight:600;list-style:none;position:relative}
.omg-ajuda details.q summary::-webkit-details-marker{display:none}
.omg-ajuda details.q summary::after{content:"+";position:absolute;right:16px;top:10px;font-size:22px;color:var(--framboesa)}
.omg-ajuda details.q[open] summary::after{content:"–"}
.omg-ajuda details.q[open] summary{background:var(--bebe)}
.omg-ajuda .r{padding:4px 16px 14px}
.omg-ajuda .r p{margin:10px 0}
.omg-ajuda .r ul,.omg-ajuda .r ol{margin:8px 0;padding-left:22px}
.omg-ajuda .r li{margin:4px 0}
.omg-ajuda .r a{color:var(--pri)}
.omg-ajuda .aviso{background:var(--creme);border-left:4px solid var(--menta);padding:8px 12px;border-radius:8px;font-size:13.5px}
.omg-ajuda mark.pend{background:#FFE08A;color:#5a3b00;border:1px dashed #C78A00;border-radius:6px;padding:0 4px;font-weight:600}
.omg-ajuda .vazio{display:none;text-align:center;color:#7A5566;padding:20px}
.omg-ajuda .contato{background:var(--pri);color:#fff;border-radius:20px;padding:20px;text-align:center;margin-top:30px}
.omg-ajuda .contato a{color:#fff;font-weight:700}
@media (max-width:640px){.omg-ajuda{font-size:14px;padding:16px 12px 40px}.omg-ajuda .destaques{grid-template-columns:1fr}.omg-ajuda .chips{justify-content:flex-start;flex-wrap:nowrap;overflow-x:auto;padding-bottom:6px}.omg-ajuda .chip{flex:none}}
"""
JS = """
(function(){var R=document.querySelector('.omg-ajuda');if(!R)return;
var inp=R.querySelector('#omg-busca'),qs=[].slice.call(R.querySelectorAll('details.q')),cats=[].slice.call(R.querySelectorAll('section.cat')),chips=[].slice.call(R.querySelectorAll('.chip')),vz=R.querySelector('.vazio');
function norm(s){return (s||'').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'')}
var cat='';
function filtra(){var t=norm(inp.value).trim(),n=0;
 qs.forEach(function(d){var ok=(!t||norm(d.dataset.busca+' '+d.textContent).indexOf(t)>=0)&&(!cat||d.closest('section').dataset.cat===cat);d.style.display=ok?'':'none';if(ok)n++;if(t&&ok&&t.length>3)d.open=false});
 cats.forEach(function(s){s.style.display=[].some.call(s.querySelectorAll('details.q'),function(d){return d.style.display!=='none'})?'':'none'});
 vz.style.display=n?'none':'block';var ds=R.querySelector('.destaques');if(ds)ds.style.display=(t||cat)?'none':''}
inp.addEventListener('input',filtra);
chips.forEach(function(c){c.addEventListener('click',function(){cat=cat===c.dataset.cat?'':c.dataset.cat;chips.forEach(function(x){x.classList.toggle('on',x.dataset.cat===cat)});filtra()})});
if(location.hash){var d=R.querySelector(location.hash);if(d&&d.tagName==='DETAILS')d.open=true}
})();
"""
corpo = f"""<div class="omg-ajuda">
<style>{CSS}</style>
<div class="topo"><h1>Central de Ajuda</h1><p>Oi! Aqui você encontra tudo sobre pedidos, impostos, entrega e skincare. Não achou? Fale com a gente. 💗</p></div>
<label class="busca"><span aria-hidden="true">🔍</span><input id="omg-busca" type="search" placeholder="Busque: prazo, imposto, CPF, devolução…" aria-label="Buscar na Central de Ajuda"></label>
<div class="chips">{''.join(chips)}</div>
<div class="destaques">
<div><b>Imposto já incluso</b>O total do checkout já tem Imposto de Importação e ICMS. Sem taxa surpresa na entrega.</div>
<div><b>Direto da Coreia</b>Produtos originais, comprados de marcas e distribuidores e enviados de Seul para você.</div>
<div><b>Até 15 dias úteis</b>Prazo oficial para capitais, com rastreio desde a Coreia.</div>
</div>
{chr(10).join(cats_html)}
<p class="vazio">Não encontramos nada com essa busca. Tente outra palavra ou fale com a gente.</p>
<div class="contato"><b>Ainda com dúvida?</b><br>WhatsApp: {inline('[A DEFINIR #D1: número do WhatsApp]')} · E-mail: <a href="mailto:{C.EMAIL}">{C.EMAIL}</a></div>
<p class="aviso" style="margin-top:18px">{html.escape(C.AVISO)}</p>
<script>{JS}</script>
</div>
"""
os.makedirs(f"{RAIZ}/site/paginas", exist_ok=True)
open(f"{RAIZ}/site/paginas/central-de-ajuda.html", "w", encoding="utf-8").write(corpo)

n_def = len([k for k in C.DECISOES if k in uso]); n_ver = len([k for k in C.VERIFICAR if k in uso])
print(f"categorias={len(C.CATS)} perguntas={len(base)} bot={len(base)} decisoes={n_def} verificar={n_ver}")
print("status:", {s: sum(1 for b in base if b['status'] == s) for s in ('ok', 'a_definir', 'a_verificar')},
      "escalar:", sum(b['escalar_humano'] for b in base))
print("sem uso:", [k for k in list(C.DECISOES) + list(C.VERIFICAR) if k not in uso])
