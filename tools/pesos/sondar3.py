"""Sonda 3: abre a página do Zero Pore Pad 2.0 na YesStyle e procura peso/dimensões no texto e nos dados estruturados."""
import json, re, urllib.request
from pathlib import Path
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
def get(u):
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA, "Accept-Language": "en-US"}), timeout=25) as r:
            return r.status, r.read(2_000_000).decode("utf-8", "replace")
    except Exception as e:  # noqa: BLE001
        return 0, str(e)
res = {}
for nome, u in {"yesstyle": "https://www.yesstyle.com/en/medicube-zero-pore-pad-2-0-70-pads/info.html/pid.1135111653",
                "jolse_busca_json": "https://jolse.com/exec/front/Product/Search/?keyword=medicube%20zero%20pore%20pad"}.items():
    st, h = get(u)
    t = re.sub(r"<script(?![^>]*ld\+json).*?</script>|<style.*?</style>", " ", h, flags=re.S | re.I)
    t = re.sub(r"<[^>]+>", " ", t); t = re.sub(r"\s+", " ", t)
    tr = [t[max(0, m.start()-80): m.end()+160] for m in re.finditer(r"(weight|dimension|specification|net wt|volume)", t, re.I)][:8]
    ld = re.findall(r'<script[^>]*ld\+json[^>]*>(.*?)</script>', h, re.S)
    res[nome] = {"status": st, "tam": len(h), "trechos": tr, "ld_json": [x[:600] for x in ld[:2]]}
Path(__file__).with_name("sondagem3.json").write_text(json.dumps(res, ensure_ascii=False, indent=1))
