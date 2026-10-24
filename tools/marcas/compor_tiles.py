# Compõe os quadrados das marcas (800x800 WebP):
#  A) marcas com catálogo oficial: mosaico de 3 fotos oficiais + véu + logo num cartão branco
#  C) demais: padrão bojagi OMG + logo/nome num cartão branco
import json, os, random, csv
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps, ImageChops
R = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
M = json.load(open(f"{R}/site/marcas/marcas.json", encoding="utf-8"))
CAND = json.load(open(f"{R}/tools/marcas/fundos_candidatos.json", encoding="utf-8"))
ESCOLHA = {  # índices das fotos escolhidas (revisadas à mão: só packshots, sem pessoas nem selos de outras lojas)
 "anua":[0,1,2], "arencia":[0,7,5], "beauty-of-joseon":[0,6,4], "biodance":[3,1,5], "celimax":[1,2,3],
 "cell-fusion-c":[0,1,3], "centellian-24":[1,5,6], "cosrx":[0,3,5], "dasique":[0,1,6], "dr-melaxin":[2,3,5],
 "lador":[0,1,3], "medicube":[1,2,0], "mixsoon":[2,3,4], "round-lab":[3,6,4], "skin1004":[0,3,4],
 "tirtir":[0,2,7], "torriden":[5,6,2]}
S = 800
CREME=(255,249,246); BEBE=(253,228,236); CHICLE=(244,143,177); FRAMB=(217,87,127); PRI=(184,61,102); AMEIXA=(74,38,56); MENTA=(158,223,196)
FONT = "/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf"
os.makedirs(f"{R}/site/marcas/tiles", exist_ok=True)

def cover(im, w, h):
    return ImageOps.fit(im.convert("RGB"), (w, h), Image.LANCZOS, centering=(0.5, 0.5))

def logo_recortado(slug):
    im = Image.open(f"{R}/site/marcas/logos/{slug}.png").convert("RGB")
    bg = Image.new("RGB", im.size, im.getpixel((3, 3)))
    diff = ImageChops.difference(im, bg).convert("L").point(lambda p: 255 if p > 18 else 0)
    box = diff.getbbox()
    return im.crop(box) if box else im, im.getpixel((3, 3))

def cartao(base, slug, nome, tipo):
    cw, ch = 560, 240
    card = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    sh = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(sh); x0, y0 = (S-cw)//2, (S-ch)//2
    d.rounded_rectangle([x0, y0+10, x0+cw, y0+ch+10], 36, fill=(74, 38, 56, 50))
    base.alpha_composite(sh.filter(ImageFilter.GaussianBlur(14)))
    d = ImageDraw.Draw(base)
    d.rounded_rectangle([x0, y0, x0+cw, y0+ch], 36, fill=(255, 255, 255, 255))
    if tipo == "logo":
        lg, _ = logo_recortado(slug)
        lg.thumbnail((cw-90, ch-80), Image.LANCZOS)
        if lg.width < 220 and lg.height < ch-80:  # logos pequenos demais: aumenta
            f = min((cw-90)/lg.width, (ch-80)/lg.height); lg = lg.resize((int(lg.width*f), int(lg.height*f)), Image.LANCZOS)
        # fundo do logo é branco/claro: compõe com multiply para sumir o retângulo
        tile = Image.new("RGB", (cw, ch), (255, 255, 255)); tile.paste(lg, ((cw-lg.width)//2, (ch-lg.height)//2))
        reg = base.crop((x0, y0, x0+cw, y0+ch)).convert("RGB")
        reg = ImageChops.multiply(reg, tile)
        m = Image.new("L", (cw, ch), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, cw-1, ch-1], 36, fill=255)
        base.paste(reg.convert("RGBA"), (x0, y0), m)
    else:
        size = 76
        while True:
            f = ImageFont.truetype(FONT, size); bb = d.textbbox((0, 0), nome, font=f)
            if bb[2]-bb[0] <= cw-80 or size <= 26: break
            size -= 2
        d.text((S//2, S//2), nome, font=f, fill=AMEIXA, anchor="mm")

def estrela(d, cx, cy, r, cor):
    pts = []
    import math
    for i in range(8):
        a = math.pi/4*i - math.pi/2; rr = r if i % 2 == 0 else r*0.28
        pts.append((cx+rr*math.cos(a), cy+rr*math.sin(a)))
    d.polygon(pts, fill=cor)

def bojagi(seed):
    rnd = random.Random(seed)
    pal = [BEBE, (255, 214, 226), (203, 239, 224), (250, 196, 214), (226, 245, 236), (246, 170, 196), (255, 236, 242)]
    rnd.shuffle(pal)
    im = Image.new("RGB", (S, S), (255, 255, 255)); d = ImageDraw.Draw(im)
    def parte(x, y, w, h, prof):
        if prof > 3 or (w < 230 and h < 230) or (prof > 1 and rnd.random() < 0.25):
            g = 6; d.rectangle([x+g, y+g, x+w-g, y+h-g], fill=rnd.choice(pal)); return
        if w >= h:
            c = int(w*rnd.uniform(0.32, 0.68)); parte(x, y, c, h, prof+1); parte(x+c, y, w-c, h, prof+1)
        else:
            c = int(h*rnd.uniform(0.32, 0.68)); parte(x, y, w, c, prof+1); parte(x, y+c, w, h-c, prof+1)
    parte(0, 0, S, S, 0)
    for _ in range(5):
        estrela(d, rnd.randint(40, S-40), rnd.choice([rnd.randint(30, 200), rnd.randint(600, 770)]), rnd.randint(12, 22), (255, 255, 255))
    return im

fontes = []
for m in M:
    slug, nome, tipo = m["slug"], m["marca"], m["tipo"]
    if slug in ESCOLHA and slug in CAND:
        fotos = [Image.open(f"{R}/tools/marcas/fundos/{slug}/{i}.jpg") for i in ESCOLHA[slug]]
        bg = Image.new("RGB", (S, S), (255, 255, 255))
        g = 4
        bg.paste(cover(fotos[0], S//2-g//2, S), (0, 0))
        bg.paste(cover(fotos[1], S//2-g//2, S//2-g//2), (S//2+g//2, 0))
        bg.paste(cover(fotos[2], S//2-g//2, S//2-g//2), (S//2+g//2, S//2+g//2))
        base = bg.convert("RGBA")
        base.alpha_composite(Image.new("RGBA", (S, S), CREME+(70,)))
        estilo = "foto"
        fontes.append((nome, CAND[slug]["site"], " | ".join(CAND[slug]["candidatos"][i]["url"] for i in ESCOLHA[slug])))
    else:
        base = bojagi(slug).convert("RGBA")
        base.alpha_composite(Image.new("RGBA", (S, S), CREME+(70,)))
        estilo = "padrao"
    cartao(base, slug, nome, tipo)
    out = f"{R}/site/marcas/tiles/{slug}.webp"
    base.convert("RGB").save(out, "WEBP", quality=80, method=6)
    m["tile"] = estilo
json.dump(M, open(f"{R}/site/marcas/marcas.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
with open(f"{R}/site/marcas/fontes_fundos.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f); w.writerow(["marca", "site oficial", "fotos usadas no fundo"]); w.writerows(fontes)
print("ok", sum(1 for m in M if m["tile"] == "foto"), "foto,", sum(1 for m in M if m["tile"] == "padrao"), "padrão")
