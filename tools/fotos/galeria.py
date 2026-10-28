"""Folha com TODAS as fotos de páginas oficiais escolhidas, numeradas, para escolher a foto certa a olho.
Entrada: tools/fotos/galeria_pedido.json {nosso_handle: [marca_catalogo, handle_oficial]}
Saída: tools/fotos/galeria/<nosso_handle>.jpg e galeria_urls.json
"""
import io, json, textwrap, concurrent.futures as cf
from pathlib import Path
import requests
from PIL import Image, ImageDraw, ImageFont
A = Path(__file__).resolve().parent
P = json.loads((A / "galeria_pedido.json").read_text())
OUT = A / "galeria"; OUT.mkdir(exist_ok=True)
font = ImageFont.load_default(size=16)
def baixar(u):
    try:
        r = requests.get(u, timeout=25, headers={"User-Agent": "Mozilla/5.0"}); im = Image.open(io.BytesIO(r.content)).convert("RGB"); im.thumbnail((380, 380)); return im
    except Exception: return None
urls = {}
for h, (marca, oh) in P.items():
    cat = json.loads((A.parent / "fontes/catalogos" / f"{marca}.json").read_text())
    o = next(x for x in cat["produtos"] if x["handle"] == oh)
    imgs = o.get("images", [])[:12]; urls[h] = imgs
    with cf.ThreadPoolExecutor(8) as ex: ims = list(ex.map(baixar, imgs))
    W = 4; cols = W; rows = (len(ims) + W - 1) // W
    f = Image.new("RGB", (400 * cols, 40 + 410 * rows), "white"); d = ImageDraw.Draw(f)
    d.text((8, 10), f"{h}  ←  {o['title']}", fill=(150, 0, 60), font=font)
    for i, im in enumerate(ims):
        x, y = (i % W) * 400, 40 + (i // W) * 410
        if im: f.paste(im, (x + 10, y + 20))
        d.text((x + 10, y + 2), f"foto {i + 1}", fill=(0, 0, 0), font=font)
    f.save(OUT / f"{h}.jpg", quality=75)
(A / "galeria_urls.json").write_text(json.dumps(urls, indent=0))
