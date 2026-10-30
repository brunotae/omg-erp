# Baixa imagens grandes dos sites oficiais das marcas para montar banners do carrossel.
import re, os, json, hashlib, urllib.request, urllib.parse
from PIL import Image
SITES = {'thekyeok': 'https://www.thekyeok.kr/58', 'meesang': 'https://meesangglobal.imweb.me/home', 'medicube': 'https://medicube.global/'}
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129 Safari/537.36', 'Accept-Language': 'en,ko;q=0.8'}
def get(u):
    return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=40).read()
rel = {}
for k, u in SITES.items():
    os.makedirs(f'tools/banners/{k}', exist_ok=True)
    try:
        h = get(u).decode('utf-8', 'ignore')
    except Exception as e:
        rel[k] = {'erro': str(e)}; continue
    open(f'tools/banners/{k}/pagina.html', 'w').write(h[:600000])
    urls = set()
    for m in re.finditer(r'''(?:src|data-src|data-original|content|href|data-bg|data-image)\s*=\s*["']([^"']+\.(?:jpe?g|png|webp)(?:\?[^"']*)?)["']''', h, re.I): urls.add(m.group(1))
    for m in re.finditer(r'url\(\s*["\']?([^"\')]+\.(?:jpe?g|png|webp)[^"\')]*)', h, re.I): urls.add(m.group(1))
    for m in re.finditer(r'"(https?:\\?/\\?/[^"]+\.(?:jpe?g|png|webp)[^"]*)"', h, re.I): urls.add(m.group(1).replace('\\/', '/'))
    feitos = []
    for x in sorted(urls):
        x = urllib.parse.urljoin(u, x.replace('&amp;', '&'))
        if x.startswith('//'): x = 'https:' + x
        x2 = re.sub(r'([?&])(width|w|h|height)=\d+', r'\1', x)
        try:
            b = get(x2 if '{width}' not in x2 else x2.replace('{width}', '2000'))
        except Exception:
            continue
        nome = hashlib.md5(x.encode()).hexdigest()[:10]
        p = f'tools/banners/{k}/{nome}'
        open(p, 'wb').write(b)
        try:
            im = Image.open(p); w, hh = im.size
        except Exception:
            os.remove(p); continue
        if w < 700 or hh < 400:
            os.remove(p); continue
        ext = (im.format or 'jpg').lower().replace('jpeg', 'jpg')
        os.rename(p, p + '.' + ext); feitos.append({'arq': nome + '.' + ext, 'url': x, 'w': w, 'h': hh})
    rel[k] = {'imagens': feitos}
    # folha de contato
    ims = feitos[:40]
    if ims:
        T = 300; cols = 5; rows = (len(ims) + cols - 1) // cols
        sheet = Image.new('RGB', (cols * T, rows * (T + 0)), 'white')
        for i, f in enumerate(ims):
            im = Image.open(f'tools/banners/{k}/' + f['arq']).convert('RGB'); im.thumbnail((T - 6, T - 6))
            sheet.paste(im, ((i % cols) * T + 3, (i // cols) * T + 3))
        sheet.save(f'tools/banners/{k}/_folha.jpg', quality=80)
json.dump(rel, open('tools/banners/relatorio.json', 'w'), indent=1, ensure_ascii=False)
print(json.dumps({k: (len(v.get('imagens', [])) if 'imagens' in v else v) for k, v in rel.items()}))
