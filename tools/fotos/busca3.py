"""Busca fotos para produtos sem foto boa: busca3_pedido.json {nome: {"titulo":..,"diretos":[urls], "busca":"texto"}}
→ busca3/<nome>.jpg (até 4 candidatos, 8 fotos cada) e busca3_achados.json. Conferência visual é obrigatória antes de usar."""
import io, json, urllib.parse, concurrent.futures as cf
from pathlib import Path
import requests
from PIL import Image, ImageDraw, ImageFont
A = Path(__file__).resolve().parent; OUT = A / "busca3"; OUT.mkdir(exist_ok=True)
font = ImageFont.load_default(size=15); H = {"User-Agent": "Mozilla/5.0 (Macintosh) Chrome/126"}
LOJAS = ["www.dodoskin.com", "sokoglam.com", "ohlolly.com", "olivekollection.com", "www.stylevana.com", "koreanskincare.nl", "kbeautyaddiction.co.uk", "seoulbeautyclub.com", "kbeautystore.com", "www.mirai-skin.com", "glamglobal.co.uk", "wcosmetics.com.au"]
def pj(url):
    try:
        r = requests.get(url.rstrip("/") + ".json", headers=H, timeout=15)
        if r.status_code != 200: return None
        j = r.json()["product"]; return {"url": url, "titulo": j["title"], "variantes": [v["title"] for v in j["variants"]][:6], "fotos": [i["src"] for i in j["images"]][:12]}
    except Exception: return None
def busca(q):
    res = []
    for loja in LOJAS:
        try:
            r = requests.get(f"https://{loja}/search/suggest.json?q={urllib.parse.quote(q)}&resources[type]=product&resources[limit]=3", headers=H, timeout=15)
            for p in r.json().get("resources", {}).get("results", {}).get("products", [])[:2]:
                c = pj(f"https://{loja}/products/{p['handle']}")
                if c: res.append(c)
        except Exception: pass
        if len(res) >= 4: break
    return res
def baixar(u):
    try:
        im = Image.open(io.BytesIO(requests.get(u, timeout=20, headers=H).content)).convert("RGB"); im.thumbnail((200, 200)); return im
    except Exception: return None
def item(kv):
    n, s = kv; cands = []
    for u in s.get("diretos", []):
        c = pj(u)
        if c: cands.append(c); break
    if len(cands) == 0 and s.get("busca"): cands += busca(s["busca"])
    cands = cands[:4]
    f = Image.new("RGB", (8 * 210, 30 + max(1, len(cands)) * 250), "white"); d = ImageDraw.Draw(f)
    d.text((6, 6), f"{n} | NOSSO: {s.get('titulo','')}", fill=(150, 0, 60), font=font)
    for k, c in enumerate(cands):
        y = 30 + k * 250; d.text((6, y), f"[{k + 1}] {c['url']} | {c['titulo']} | {c['variantes']}"[:200], fill=(0, 0, 120), font=font)
        for i, im in enumerate(map(baixar, c["fotos"][:8])):
            d.text((6 + i * 210, y + 20), str(i + 1), fill=(255, 0, 0), font=font)
            if im: f.paste(im, (6 + i * 210, y + 38))
    if not cands: d.text((6, 60), "NADA ENCONTRADO", fill=(200, 0, 0), font=font)
    f.save(OUT / f"{n}.jpg", quality=70); return n, cands
P = json.loads((A / "busca3_pedido.json").read_text())
with cf.ThreadPoolExecutor(8) as ex: R = dict(ex.map(item, P.items()))
(A / "busca3_achados.json").write_text(json.dumps(R, indent=1, ensure_ascii=False))
print(sum(1 for v in R.values() if v), "de", len(R))
