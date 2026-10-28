"""Aplica ajustes de fotos atuais (ajustes_atuais.json) e grava as imagens tratadas em site/fotos/ (GitHub Pages).
Cada foto: URL (mantém), ou {url, corte:[x0,y0,x1,y1], brancos:[[x0,y0,x1,y1,("cor")]]}, {grade:[urls]} (monta 2x2 do kit),
ou {loja: página de produto Shopify} (usa a 1ª foto). Saída: ajustes_saida.json {handle: [urls finais]} e ajustes_preview.jpg."""
import io, json
from pathlib import Path
import requests
from PIL import Image, ImageDraw
A = Path(__file__).resolve().parent; R = A.parent.parent
OUT = R / "site/fotos"; OUT.mkdir(parents=True, exist_ok=True)
BASE = "https://brunotae.github.io/omg-erp/site/fotos/"; H = {"User-Agent": "Mozilla/5.0 (Macintosh) Chrome/126"}
def abrir(u): return Image.open(io.BytesIO(requests.get(u, timeout=30, headers=H).content)).convert("RGB")
def quadrado(im):
    w, h = im.size; l = max(w, h); f = Image.new("RGB", (l, l), "white"); f.paste(im, ((l - w) // 2, (l - h) // 2)); return f
S = json.loads((A / "ajustes_atuais.json").read_text()); saida = {}; prev = []
for h, s in S.items():
    lista = []
    for k, f in enumerate(s["fotos"]):
        if isinstance(f, str): lista.append(f); continue
        try:
            if "loja" in f:
                j = requests.get(f["loja"] + ".json", headers=H, timeout=20).json()["product"]; im = abrir(j["images"][0]["src"])
            elif "grade" in f:
                ims = [abrir(u) for u in f["grade"]]; L = 600; im = Image.new("RGB", (2 * L, 2 * L), "white")
                for i, x in enumerate(ims): x = quadrado(x); x.thumbnail((L, L)); im.paste(x, ((i % 2) * L, (i // 2) * L))
            else:
                im = abrir(f["url"]); W, Hh = im.size; d = ImageDraw.Draw(im)
                for r in f.get("brancos", []):
                    x0, y0, x1, y1 = r[:4]
                    if len(r) > 4 and r[4] == "cor":
                        px = im.load()
                        for yy in range(int(y0 * Hh), int(y1 * Hh)):
                            for xx in range(int(x0 * W), int(x1 * W)):
                                a, b, c = px[xx, yy]
                                if max(a, b, c) - min(a, b, c) > 25 or max(a, b, c) < 215: px[xx, yy] = (255, 255, 255)
                    else: d.rectangle([x0 * W, y0 * Hh, x1 * W, y1 * Hh], fill=(255, 255, 255))
                if f.get("corte"):
                    x0, y0, x1, y1 = f["corte"]; im = im.crop((int(x0 * W), int(y0 * Hh), int(x1 * W), int(y1 * Hh)))
            im = quadrado(im); nome = f"{h}-a{k + 1}.jpg"; im.save(OUT / nome, quality=90); lista.append(BASE + nome)
            t = im.copy(); t.thumbnail((300, 300)); prev.append(t)
        except Exception as e:
            print("ERRO", h, k, e)
    saida[h] = lista
(A / "ajustes_saida.json").write_text(json.dumps(saida, indent=1))
if prev:
    f = Image.new("RGB", (310 * min(6, len(prev)), 310 * ((len(prev) + 5) // 6)), "white")
    for i, t in enumerate(prev): f.paste(t, ((i % 6) * 310, (i // 6) * 310))
    f.save(A / "ajustes_preview.jpg", quality=80)
