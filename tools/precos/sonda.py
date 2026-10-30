# Sonda: baixa páginas dos concorrentes válidos para entender como ler preço e catálogo.
import urllib.request, os, ssl
U = {
 'jini_home':'https://jinicosmeticos.com.br/',
 'jini_robots':'https://jinicosmeticos.com.br/robots.txt',
 'jini_sitemap':'https://jinicosmeticos.com.br/sitemap.xml',
 'jini_prod':'https://jinicosmeticos.com.br/produtos/celimax-retinal-shot-tightening-booster-15ml-e2t8o/',
 'jini_busca':'https://jinicosmeticos.com.br/search/?q=anua',
 'ks_home':'https://kscosmeticos.com.br/',
 'ks_robots':'https://kscosmeticos.com.br/robots.txt',
 'ks_sitemap':'https://kscosmeticos.com.br/sitemap.xml',
 'ks_prod':'https://kscosmeticos.com.br/produtos/shclmx0009-celimax-the-vita-a-retinal-shot-tightening-booster-15ml',
 'ks_prod2':'https://kscosmeticos.com.br/produtos/ody0006-one-days-you-mascara-facial-de-colageno-30-dias',
 'ks_busca':'https://kscosmeticos.com.br/busca?q=anua',
 'ks_busca2':'https://kscosmeticos.com.br/pesquisa?q=anua',
}
os.makedirs('tools/precos/sonda', exist_ok=True)
for k,u in U.items():
  try:
    r = urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129 Safari/537.36','Accept-Language':'pt-BR'}), timeout=30)
    b = r.read(); st = r.status; fu = r.geturl()
  except Exception as e:
    b = str(e).encode(); st = getattr(e,'code',0); fu=u
  open(f'tools/precos/sonda/{k}.txt','wb').write(f'{st} {fu}\n'.encode()+b[:400000])
  print(k, st, len(b))
