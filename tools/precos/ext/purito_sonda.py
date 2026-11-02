# Purito: texto e fotos da página oficial dos produtos novos
import urllib.request, gzip, os, re, html, json
UA = {"user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129 Safari/537.36", "accept-language": "en-US,en;q=0.9"}
def get(u):
    r = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=90); b = r.read()
    if r.headers.get("content-encoding") == "gzip" or b[:2] == b"\x1f\x8b": b = gzip.decompress(b)
    return b.decode("utf-8", "replace")
txt = lambda s: re.sub(r"\s+", " ", html.unescape(re.sub(r"<(script|style)[^>]*>.*?</\1>|<[^>]+>", " ", s, flags=re.S))).strip()
out = {}
for h in ["azelaic-acid-10-kojic-tea-tree-serum", "acne-intensive-treatment-patch", "acne-intensive-patch", "sun-day-adventure-sunscreen-spf-50", "mighty-bamboo-panthenol-cream-mist", "multi-pdrn-collagen-egf-serum", "hypochlorous-acid-rescue-spray"]:
    t = get(f"https://purito.com/product/{h}/")
    i = t.find("<main"); body = t[i:] if i >= 0 else t
    imgs = list(dict.fromkeys(re.findall(r'(https://purito\.com/wp-content/uploads/[^"\'\s)]+\.(?:jpg|jpeg|png|webp))', body)))
    out[h] = {"texto": txt(body)[:6000], "fotos": imgs[:30]}
json.dump(out, open("tools/precos/ext/dados/purito/novos.json", "w"), indent=1, ensure_ascii=False); print({k: len(v["fotos"]) for k, v in out.items()})
