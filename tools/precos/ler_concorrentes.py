# Lê o catálogo inteiro dos concorrentes válidos (KS e Jini) e grava em conc_catalogo no Supabase.
# Roda pelo GitHub Actions (toda segunda e quando alguém pede). Educado: 1 página por vez, pausa entre elas.
# Precisa de SUPABASE_ACCESS_TOKEN (já existe nos segredos do repositório).
import json, os, re, sys, time, html, urllib.request

LOJAS = {
    'ks':   {'sitemap': 'https://kscosmeticos.com.br/sitemap.xml',   'padrao': r'https://kscosmeticos\.com\.br/(produtos|kits)/[^<\s]+'},
    'jini': {'sitemap': 'https://jinicosmeticos.com.br/sitemap.xml', 'padrao': r'https://jinicosmeticos\.com\.br/produtos/[^<\s]+'},
}
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129 Safari/537.36', 'Accept-Language': 'pt-BR'}
PROJ = 'nzsiuniabovvptuqmkmi'
TOKEN = os.environ.get('SUPABASE_ACCESS_TOKEN', '')
SO = [a for a in sys.argv[1:] if a in LOJAS]  # opcional: só uma loja


def baixar(u, tent=3):
    for i in range(tent):
        try:
            r = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30)
            return r.read().decode('utf-8', 'ignore')
        except Exception as e:
            err = e
            time.sleep(3 * (i + 1))
    raise err


def norm(u):
    return re.sub(r'[?#].*$', '', u).rstrip('/').lower()


def num(v):
    try:
        x = float(str(v).replace(',', '.'))
        return x if x > 0 else None
    except Exception:
        return None


