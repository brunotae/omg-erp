# Baixa fotos oficiais de produtos (candidatas a fundo dos quadrados de marca). Roda no GitHub Actions.
import json, os, io, urllib.request
from PIL import Image
C = json.load(open("tools/marcas/fundos_candidatos.json", encoding="utf-8"))
for slug, d in C.items():
    os.makedirs(f"tools/marcas/fundos/{slug}", exist_ok=True)
    for i, c in enumerate(d["candidatos"]):
        url = c["url"]
        if url.startswith("//"): url = "https:" + url
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (OMG brand tiles)"})
            data = urllib.request.urlopen(req, timeout=30).read()
            im = Image.open(io.BytesIO(data)).convert("RGBA")
            bg = Image.new("RGBA", im.size, (255, 255, 255, 255)); bg.alpha_composite(im); im = bg.convert("RGB")
            im.thumbnail((800, 800))
            im.save(f"tools/marcas/fundos/{slug}/{i}.jpg", quality=85)
            print(slug, i, "ok", im.size, flush=True)
        except Exception as e:
            print(slug, i, "erro", e, flush=True)
