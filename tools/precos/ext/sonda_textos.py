# Sonda: baixa páginas e guarda os trechos com desconto/cupom (off, code, coupon, %) — para conferir promoções de lojas oficiais
import urllib.request, urllib.error, re, json, os, time, gzip, html
UA = {"user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129 Safari/537.36"}
URLS = [u for u in os.environ.get("URLS", "").split(",") if u]; NOME = os.environ.get("NOME", "sonda")
out = {}
for u in URLS:
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60); b = r.read()
        if r.headers.get("content-encoding") == "gzip": b = gzip.decompress(b)
        t = b.decode("utf-8", "replace")
        txt = html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " | ", re.sub(r"(?s)<(script|style)[^>]*>.*?</\1>", " ", t))))
        tr = sorted(set(m.group(0) for m in re.finditer(r"[^|]{0,120}(?i:\b\d{1,2}\s?% ?off\b|coupon|promo code|use code|code:|discount)[^|]{0,120}", txt)))
        out[u] = tr[:40]
    except Exception as e: out[u] = str(e)[:200]
    time.sleep(3)
os.makedirs("tools/precos/ext/dados", exist_ok=True)
json.dump(out, open(f"tools/precos/ext/dados/textos_{NOME}.json", "w"), ensure_ascii=False, indent=1); print(json.dumps(out, ensure_ascii=False)[:3000])
