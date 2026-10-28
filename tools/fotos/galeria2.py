"""Galeria genérica: tools/fotos/galeria2_pedido.json {nome: [urls]} → tools/fotos/galeria2/<nome>.jpg (fotos numeradas a partir de 1).
Também busca em lojas Shopify de K-beauty: galeria2_busca.json {nome: "texto"} → candidatos com todas as fotos."""
import io, json, re, concurrent.futures as cf, urllib.parse
from pathlib import Path
import requests
from PIL import Image, ImageDraw, ImageFont
A = Path(__file__).resolve().parent
OUT = A / "galeria2"; OUT.mkdir(exist_ok=True)
font = ImageFont.load_default(size=16); H = {"User-Agent": "Mozilla/5.0 (Macintosh) Chrome/126"}
def baixar(u):
    try:
        im = Image.open(io.BytesIO(requests.get(u, timeout=25, headers=H).content)).convert("RGB"); im.thumbnail((300, 300)); return im
    except Exception: return None
def folha(nome, titulo, urls):
    with cf.ThreadPoolExecutor(8) as ex: ims = list(ex.map(baixar, urls[:16]))
    W = 4; rows = max(1, (len(ims) + W - 1) // W)
    f = Image.new("RGB", (310 * W, 36 + 320 * rows), "white"); d = ImageDraw.Draw(f)
    d.text((6, 8), titulo[:150], fill=(150, 0, 60), font=font)
    for i, im in enumerate(ims):
        x, y = (i % W) * 310, 36 + (i // W) * 320
        d.text((x + 6, y), f"{i + 1}", fill=(0, 0, 0), font=font)
        if im: f.paste(im, (x + 6, y + 18))
    f.save(OUT / f"{nome}.jpg", quality=72)
P = {} if (A / "so_busca").exists() else json.loads((A / "galeria2_pedido.json").read_text()) if (A / "galeria2_pedido.json").exists() else {}
for n, us in P.items(): folha(n, n, us)
B = json.loads((A / "galeria2_busca.json").read_text()) if (A / "galeria2_busca.json").exists() else {}
LOJAS = ["www.dodoskin.com", "sokoglam.com", "ohlolly.com", "www.kollab.com.br", "beautyofjoseon.com", "www.stylevana.com", "koreanskincare.nl", "kbeautyaddiction.co.uk", "www.beautytap.com", "seoulbeautyclub.com", "kbeautystore.com"]
achados = {}
for n, q in B.items():
    achados[n] = []
    for loja in LOJAS:
        try:
            r = requests.get(f"https://{loja}/search/suggest.json?q={urllib.parse.quote(q)}&resources[type]=product&resources[limit]=6", headers=H, timeout=20)
            for p in r.json().get("resources", {}).get("results", {}).get("products", []):
                h = p.get("handle"); j = requests.get(f"https://{loja}/products/{h}.json", headers=H, timeout=20).json()["product"]
                achados[n].append({"loja": loja, "titulo": j["title"], "variantes": [v["title"] for v in j["variants"]][:6], "fotos": [i["src"] for i in j["images"]][:12]})
        except Exception as e:
            pass
    for k, a in enumerate(achados[n][:8]):
        folha(f"{n}__{k + 1}", f"{a['loja']} | {a['titulo']} | {a['variantes']}", a["fotos"])
D = json.loads((A / "galeria2_direto.json").read_text()) if (A / "galeria2_direto.json").exists() else {}
for n, url in D.items():
    try:
        j = requests.get(url.rstrip("/") + ".json", headers=H, timeout=20).json()["product"]
        achados[n] = [{"loja": url, "titulo": j["title"], "variantes": [v["title"] for v in j["variants"]], "fotos": [i["src"] for i in j["images"]]}]
        folha(n, url + " | " + j["title"], achados[n][0]["fotos"])
    except Exception as e:
        achados[n] = [{"erro": str(e)[:200]}]
(A / "galeria2_achados.json").write_text(json.dumps(achados, indent=1, ensure_ascii=False))
