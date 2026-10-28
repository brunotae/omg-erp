"""Gera folhas de conferência visual: à esquerda a foto atual do nosso site (export), à direita a 1ª foto oficial.
Também testa se as fotos originais ainda abrem (para poder restaurar).
Uso (no robô do GitHub): python3 tools/fotos/folhas.py → tools/fotos/folhas/*.jpg e tools/fotos/originais_vivas.json
"""
import io, json, sys, textwrap, concurrent.futures as cf
from pathlib import Path
import requests
from PIL import Image, ImageDraw, ImageFont

A = Path(__file__).resolve().parent
import os
D = json.loads((A / os.environ.get("DECISAO", "decisao.json")).read_text())
OUT = A / os.environ.get("SAIDA", "folhas"); OUT.mkdir(exist_ok=True)
H = {"User-Agent": "Mozilla/5.0 (OMG conferencia de fotos)"}

def baixar(u, lado=260):
    try:
        r = requests.get(u, headers=H, timeout=25)
        if r.status_code != 200: return None
        im = Image.open(io.BytesIO(r.content)).convert("RGB")
        im.thumbnail((lado, lado)); return im
    except Exception:
        return None

def vivo(u):
    try:
        r = requests.get(u, headers=H, timeout=20, stream=True); ok = r.status_code == 200; r.close(); return ok
    except Exception:
        return False

# 1) originais ainda abrem? (só na primeira vez)
import os
if os.environ.get("VIVAS") == "1" and not (A / "originais_vivas.json").exists():
  todas = {h: v.get("fotos_originais", [])[:1] for h, v in D.items()}
  with cf.ThreadPoolExecutor(16) as ex:
    res = dict(zip(todas, ex.map(lambda us: bool(us) and vivo(us[0]), todas.values())))
  (A / "originais_vivas.json").write_text(json.dumps(res, indent=0))

# 2) folhas dos confirmados (16 pares por folha); "extras" = já aplicados que precisam de olhar à parte
import shutil
shutil.rmtree(OUT); OUT.mkdir()
EX = json.loads((A / "extras.json").read_text()) if (A / "extras.json").exists() and not os.environ.get("SAIDA") else {}
ok = [(h, v) for h, v in sorted(D.items()) if v["ok"]] + sorted(EX.items())
font = ImageFont.load_default(size=13) if hasattr(ImageFont, "load_default") else None
def par(item):
    h, v = item
    a = baixar(v["fotos_originais"][0], 220) if v.get("fotos_originais") else None
    b = baixar(v["fotos"][0], 220) if v.get("fotos") else None
    return h, v, a, b
with cf.ThreadPoolExecutor(16) as ex:
    pares = list(ex.map(par, ok))
W, Hc = 480, 300
for i in range(0, len(pares), 16):
    folha = Image.new("RGB", (W * 4, Hc * 4), "white"); d = ImageDraw.Draw(folha)
    for j, (h, v, a, b) in enumerate(pares[i:i + 16]):
        x, y = (j % 4) * W, (j // 4) * Hc
        d.rectangle([x + 2, y + 2, x + W - 2, y + Hc - 2], outline=(200, 200, 200))
        d.text((x + 8, y + 6), f"#{i + j + 1}  {v['marca']}", fill=(150, 0, 60), font=font)
        for k, linha in enumerate(textwrap.wrap(v["titulo"], 60)[:2]):
            d.text((x + 8, y + 22 + k * 15), linha, fill=(0, 0, 0), font=font)
        d.text((x + 8, y + 52), "oficial: " + v["oficial"][:52], fill=(0, 90, 0), font=font)
        for k, im in enumerate([a, b]):
            bx = x + 8 + k * 235
            if im: folha.paste(im, (bx, y + 72))
            else: d.text((bx + 60, y + 170), "SEM FOTO", fill=(200, 0, 0), font=font)
        d.text((x + 8, y + Hc - 18), "nosso site (antes)", fill=(90, 90, 90), font=font)
        d.text((x + 243, y + Hc - 18), "oficial (novo)", fill=(90, 90, 90), font=font)
    folha.save(OUT / f"folha_{i // 16 + 1:03d}.jpg", quality=75)
idx = {f"{i + 1}": h for i, (h, *_ ) in enumerate(pares)}
(A / (os.environ.get("SAIDA", "folhas") + "_indice.json")).write_text(json.dumps(idx, indent=0))
print("folhas:", (len(pares) + 15) // 16)
