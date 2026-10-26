"""Baixa as fotos oficiais da amostra (tools/pesos/amostra_fotos.json) para conferir o formato das embalagens."""
import json, urllib.request
from pathlib import Path
A = Path(__file__).resolve().parent
d = A / "fotos_amostra"; d.mkdir(exist_ok=True)
for a in json.loads((A / "amostra_fotos.json").read_text()):
    for i, u in enumerate(a["fotos"]):
        try:
            req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"})
            (d / f"{a['sku']}_{i}.jpg").write_bytes(urllib.request.urlopen(req, timeout=20).read())
        except Exception as e:  # noqa: BLE001
            print("falhou", u, e)
