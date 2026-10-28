"""Plano B: escolhe fotos da galeria oficial (índice) e, quando preciso, apaga selos de brinde (retângulos brancos)
ou recorta (caixa relativa). Grava em site/fotos/<handle>-N.jpg (servido pelo GitHub Pages) e plano_b_saida.json com as URLs.
Formato de cada foto: índice, ou [índice, [retângulos brancos x0,y0,x1,y1 relativos], (recorte x0,y0,x1,y1 relativo)]."""
import io, json
from pathlib import Path
import requests
from PIL import Image, ImageDraw
A = Path(__file__).resolve().parent
R = A.parent.parent
SPEC = json.loads((A / "plano_b.json").read_text()); URLS = json.loads((A / "galeria_urls.json").read_text())
OUT = R / "site/fotos"; OUT.mkdir(parents=True, exist_ok=True)
BASE = "https://brunotae.github.io/omg-erp/site/fotos/"
saida, prev = {}, []
for h, s in SPEC.items():
    lista = []
    for k, f in enumerate(s["fotos"]):
        if isinstance(f, int): lista.append(URLS[h][f]); continue
        i, rets = f[0], f[1]; corte = f[2] if len(f) > 2 else None
        im = Image.open(io.BytesIO(requests.get(URLS[h][i], timeout=30, headers={"User-Agent": "Mozilla/5.0"}).content)).convert("RGB")
        W, H = im.size; d = ImageDraw.Draw(im)
        for x0, y0, x1, y1 in rets: d.rectangle([x0 * W, y0 * H, x1 * W, y1 * H], fill=(255, 255, 255))
        if corte:
            x0, y0, x1, y1 = corte; im = im.crop((int(x0 * W), int(y0 * H), int(x1 * W), int(y1 * H)))
            w, hh = im.size; lado = max(w, hh); fundo = Image.new("RGB", (lado, lado), "white"); fundo.paste(im, ((lado - w) // 2, (lado - hh) // 2)); im = fundo
        nome = f"{h}-{k + 1}.jpg"; im.save(OUT / nome, quality=90); lista.append(BASE + nome)
        t = im.copy(); t.thumbnail((500, 500)); prev.append(t)
    saida[h] = lista
(A / "plano_b_saida.json").write_text(json.dumps(saida, indent=1))
if prev:
    f = Image.new("RGB", (510 * len(prev), 510), "white")
    for i, t in enumerate(prev): f.paste(t, (i * 510, 0))
    f.save(A / "plano_b_preview.jpg", quality=80)