def produtos_ld(t):
    out = []
    for m in re.finditer(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>', t, re.S | re.I):
        try:
            j = json.loads(m.group(1).strip(), strict=False)
        except Exception:
            continue
        pilha = j if isinstance(j, list) else [j]
        while pilha:
            o = pilha.pop()
            if isinstance(o, dict):
                if o.get('@type') == 'Product':
                    out.append(o)
                for k in ('@graph',):
                    if isinstance(o.get(k), list):
                        pilha.extend(o[k])
            elif isinstance(o, list):
                pilha.extend(o)
    return out


def ler_pagina(loja, url):
    t = baixar(url)
    ps = produtos_ld(t)
    alvo = norm(url)
    p = None
    for o in ps:
        of = o.get('offers') or {}
        if isinstance(of, list):
            of = of[0] if of else {}
        ids = [of.get('url', ''), (o.get('mainEntityOfPage') or {}).get('@id', '') if isinstance(o.get('mainEntityOfPage'), dict) else '', o.get('url', '')]
        if any(norm(x) == alvo for x in ids if x):
            p = o
            break
    if p is None and loja == 'ks' and ps:
        p = ps[0]
    nome = marca = sku = None
    preco = de = peso = None
    esg = False
    if p:
        nome = p.get('name')
        b = p.get('brand')
        marca = b.get('name') if isinstance(b, dict) else b
        sku = p.get('sku')
        of = p.get('offers') or {}
        if isinstance(of, list):
            of = of[0] if of else {}
        preco = num(of.get('price') or of.get('lowPrice'))
        esg = 'OutOfStock' in str(of.get('availability', ''))
        w = p.get('weight')
        if isinstance(w, dict) and num(w.get('value')):
            peso = round(num(w['value']) * (1000 if str(w.get('unitCode', 'KGM')).upper() == 'KGM' else 1))
    if loja == 'jini':
        m = re.search(r'<meta property="nuvemshop:price" content="([\d.,]+)"', t)
        if preco is None and m:
            preco = num(m.group(1))
        m = re.search(r'"compare_at_price_number":\s*([\d.]+)', t)
        if m and num(m.group(1)):
            de = num(m.group(1))
        if not nome:
            m = re.search(r'<meta property="og:title" content="([^"]+)"', t)
            nome = html.unescape(m.group(1)) if m else None
        if not marca and nome and ' - ' in nome:
            marca = nome.split(' - ')[0].strip()
        if '"available":false' in t.split('LS.variants', 1)[-1][:3000]:
            esg = True
    if loja == 'ks' and preco:
        # preço "de" (riscado), se houver, logo antes do preço atual
        m = re.search(r'line-through[^>]*>\s*R\$\s*([\d.]+,\d{2})', t)
        if m:
            de = num(m.group(1).replace('.', '').replace(',', '.'))
    if de and preco and de <= preco:
        de = None
    return {'url': url, 'loja': loja, 'nome': html.unescape(nome) if nome else None, 'marca': marca, 'sku': sku,
            'preco': preco, 'preco_de': de, 'esgotado': esg, 'peso_g': peso}


def sql(q):
    corpo = json.dumps({'query': q}).encode()
    r = urllib.request.Request(f'https://api.supabase.com/v1/projects/{PROJ}/database/query', data=corpo, method='POST',
                               headers={'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json'})
    return json.loads(urllib.request.urlopen(r, timeout=120).read() or b'null')


def gravar(linhas):
    for i in range(0, len(linhas), 150):
        parte = json.dumps(linhas[i:i + 150], ensure_ascii=False).replace('$omgj$', '')
        sql(f"""
with d as (select * from jsonb_to_recordset($omgj${parte}$omgj$::jsonb)
  as x(url text, loja text, nome text, marca text, sku text, preco numeric, preco_de numeric, esgotado boolean, peso_g numeric))
insert into conc_catalogo as c (url, loja, nome, marca, sku, preco, preco_de, esgotado, peso_g, ativo, lido_em)
select url, loja, nome, marca, sku, preco, preco_de, coalesce(esgotado,false), peso_g, true, now() from d where preco is not null
on conflict (url) do update set
  preco_ant = case when c.preco is distinct from excluded.preco then c.preco else c.preco_ant end,
  mudou_em  = case when c.preco is distinct from excluded.preco then now() else c.mudou_em end,
  nome = excluded.nome, marca = excluded.marca, sku = excluded.sku, preco = excluded.preco, preco_de = excluded.preco_de,
  esgotado = excluded.esgotado, peso_g = coalesce(excluded.peso_g, c.peso_g), ativo = true, lido_em = now();""")


def main():
    if not TOKEN:
        sys.exit('falta SUPABASE_ACCESS_TOKEN')
    resumo = {}
    for loja, cfg in LOJAS.items():
        if SO and loja not in SO:
            continue
        sm = baixar(cfg['sitemap'])
        urls = sorted(set(html.unescape(u) for u in re.findall(cfg['padrao'], sm)))
        print(loja, len(urls), 'páginas no sitemap', flush=True)
        linhas, erros = [], 0
        for k, u in enumerate(urls):
            try:
                linhas.append(ler_pagina(loja, u))
            except Exception as e:
                erros += 1
                print('erro', u, e, flush=True)
            time.sleep(0.6)
            if k % 50 == 0:
                print(loja, k, '/', len(urls), flush=True)
        ok = [l for l in linhas if l['preco']]
        print(loja, 'lidos com preço:', len(ok), 'sem preço:', len(linhas) - len(ok), 'erros:', erros, flush=True)
        gravar(ok)
        # o que sumiu do site fica inativo (só se a leitura foi boa, para não apagar tudo num dia ruim)
        if urls and len(ok) >= 0.7 * len(urls):
            vistos = json.dumps([l['url'] for l in ok]).replace('$omgj$', '')
            sql(f"update conc_catalogo set ativo=false where loja='{loja}' and ativo and url not in (select jsonb_array_elements_text($omgj${vistos}$omgj$::jsonb));")
        resumo[loja] = {'paginas': len(urls), 'com_preco': len(ok), 'erros': erros}
    print(json.dumps(resumo))
    with open(os.environ.get('GITHUB_STEP_SUMMARY', '/dev/null'), 'a') as f:
        f.write('### Leitura dos concorrentes\n\n' + '\n'.join(f'- {k}: {v["com_preco"]} produtos com preço de {v["paginas"]} páginas ({v["erros"]} erros)' for k, v in resumo.items()) + '\n')


if __name__ == '__main__':
    main()
