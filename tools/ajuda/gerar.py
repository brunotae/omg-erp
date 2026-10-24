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

cats_html, menu, populares = [], [], []
for slug, titulo, desc, qs in C.CATS:
    menu.append(f'<button type="button" class="mi" data-cat="{slug}"><span>{html.escape(titulo)}</span><small>{len(qs)}</small></button>')
    itens = "\n".join(
        f'<details class="q" id="{slugify(q["p"])}" data-busca="{html.escape((q["p"]+" "+" ".join(q["v"])).lower())}">'
        f'<summary>{html.escape(q["p"])}</summary><div class="r">{md2html(texto(q))}</div></details>' for q in qs)
    cats_html.append(f'<section class="cat" id="cat-{slug}" data-cat="{slug}"><h2>{html.escape(titulo)}</h2>'
                     f'<p class="desc">{html.escape(desc)}</p>\n{itens}\n</section>')
    pops = "".join(f'<li><a href="#{slugify(q["p"])}" data-ir="{slugify(q["p"])}" data-c="{slug}">{html.escape(q["p"])}</a></li>' for q in qs[:3])
    populares.append(f'<div class="pop"><button type="button" class="pt" data-cat="{slug}">{html.escape(titulo)} ›</button><ul>{pops}</ul></div>')

CSS = """
.omg-ajuda{--chiclete:#F48FB1;--framboesa:#D9577F;--pri:#B83D66;--bebe:#FDE4EC;--creme:#FFF9F6;--ameixa:#4A2638;--menta:#9EDFC4;--linha:#F6E2E9;--muted:#7A5566;
 font-family:Poppins,"Helvetica Neue",Arial,sans-serif;color:var(--ameixa);background:var(--creme);max-width:1180px;margin:0 auto;padding:20px 16px 48px;line-height:1.55;font-size:14px}
.omg-ajuda *{box-sizing:border-box}
.omg-ajuda .topo{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:6px 0 16px;border-bottom:1px solid var(--linha);margin-bottom:18px}
.omg-ajuda .topo h1{font-size:clamp(22px,3vw,28px);margin:0 0 4px;font-weight:800}
.omg-ajuda .topo p{margin:0;color:var(--muted);font-size:13px}
.omg-ajuda .busca{display:flex;gap:8px;align-items:center;background:#fff;border:1px solid var(--bebe);border-radius:999px;padding:8px 14px;flex:0 1 380px}
.omg-ajuda .busca input{flex:1;border:0;outline:0;font:inherit;color:inherit;background:transparent;min-width:0}
.omg-ajuda .grade{display:grid;grid-template-columns:240px minmax(0,1fr);gap:28px;align-items:start}
.omg-ajuda .lado{position:sticky;top:16px;background:#fff;border:1px solid var(--linha);border-radius:14px;padding:8px}
.omg-ajuda .lado .tit{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);padding:8px 10px 6px}
.omg-ajuda .mi{display:flex;width:100%;justify-content:space-between;align-items:center;gap:8px;text-align:left;border:0;background:none;font:inherit;font-size:13.5px;color:var(--ameixa);padding:8px 10px;border-radius:9px;cursor:pointer}
.omg-ajuda .mi small{color:var(--muted);font-size:11px}
.omg-ajuda .mi:hover{background:var(--creme)}
.omg-ajuda .mi.on{background:var(--bebe);color:var(--pri);font-weight:600}
.omg-ajuda .mi.on small{color:var(--pri)}
.omg-ajuda .sel{display:none;width:100%;padding:10px 12px;border:1px solid var(--bebe);border-radius:12px;background:#fff;font:inherit;color:inherit;margin-bottom:14px}
.omg-ajuda .destaques{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:22px}
.omg-ajuda .destaques div{background:#fff;border:1px solid var(--linha);border-radius:14px;padding:14px;font-size:13px}
.omg-ajuda .destaques b{display:block;color:var(--pri);margin-bottom:4px;font-size:14px}
.omg-ajuda .pops{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.omg-ajuda .pop{background:#fff;border:1px solid var(--linha);border-radius:14px;padding:12px 14px}
.omg-ajuda .pt{border:0;background:none;font:inherit;font-weight:700;color:var(--ameixa);padding:0;cursor:pointer;font-size:14.5px}
.omg-ajuda .pt:hover{color:var(--pri)}
.omg-ajuda .pop ul{margin:6px 0 0;padding-left:18px}
.omg-ajuda .pop li{margin:3px 0;font-size:13px}
.omg-ajuda .pop a{color:var(--muted);text-decoration:none}
.omg-ajuda .pop a:hover{color:var(--pri);text-decoration:underline}
.omg-ajuda h2.inicio{font-size:17px;margin:0 0 10px}
.omg-ajuda .cat{display:none;margin:0 0 20px}
.omg-ajuda.busca-on .cat,.omg-ajuda .cat.on{display:block}
.omg-ajuda.busca-on .home,.omg-ajuda.cat-on .home{display:none}
.omg-ajuda .cat h2{font-size:20px;margin:0 0 2px}
.omg-ajuda .cat .desc{margin:0 0 10px;color:var(--muted);font-size:13px}
.omg-ajuda details.q{background:#fff;border:1px solid var(--linha);border-radius:12px;margin:7px 0;overflow:hidden}
.omg-ajuda details.q summary{cursor:pointer;padding:11px 40px 11px 14px;font-weight:600;list-style:none;position:relative;font-size:14px}
.omg-ajuda details.q summary::-webkit-details-marker{display:none}
.omg-ajuda details.q summary::after{content:"+";position:absolute;right:14px;top:7px;font-size:20px;color:var(--framboesa)}
.omg-ajuda details.q[open] summary::after{content:"–"}
.omg-ajuda details.q[open] summary{background:var(--bebe)}
.omg-ajuda .r{padding:2px 14px 12px}
.omg-ajuda .r p{margin:9px 0}
.omg-ajuda .r ul,.omg-ajuda .r ol{margin:8px 0;padding-left:22px}
.omg-ajuda .r li{margin:4px 0}
.omg-ajuda .r a{color:var(--pri)}
.omg-ajuda .aviso{background:#fff;border-left:4px solid var(--menta);padding:8px 12px;border-radius:8px;font-size:12.5px}
.omg-ajuda mark.pend{background:#FFE08A;color:#5a3b00;border:1px dashed #C78A00;border-radius:6px;padding:0 4px;font-weight:600}
.omg-ajuda .vazio{display:none;text-align:center;color:var(--muted);padding:20px}
.omg-ajuda .contato{background:var(--pri);color:#fff;border-radius:14px;padding:14px;margin-top:10px;font-size:13px}
.omg-ajuda .contato a{color:#fff;font-weight:700}
@media (max-width:820px){.omg-ajuda .grade{grid-template-columns:minmax(0,1fr)}.omg-ajuda .lado{display:none}.omg-ajuda .sel{display:block}.omg-ajuda .destaques,.omg-ajuda .pops{grid-template-columns:minmax(0,1fr)}.omg-ajuda .busca{flex:1 1 100%}}
"""
JS = """
(function(){var R=document.querySelector('.omg-ajuda');if(!R)return;
var inp=R.querySelector('#omg-busca'),qs=[].slice.call(R.querySelectorAll('details.q')),cats=[].slice.call(R.querySelectorAll('section.cat')),mis=[].slice.call(R.querySelectorAll('.mi')),sel=R.querySelector('.sel'),vz=R.querySelector('.vazio');
function norm(s){return (s||'').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'')}
var cat='';
function abre(c){cat=c||'';inp.value='';R.classList.remove('busca-on');R.classList.toggle('cat-on',!!cat);
 cats.forEach(function(s){s.classList.toggle('on',s.dataset.cat===cat)});mis.forEach(function(m){m.classList.toggle('on',m.dataset.cat===cat)});
 if(sel)sel.value=cat;qs.forEach(function(d){d.style.display=''});vz.style.display='none'}
function busca(){var t=norm(inp.value).trim();if(!t){abre(cat);return}
 R.classList.add('busca-on');var n=0;
 qs.forEach(function(d){var ok=norm(d.dataset.busca+' '+d.textContent).indexOf(t)>=0;d.style.display=ok?'':'none';if(ok)n++});
 cats.forEach(function(s){s.style.display=[].some.call(s.querySelectorAll('details.q'),function(d){return d.style.display!=='none'})?'':'none'});
 vz.style.display=n?'none':'block'}
inp.addEventListener('input',function(){cats.forEach(function(s){s.style.display=''});busca()});
mis.forEach(function(m){m.addEventListener('click',function(){abre(m.dataset.cat);R.scrollIntoView({behavior:'smooth'})})});
R.querySelector('.mi-inicio').addEventListener('click',function(){abre('')});
if(sel)sel.addEventListener('change',function(){abre(sel.value)});
[].forEach.call(R.querySelectorAll('.pt'),function(b){b.addEventListener('click',function(){abre(b.dataset.cat)})});
[].forEach.call(R.querySelectorAll('[data-ir]'),function(a){a.addEventListener('click',function(e){e.preventDefault();abre(a.dataset.c);var d=document.getElementById(a.dataset.ir);if(d){d.open=true;d.scrollIntoView({behavior:'smooth',block:'center'})}})});
if(location.hash){var d=R.querySelector(location.hash);if(d&&d.tagName==='DETAILS'){abre(d.closest('section').dataset.cat);d.open=true}}
})();
"""
opts = "".join(f'<option value="{slug}">{html.escape(titulo)}</option>' for slug, titulo, desc, qs in C.CATS)
corpo = f"""<div class="omg-ajuda">
<style>{CSS}</style>
<div class="topo"><div><h1>Central de Ajuda</h1><p>Pedidos, impostos, entrega e skincare. Não achou? Fale com a gente. 💗</p></div>
<label class="busca"><span aria-hidden="true">🔍</span><input id="omg-busca" type="search" placeholder="Busque: prazo, imposto, CPF, devolução…" aria-label="Buscar na Central de Ajuda"></label></div>
<div class="grade">
<aside class="lado" aria-label="Categorias"><div class="tit">Categorias</div><button type="button" class="mi mi-inicio"><span>Início</span><small></small></button>{''.join(menu)}
<div class="contato"><b>Ainda com dúvida?</b><br>WhatsApp: {inline('[A DEFINIR #D1: número do WhatsApp]')}<br>E-mail: <a href="mailto:{C.EMAIL}">{C.EMAIL}</a></div></aside>
<main>
<select class="sel" aria-label="Categoria"><option value="">Início · todas as categorias</option>{opts}</select>
<div class="home">
<div class="destaques">
<div><b>Imposto já incluso</b>O total do checkout já tem Imposto de Importação e ICMS. Sem taxa surpresa na entrega.</div>
<div><b>Direto da Coreia</b>Produtos originais, comprados de marcas e distribuidores e enviados de Seul para você.</div>
<div><b>Até 15 dias úteis</b>Prazo oficial para capitais, com rastreio desde a Coreia.</div>
</div>
<h2 class="inicio">Perguntas mais comuns</h2>
<div class="pops">{''.join(populares)}</div>
</div>
{chr(10).join(cats_html)}
<p class="vazio">Não encontramos nada com essa busca. Tente outra palavra ou fale com a gente.</p>
<p class="aviso" style="margin-top:18px">{html.escape(C.AVISO)}</p>
</main></div>
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
