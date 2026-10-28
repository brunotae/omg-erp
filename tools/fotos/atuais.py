"""Folhas para conferir a FOTO ATUAL do site dos produtos do lote 1 que não recebem foto oficial.
Cada quadro: nome do produto + 2 primeiras fotos atuais. Saída: tools/fotos/atuais/*.jpg e atuais_indice.json"""
import io, json, textwrap, shutil, concurrent.futures as cf
from pathlib import Path
import requests
from PIL import Image, ImageDraw, ImageFont
A = Path(__file__).resolve().parent
import os
D = json.loads((A / os.environ.get("DECISAO", "decisao_final.json")).read_text())
L = set(D) if os.environ.get("DECISAO") else set(json.loads((A.parent.parent / "site/lote1.json").read_text()))
F = {f["handle"]: f for f in json.loads((A.parent.parent / "bomi/fichas-produtos.json").read_text())}
for h, v in D.items():
    if h in F: v["titulo"] = F[h]["nome"]; v["marca"] = F[h]["marca"]
itens_sem = [(h, v) for h, v in sorted(D.items()) if not v["ok"] and h in L and not v.get("fotos_originais")]
(A / (os.environ.get("SAIDA", "atuais") + "_semfoto.json")).write_text(json.dumps([h for h, _ in itens_sem]))
itens = [(h, v) for h, v in sorted(D.items()) if not v["ok"] and h in L and v.get("fotos_originais")]
OUT = A / os.environ.get("SAIDA", "atuais"); shutil.rmtree(OUT, ignore_errors=True); OUT.mkdir()
font = ImageFont.load_default(size=13)
def baixar(u):
    try:
        r = requests.get(u, timeout=25, headers={"User-Agent": "Mozilla/5.0"}); im = Image.open(io.BytesIO(r.content)).convert("RGB"); im.thumbnail((220, 220)); return im
    except Exception: return None
def par(it):
    h, v = it; f = v["fotos_originais"]; return h, v, [baixar(u) for u in f[:2]]
with cf.ThreadPoolExecutor(16) as ex: pares = list(ex.map(par, itens))
W, Hc = 480, 300
for i in range(0, len(pares), 16):
    fo = Image.new("RGB", (W * 4, Hc * 4), "white"); d = ImageDraw.Draw(fo)
    for j, (h, v, ims) in enumerate(pares[i:i + 16]):
        x, y = (j % 4) * W, (j // 4) * Hc
        d.rectangle([x + 2, y + 2, x + W - 2, y + Hc - 2], outline=(200, 200, 200))
        d.text((x + 8, y + 6), f"#{i + j + 1}  {v.get('marca') or ''}", fill=(150, 0, 60), font=font)
        tit = v.get("titulo") or h
        for k, l in enumerate(textwrap.wrap(tit, 60)[:3]): d.text((x + 8, y + 22 + k * 15), l, fill=(0, 0, 0), font=font)
        for k, im in enumerate(ims):
            if im: fo.paste(im, (x + 8 + k * 235, y + 72))
            else: d.text((x + 60 + k * 235, y + 170), "NÃO ABRE", fill=(200, 0, 0), font=font)
    fo.save(OUT / f"atual_{i // 16 + 1:03d}.jpg", quality=75)
(A / (os.environ.get("SAIDA", "atuais") + "_indice.json")).write_text(json.dumps({str(i + 1): h for i, (h, *_ ) in enumerate(pares)}, indent=0))
print(len(pares))
