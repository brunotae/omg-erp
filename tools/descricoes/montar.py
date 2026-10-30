# Monta o HTML do padrão novo (igual ao da TIRTIR Mask Fit Red Cushion) a partir dos lotes JSON.
import json, glob, html, sys
E = lambda s: html.escape(str(s or ''), quote=False)
CSS = '<style>.omg-sec>summary{list-style:none;display:flex;justify-content:space-between;align-items:center}.omg-sec>summary::-webkit-details-marker{display:none}.omg-sec>summary::after{content:"+";font-size:1.4em;font-weight:400;line-height:1}.omg-sec[open]>summary::after{content:"\\2212"}</style>'
def sec(t, corpo, aberto=False):
    return f'<details class="omg-sec"{" open" if aberto else ""} style="border-top:1px solid rgba(0,0,0,.12)"><summary style="cursor:pointer;font-weight:600;padding:14px 0;">{t}</summary><div style="padding:0 0 14px">{corpo}</div></details>'
def ul(L, tag='ul'):
    L = [x for x in (L or []) if str(x).strip()]
    return f'<{tag}>\n' + '\n'.join(f'<li>{E(x)}</li>' for x in L) + f'\n</{tag}>' if L else ''
def montar(d, sku='', marca=''):
    h = [CSS, '<div class="omg-desc">', f'<p class="omg-nota"><strong>Descrição</strong><br>{E(d["descricao"])}</p>']
    if d.get('tamanho'): h.append(f'<p><strong>Tamanho:</strong> {E(d["tamanho"])}</p>')
    if d.get('beneficios'): h.append(sec('Benefícios', ul(d['beneficios'])))
    if d.get('indicado'): h.append(sec('Indicado para', f'<p>{E(d["indicado"])}</p>'))
    if d.get('opcoes'): h.append(sec('Opções', f'<p>{E(d["opcoes"])}</p>'))
    if d.get('como_usar'): h.append(sec('Como usar', ul(d['como_usar'], 'ol')))
    ing = ul(d.get('ingredientes'))
    if d.get('inci'): ing += f'\n<p class="omg-inci"><small>{E(d["inci"])}</small></p>\n<p><small>A composição pode mudar entre lotes. Vale sempre a lista impressa na embalagem.</small></p>'
    if ing: h.append(sec('Ingredientes', ing))
    det = [f'Marca: {marca}' if marca else '', 'Fabricado em: Coreia do Sul', f'SKU: {sku}' if sku else '']
    h.append(sec('Detalhes', ul(det)))
    if d.get('sobre_marca'): h.append(sec('Sobre a marca', f'<p>{E(d["sobre_marca"])}</p>'))
    h.append('<p style="border-top:1px solid rgba(0,0,0,.12);padding-top:14px"><small>Produto importado da Coreia do Sul. Será registrada uma Declaração de Importação e o pedido está sujeito aos tributos federais e estaduais, calculados no checkout.</small></p>')
    h.append('</div>')
    return '\n'.join(h)
if __name__ == '__main__':
    extra = json.load(open('tools/descricoes/extra.json')) if len(sys.argv) > 1 else {}
    out = []
    for f in sorted(glob.glob('tools/descricoes/lote*.json')):
        for d in json.load(open(f)):
            x = extra.get(str(d['id']), {})
            out.append({'id': d['id'], 'handle': d['handle'], 'html': montar(d, x.get('sku', ''), x.get('marca', ''))})
    json.dump(out, open('tools/descricoes/html.json', 'w'), ensure_ascii=False)
    print(len(out))
