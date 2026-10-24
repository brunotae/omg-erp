# Gera site/marcas/preview.html (prévia da página de marcas com logos embutidos)
import json,base64,re,os
os.chdir(os.path.join(os.path.dirname(__file__),'..','..','site','marcas'))
M=json.load(open('marcas.json'))
liq=open('sections/omg-marcas.liquid').read()
css=re.search(r'<style>(.*?)</style>',liq,re.S).group(1).replace('{{ section.id }}','p').replace('{{ section.settings.colunas }}','6')
js=re.search(r'<script>(.*?)</script>',liq,re.S).group(1).replace('{{ section.id }}','p')
items=''.join(f'<li class="omg-marcas__item" data-nome="{m["marca"].lower()}"><a class="omg-marcas__tile" href="#" title="{m["marca"]}"><img class="omg-marcas__logo" alt="{m["marca"]}" loading="lazy" src="data:image/png;base64,{base64.b64encode(open("logos/"+m["slug"]+".png","rb").read()).decode()}"></a></li>' for m in M)
html=f'''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Marcas OMG</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;700&display=swap" rel="stylesheet">
<style>body{{margin:0;background:#FFF9F6}}.bar{{font-family:Poppins,sans-serif;display:flex;gap:10px 22px;justify-content:center;flex-wrap:wrap;padding:14px 16px;border-bottom:1px solid #FDE4EC;background:#fff;color:#4A2638;font-size:14px}}.bar b{{color:#B83D66}}{css}</style></head><body>
<nav class="bar"><span>Rosto</span><span>Cabelo</span><span>Corpo e Banho</span><span>Protetor Solar</span><span>Maquiagem</span><b>Marcas</b><span>Todos os produtos</span><span>Contato</span></nav>
<section class="omg-marcas" id="omg-marcas-p"><div class="omg-marcas__topo"><p class="omg-marcas__sobre">Direto da Coreia</p><h1 class="omg-marcas__titulo">Nossas marcas</h1><div class="omg-marcas__texto"><p>Todas originais, compradas na Coreia do Sul e enviadas direto para você, com imposto já incluso.</p></div>
<label class="omg-marcas__busca"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" placeholder="Buscar marca" aria-label="Buscar marca" data-omg-busca></label></div>
<ul class="omg-marcas__grade" role="list">{items}</ul><p class="omg-marcas__vazio" hidden data-omg-vazio>Nenhuma marca encontrada.</p></section>
<script>{js}</script></body></html>'''
open('preview.html','w').write(html)
