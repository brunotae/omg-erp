# Baixa candidatos de logo do site oficial de cada marca (roda no GitHub Actions, que tem internet).
import csv, json, os, re, urllib.request, urllib.parse, time
from bs4 import BeautifulSoup
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36", "Accept-Language": "en,ko;q=0.8"}
def get(url, timeout=25):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.geturl(), r.headers.get("content-type", ""), r.read()
base = "tools/marcas/logos"; os.makedirs(base, exist_ok=True)
res = {}
for row in csv.DictReader(open("tools/marcas/sites.csv", encoding="utf-8"), delimiter="|"):
    slug = row["slug"]; out = dict(marca=row["marca"], tentativas=[], site=None, final=None, candidatos=[])
    for d in [s.strip() for s in row["sites"].split(",") if s.strip()]:
        try:
            final, ct, html = get("https://" + d + "/")
        except Exception as e:
            out["tentativas"].append(f"{d}: {type(e).__name__}"); continue
        out["site"], out["final"] = d, final
        soup = BeautifulSoup(html, "html.parser")
        cands = []
        def add(kind, url):
            if not url: return
            url = url.split(" ")[0]
            if url.startswith("data:"): return
            u = urllib.parse.urljoin(final, url)
            if u not in [c[1] for c in cands]: cands.append((kind, u))
        hdr = soup.find("header") or soup
        for scope in (hdr, soup):
            for img in scope.find_all("img"):
                attrs = " ".join([str(img.get(k, "")) for k in ("class", "id", "alt", "src", "data-src")]).lower()
                par = " ".join(str(p.get("class", "")) + str(p.get("id", "")) for p in img.parents if p.name in ("a", "div", "h1", "span"))[:300].lower()
                if "logo" in attrs or "logo" in par:
                    add("img", img.get("src") or img.get("data-src") or (img.get("srcset") or "").split(",")[0])
            if len(cands) >= 2: break
        svgs = []
        for el in soup.select("[class*=logo], [id*=logo]"):
            s = el.find("svg") if el.name != "svg" else el
            if s and len(str(s)) > 200: svgs.append(str(s))
            if len(svgs) >= 2: break
        for m in soup.find_all("meta", attrs={"property": "og:image"}): add("og", m.get("content"))
        for l in soup.find_all("link"):
            rel = " ".join(l.get("rel", [])).lower()
            if "apple-touch-icon" in rel: add("apple", l.get("href"))
        os.makedirs(f"{base}/{slug}", exist_ok=True)
        n = 0
        for kind, u in cands[:5]:
            try:
                fu, ct2, data = get(u)
                ext = "svg" if "svg" in ct2 or u.lower().split("?")[0].endswith(".svg") else ("png" if "png" in ct2 else "webp" if "webp" in ct2 else "jpg" if "jp" in ct2 else u.split("?")[0].rsplit(".", 1)[-1][:4])
                fn = f"{base}/{slug}/{n}_{kind}.{ext}"; open(fn, "wb").write(data); n += 1
                out["candidatos"].append(dict(arquivo=fn, tipo=kind, url=u, bytes=len(data)))
            except Exception as e:
                out["candidatos"].append(dict(arquivo=None, tipo=kind, url=u, erro=type(e).__name__))
        for i, s in enumerate(svgs):
            fn = f"{base}/{slug}/svg{i}.svg"; open(fn, "w", encoding="utf-8").write(s if "xmlns" in s else s.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"', 1))
            out["candidatos"].append(dict(arquivo=fn, tipo="inline-svg", url=final))
        break
    res[slug] = out; print(slug, out["site"], len(out["candidatos"]), flush=True)
    time.sleep(0.3)
json.dump(res, open("tools/marcas/candidatos.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
