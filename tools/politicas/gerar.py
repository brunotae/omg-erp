# Gera as páginas de políticas (HTML pronto para colar no Shopify) a partir de docs/politicas/*.md
import os, re, html, markdown
RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC, OUT = f"{RAIZ}/docs/politicas", f"{RAIZ}/site/politicas"
LINKS = {  # links internos entre políticas (URLs padrão do Shopify)
    "Termos": "/policies/terms-of-service", "Privacidade": "/policies/privacy-policy",
    "Trocas": "/policies/refund-policy", "Entrega": "/policies/shipping-policy", "Cookies": "/pages/cookies",
}
CSS = """
.omg-pol{--pri:#B83D66;--fram:#D9577F;--bebe:#FDE4EC;--creme:#FFF9F6;--ameixa:#4A2638;--menta:#9EDFC4;--muted:#7A5566;--linha:#F6E2E9;
 font-family:Poppins,"Helvetica Neue",Arial,sans-serif;color:var(--ameixa);background:var(--creme);max-width:860px;margin:0 auto;padding:24px 18px 48px;font-size:15px;line-height:1.7}
.omg-pol *{box-sizing:border-box}
.omg-pol h1{font-size:clamp(24px,3.4vw,32px);line-height:1.2;margin:0 0 4px;font-weight:800}
.omg-pol h1+p em{color:var(--muted);font-size:13px}
.omg-pol h2{font-size:18px;margin:30px 0 8px;padding-top:12px;border-top:1px solid var(--linha);scroll-margin-top:90px}
.omg-pol p,.omg-pol li{margin:6px 0}
.omg-pol ul,.omg-pol ol{padding-left:22px}
.omg-pol a{color:var(--pri)}
.omg-pol strong{font-weight:700}
.omg-pol .toc{background:#fff;border:1px solid var(--linha);border-radius:14px;padding:12px 16px;margin:16px 0 8px;font-size:14px}
.omg-pol .toc b{display:block;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
.omg-pol .toc ol{margin:0;padding-left:20px;columns:2;column-gap:24px}
.omg-pol .toc li{margin:3px 0;break-inside:avoid}
.omg-pol .toc a{text-decoration:none;color:var(--ameixa)}
.omg-pol .toc a:hover{color:var(--pri);text-decoration:underline}
.omg-pol .tbl{overflow-x:auto;margin:10px 0}
.omg-pol table{border-collapse:collapse;width:100%;font-size:14px;background:#fff;border-radius:12px;overflow:hidden}
.omg-pol th,.omg-pol td{border-bottom:1px solid var(--linha);padding:9px 12px;text-align:left;vertical-align:top}
.omg-pol th{background:var(--bebe);font-weight:700}
.omg-pol mark.pend{background:#FFE08A;color:#5a3b00;border:1px dashed #C78A00;border-radius:6px;padding:0 4px;font-weight:600}
.omg-pol .aviso{background:#fff;border-left:4px solid var(--menta);padding:10px 14px;border-radius:8px;font-size:13.5px;margin-top:26px}
@media (max-width:640px){.omg-pol{font-size:14.5px;padding:18px 14px 40px}.omg-pol .toc ol{columns:1}}
"""
AVISO = ("Dúvidas? Fale com a gente: WhatsApp <a href=\"https://wa.me/5511993049122\">+55 11 99304-9122</a> · "
         "<a href=\"mailto:info.br@ohmygirl.com.br\">info.br@ohmygirl.com.br</a> · MPOEMA INC (OMG! / Oh My Girl) — Los Angeles, Califórnia, EUA.")

def pend(s):
    return re.sub(r"\[(A (?:DEFINIR|VERIFICAR)[^\]]*)\]", lambda m: f'<mark class="pend" title="Pendente">⚠ {html.escape(m.group(1))}</mark>', s)

def links(md_text):
    def f(m):
        txt = m.group(1)
        for k, url in LINKS.items():
            if k in txt: return f"[{txt}]({url})"
        return m.group(0)
    return re.sub(r"\[([^\]]+)\]\(#\)", f, md_text)

paginas = []
os.makedirs(OUT, exist_ok=True)
for fn in sorted(os.listdir(SRC)):
    if not re.match(r"\d\d-.*\.md$", fn): continue
    md_text = links(open(f"{SRC}/{fn}", encoding="utf-8").read())
    md = markdown.Markdown(extensions=["tables", "toc", "sane_lists"], extension_configs={"toc": {"slugify": lambda v, s: re.sub(r"[^a-z0-9]+", "-", html.unescape(v).lower().encode("ascii","ignore").decode()).strip("-")}})
    corpo = md.convert(md_text)
    corpo = corpo.replace("<table>", '<div class="tbl"><table>').replace("</table>", "</table></div>")
    titulo = re.search(r"<h1[^>]*>(.*?)</h1>", corpo).group(1)
    h2 = re.findall(r'<h2 id="([^"]+)">(.*?)</h2>', corpo)
    toc = ""
    if len(h2) >= 4:
        toc = '<nav class="toc" aria-label="Sumário"><b>Nesta página</b><ol>' + "".join(f'<li><a href="#{i}">{re.sub(r"^\d+\. ", "", t)}</a></li>' for i, t in h2) + "</ol></nav>"
        corpo = re.sub(r"(</h1>\s*<p>.*?</p>)", r"\1" + toc.replace("\\", "\\\\"), corpo, count=1, flags=re.S)
    corpo = pend(corpo)
    out = f'<div class="omg-pol">\n<style>{CSS}</style>\n{corpo}\n<p class="aviso">{AVISO}</p>\n</div>\n'
    nome = fn[3:-3]
    open(f"{OUT}/{nome}.html", "w", encoding="utf-8").write(out)
    paginas.append((nome, titulo, len(re.findall(r'mark class="pend"', out))))

# Rodapé (Decreto 7.962/2013, art. 2º)
rodape = """<div class="omg-rodape-empresa" style="font-family:Poppins,Arial,sans-serif;font-size:12.5px;line-height:1.6;color:#7A5566;text-align:center;padding:14px 12px">
  <strong style="color:#4A2638">MPOEMA INC</strong> · Los Angeles, Califórnia, EUA<br>
  <a href="mailto:info.br@ohmygirl.com.br" style="color:#B83D66">info.br@ohmygirl.com.br</a> · WhatsApp <a href="https://wa.me/5511993049122" style="color:#B83D66">+55 11 99304-9122</a> · seg. a sex., 9h às 18h (Brasília)<br>
  Empresa certificada no Programa Remessa Conforme (ADE Coana nº 81/2026, alterado pelo ADE nº 111/2026).<br>
  <a href="/policies/terms-of-service" style="color:#7A5566">Termos de Uso</a> · <a href="/policies/privacy-policy" style="color:#7A5566">Privacidade</a> · <a href="/policies/refund-policy" style="color:#7A5566">Trocas e Devoluções</a> · <a href="/policies/shipping-policy" style="color:#7A5566">Entrega</a> · <a href="/pages/cookies" style="color:#7A5566">Cookies</a>
</div>
"""
open(f"{OUT}/rodape-empresa.html", "w", encoding="utf-8").write(rodape)
for p in paginas: print(p)
