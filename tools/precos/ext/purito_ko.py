# Nome oficial em coreano de cada produto da Purito (purito.com/ko/product/<handle>/)
import urllib.request, re, json, gzip, time, html
UA = {"user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129 Safari/537.36", "accept-language": "ko-KR,ko;q=0.9"}
def get(u):
    r = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=90); b = r.read()
    if r.headers.get("content-encoding") == "gzip" or b[:2] == b"\x1f\x8b": b = gzip.decompress(b)
    return b.decode("utf-8", "replace")
d = json.load(open("tools/precos/ext/dados/purito.json"))
for p in d["produtos"]:
    try:
        t = get(f"https://purito.com/ko/product/{p['handle']}/")
        og = re.search(r'<meta property="og:title" content="([^"]+)"', t); tt = re.search(r"<title>([^<]+)</title>", t)
        h1 = re.search(r"<h1[^>]*>(.*?)</h1>", t, re.S)
        p["nome_ko"] = html.unescape(re.sub(r"<[^>]+>", " ", (h1.group(1) if h1 else (og.group(1) if og else tt.group(1))))).split(" - ")[0].split("|")[0].strip()
        p["nome_ko"] = re.sub(r"\s+", " ", p["nome_ko"])
    except Exception as e: p["nome_ko_erro"] = str(e)[:100]
    time.sleep(1)
json.dump(d, open("tools/precos/ext/dados/purito.json", "w"), indent=1, ensure_ascii=False)
print(sum(1 for p in d["produtos"] if p.get("nome_ko")))
