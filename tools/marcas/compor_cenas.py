# Cenas das marcas (estilo editorial, 16:9): produtos oficiais sobre pedestais, fundo em degradê
# no tom dos produtos, logo pequeno no canto superior esquerdo. Saída: site/marcas/cenas/<slug>.webp
import json, os, sys, math, random, colorsys, glob
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops, ImageEnhance
R = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, f"{R}/tools/marcas")
_src = open(f"{R}/tools/marcas/compor_tiles.py", encoding="utf-8").read()
_i = _src.index("ESCOLHA = {"); _j = _src.index("\nS = ", _i)
exec(_src[_i:_j])  # define ESCOLHA (índices revisados: packshots sem pessoas nem selos)
# fotos escolhidas para as cenas (recortes rembg revisados à mão: produto em pé, sem selo/promo/pessoa)
CENA = {"anua": [1, 0, 6], "arencia": [6, 7, 5], "aromatica": [0, 6, 7], "banila-co": [2, 1],
 "beauty-of-joseon": [0, 6, 1], "biodance": [7, 2, 3], "celimax": [1, 2, 3], "cell-fusion-c": [1, 6, 0],
 "centellian-24": [6, 2], "cosrx": [1, 7, 0], "dalba": [5, 3, 7], "dasique": [0, 6, 1], "dr-forhair": [1, 2, 5],
 "dr-melaxin": [2, 3, 5], "dr-reju-all": [2, 1], "ilso": [5, 6, 7], "kaine": [0, 4, 6], "lador": [1, 3, 6],
 "manyo": [1], "medicube": [6, 1, 7], "mediheal": [4, 5], "mise-en-scene": [4, 6, 7], "mixsoon": [2, 3, 4],
 "purcell": [0, 1, 2], "round-lab": [2, 4, 3], "skin1004": [1, 0, 4], "some-by-mi": [7, 5], "tirtir": [1, 2, 7],
 "torriden": [6, 5, 2], "wellage": [0, 2, 6], "another-face": [6], "ongredients": [7]}
M = json.load(open(f"{R}/site/marcas/marcas.json", encoding="utf-8"))
W, H = 1600, 900
OUTW, OUTH = 1200, 675
FB = "/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf"
FM = "/usr/share/fonts/truetype/google-fonts/Poppins-Medium.ttf"
AMEIXA = (74, 38, 56)
# paletas OMG (topo, base) para marcas sem cor dominante clara / decorativas
PALETAS = [((255, 241, 245), (250, 214, 226)),  # rosa bebê
           ((236, 249, 243), (199, 236, 220)),  # menta
           ((255, 246, 236), (251, 222, 198)),  # pêssego
           ((243, 241, 252), (219, 212, 243)),  # lavanda
           ((238, 246, 253), (204, 226, 246)),  # azul claro
           ((255, 249, 240), (241, 228, 207))]  # creme/areia
os.makedirs(f"{R}/site/marcas/cenas", exist_ok=True)

def mix(a, b, t):
    return tuple(int(round(a[i] * (1 - t) + b[i] * t)) for i in range(3))

def recorte(slug, i, crop=None):
    p = f"{R}/tools/marcas/recortes/{slug}/{i}.png"
    if os.path.exists(p) and not crop:
        return Image.open(p).convert("RGBA")
    from recorte import recortar
    im = Image.open(f"{R}/tools/marcas/fundos/{slug}/{i}.jpg")
    if crop:
        w, h = im.size; im = im.crop((int(crop[0]*w), int(crop[1]*h), int(crop[2]*w), int(crop[3]*h)))
        if os.path.exists(p):  # recorte rembg da imagem inteira não serve com corte; usa local
            pass
    cut, info = recortar(im)
    return cut

def cor_dominante(imgs):
    px = []
    for im in imgs:
        a = np.asarray(im.resize((80, int(80 * im.height / max(1, im.width))) if im.width else (80, 80)))
        a = a.reshape(-1, 4); a = a[a[:, 3] > 200][:, :3]
        px.append(a)
    if not px: return None
    a = np.concatenate(px).astype(float) / 255
    if len(a) < 50: return None
    hsv = np.array([colorsys.rgb_to_hsv(*c) for c in a[::3]])
    sat = (hsv[:, 1] > 0.25) & (hsv[:, 2] > 0.25)
    if sat.mean() < 0.06: return None  # produtos brancos/pretos
    hs = hsv[sat]
    # matiz dominante por histograma circular
    hist, ed = np.histogram(hs[:, 0], bins=24, range=(0, 1), weights=hs[:, 1])
    k = int(np.argmax(hist)); hue = (ed[k] + ed[k + 1]) / 2
    return hue

def paleta(hue, seed):
    if hue is None:
        return PALETAS[seed % len(PALETAS)]
    top = colorsys.hls_to_rgb(hue, 0.955, 0.75)
    bot = colorsys.hls_to_rgb(hue, 0.86, 0.62)
    return tuple(int(c * 255) for c in top), tuple(int(c * 255) for c in bot)

def fundo(top, bot, seed):
    rnd = random.Random(seed)
    y = np.linspace(0, 1, H)[:, None]; x = np.linspace(0, 1, W)[None, :]
    t = np.clip(0.75 * y + 0.25 * x, 0, 1)[..., None]
    a = np.array(top)[None, None, :] * (1 - t) + np.array(bot)[None, None, :] * t
    img = Image.fromarray(a.astype(np.uint8), "RGB").convert("RGBA")
    # brilho suave (luz) no alto à direita
    glow = Image.new("L", (W, H), 0); d = ImageDraw.Draw(glow)
    cx, cy, r = int(W * rnd.uniform(0.62, 0.78)), int(H * 0.22), int(H * 0.55)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=150)
    glow = glow.filter(ImageFilter.GaussianBlur(160))
    img = Image.composite(Image.new("RGBA", (W, H), (255, 255, 255, 255)), img, glow)
    # arco/janela de luz suave (profundidade), como estúdio
    arc = Image.new("L", (W, H), 0); d = ImageDraw.Draw(arc)
    ax = int(W * 0.66); aw = int(W * 0.30)
    d.rounded_rectangle([ax - aw // 2, int(H * 0.08), ax + aw // 2, int(H * 1.2)], radius=aw // 2, fill=70)
    arc = arc.filter(ImageFilter.GaussianBlur(30))
    img = Image.composite(Image.new("RGBA", (W, H), (255, 255, 255, 255)), img, arc)
    # piso (mesa) levemente mais claro com horizonte desfocado
    floor_y = int(H * 0.74)
    fl = Image.new("L", (W, H), 0); ImageDraw.Draw(fl).rectangle([0, floor_y, W, H], fill=90)
    fl = fl.filter(ImageFilter.GaussianBlur(10))
    img = Image.composite(Image.new("RGBA", (W, H), mix(bot, (255, 255, 255), 0.35) + (255,)), img, fl)
    return img, floor_y

def pedestal(img, cx, base_y, w, h, cor):
    """Cilindro: base no piso (base_y), altura h, largura w. Retorna y do topo (centro da elipse)."""
    ry = max(12, int(w * 0.13))
    top_y = base_y - h
    # sombra de contato no piso
    sh = Image.new("L", (W, H), 0); d = ImageDraw.Draw(sh)
    d.ellipse([cx - w * 0.62, base_y - ry * 0.9, cx + w * 0.75, base_y + ry * 1.3], fill=110)
    sh = sh.filter(ImageFilter.GaussianBlur(18))
    img.alpha_composite(Image.merge("RGBA", [Image.new("L", (W, H), 60), Image.new("L", (W, H), 40), Image.new("L", (W, H), 50), sh.point(lambda p: int(p * 0.55))]))
    # lateral com degradê horizontal (volume)
    side = np.zeros((h + ry * 2, w, 4), np.uint8)
    xs = np.linspace(-1, 1, w)
    shade = 0.82 + 0.18 * np.cos(xs * math.pi / 2) ** 0.8 - 0.07 * xs
    for k in range(3):
        side[:, :, k] = np.clip(np.array(cor[k]) * shade, 0, 255)[None, :]
    side[:, :, 3] = 255
    sideim = Image.fromarray(side, "RGBA")
    mask = Image.new("L", sideim.size, 0); dm = ImageDraw.Draw(mask)
    dm.rectangle([0, ry, w, h + ry], fill=255); dm.ellipse([0, h, w - 1, h + ry * 2], fill=255)
    img.paste(sideim, (cx - w // 2, top_y - ry), mask)
    # topo (elipse) mais claro com leve degradê
    topc = mix(cor, (255, 255, 255), 0.65)
    tp = Image.new("RGBA", (w, ry * 2), topc + (255,))
    g = Image.linear_gradient("L").resize((w, ry * 2)).point(lambda p: int(p * 0.25))
    tp = Image.composite(Image.new("RGBA", tp.size, mix(cor, (255, 255, 255), 0.15) + (255,)), tp, g)
    tm = Image.new("L", tp.size, 0); ImageDraw.Draw(tm).ellipse([0, 0, w - 1, ry * 2 - 1], fill=255)
    img.paste(tp, (cx - w // 2, top_y - ry), tm)
    # aro (brilho) na borda frontal do topo
    rim = Image.new("RGBA", (W, H), (0, 0, 0, 0)); ImageDraw.Draw(rim).arc([cx - w // 2, top_y - ry, cx + w // 2, top_y + ry], 10, 170, fill=(255, 255, 255, 150), width=3)
    img.alpha_composite(rim.filter(ImageFilter.GaussianBlur(1)))
    return top_y, ry

def produto(img, prod, cx, top_y, alvo_h, max_w, ry):
    p = prod.copy()
    f = min(alvo_h / p.height, max_w / p.width)
    p = p.resize((max(1, int(p.width * f)), max(1, int(p.height * f))), Image.LANCZOS)
    x, y = int(cx - p.width / 2), int(top_y + ry * 0.55 - p.height)
    a = p.getchannel("A")
    # sombra projetada suave (para a esquerda/trás) e sombra de contato
    sil = Image.new("L", (W, H), 0); sil.paste(a.point(lambda v: int(v * 0.5)), (x, y))
    cast = sil.transform((W, H), Image.AFFINE, (1, 0.35, -0.35 * (top_y), 0, 1, 0), Image.BILINEAR)
    cast = cast.filter(ImageFilter.GaussianBlur(22)).point(lambda v: int(v * 0.16))
    cont = Image.new("L", (W, H), 0); ImageDraw.Draw(cont).ellipse([cx - p.width * 0.48, top_y + ry * 0.05, cx + p.width * 0.48, top_y + ry * 0.62], fill=150)
    cont = cont.filter(ImageFilter.GaussianBlur(9))
    sh = ImageChops.lighter(cast, cont)
    img.alpha_composite(Image.merge("RGBA", [Image.new("L", (W, H), 70), Image.new("L", (W, H), 45), Image.new("L", (W, H), 55), sh]))
    img.alpha_composite(p, (x, y))

def logo_rgba(slug):
    p = f"{R}/site/marcas/logos/{slug}.png"
    if not os.path.exists(p): return None
    im = Image.open(p).convert("RGBA")
    a = np.asarray(im).astype(float)
    bg = a[3, 3, :3]
    dist = np.abs(a[:, :, :3] - bg).sum(2)
    alpha = np.clip(dist / 120, 0, 1) * (a[:, :, 3] / 255)
    rgb = a[:, :, :3].copy()
    # desfaz a mistura com o fundo claro para não deixar halo
    with np.errstate(divide="ignore", invalid="ignore"):
        al = np.maximum(alpha, 1e-3)[..., None]
        rgb = np.clip((rgb - bg * (1 - al)) / al, 0, 255)
    out = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    lg = Image.fromarray(out, "RGBA")
    box = lg.getchannel("A").point(lambda v: 255 if v > 30 else 0).getbbox()
    return lg.crop(box) if box else None

def por_logo(img, slug, nome, cor_fundo):
    lg = logo_rgba(slug)
    x0, y0 = 70, 64
    if lg is not None:
        lw = int(W * 0.22); f = lw / lg.width
        if lg.height * f > 150: f = 150 / lg.height
        if lg.height * f < 46 and lg.width < lg.height * 6: f = 46 / lg.height
        lg = lg.resize((int(lg.width * f), int(lg.height * f)), Image.LANCZOS)
        # contraste: se o logo for claro demais para o fundo, escurece para ameixa
        a = np.asarray(lg).astype(float); m = a[:, :, 3] > 100
        lum = (a[:, :, :3][m] @ [0.299, 0.587, 0.114]).mean() if m.any() else 0
        bgl = np.dot(cor_fundo, [0.299, 0.587, 0.114])
        if abs(lum - bgl) < 70:
            sol = Image.new("RGBA", lg.size, AMEIXA + (255,)); sol.putalpha(lg.getchannel("A")); lg = sol
        img.alpha_composite(lg, (x0, y0))
        ty = y0 + lg.height + 18
    else:
        d = ImageDraw.Draw(img); size = 74
        while True:
            f = ImageFont.truetype(FB, size); bb = d.textbbox((0, 0), nome, font=f)
            if bb[2] - bb[0] <= W * 0.36 or size <= 34: break
            size -= 2
        d.text((x0, y0 - bb[1]), nome, font=f, fill=AMEIXA)
        ty = y0 + (bb[3] - bb[1]) + 22

def estrela(d, cx, cy, r, cor):
    pts = []
    for i in range(8):
        a = math.pi / 4 * i - math.pi / 2; rr = r if i % 2 == 0 else r * 0.3
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    d.polygon(pts, fill=cor)

def bolhas(img, seed, cor):
    rnd = random.Random(seed * 7)
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    for _ in range(rnd.randint(3, 5)):
        r = rnd.randint(12, 34); cx = rnd.randint(int(W * 0.48), W - 60); cy = rnd.randint(int(H * 0.12), int(H * 0.6))
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, 70), outline=(255, 255, 255, 160), width=2)
        d.ellipse([cx - r * 0.5, cy - r * 0.6, cx - r * 0.1, cy - r * 0.25], fill=(255, 255, 255, 170))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(0.6)))

def cubo_bojagi(img, cx, top_y, ry, s, seed):
    rnd = random.Random(seed)
    pal = [(253, 228, 236), (244, 143, 177), (158, 223, 196), (255, 214, 226), (217, 87, 127), (226, 245, 236)]
    c = Image.new("RGBA", (s, s), (255, 255, 255, 255)); d = ImageDraw.Draw(c); g = max(3, s // 40)
    blocos = [(0, 0, .55, .45), (.55, 0, 1, .3), (.55, .3, 1, .7), (0, .45, .3, 1), (.3, .45, .55, 1), (.55, .7, 1, 1)]
    for b in blocos:
        d.rectangle([b[0] * s + g, b[1] * s + g, b[2] * s - g, b[3] * s - g], fill=rnd.choice(pal))
    m = Image.new("L", (s, s), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, s - 1, s - 1], s // 10, fill=255)
    c.putalpha(m)
    produto(img, c, cx, top_y, s, s, ry)

def esfera(img, cx, top_y, ry, r, cor):
    s = r * 2; c = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    yy, xx = np.mgrid[0:s, 0:s]; dx, dy = (xx - r) / r, (yy - r) / r; dd = dx ** 2 + dy ** 2
    lum = np.clip(1.04 - 0.24 * np.sqrt(np.clip(dd, 0, 1)) + 0.22 * np.exp(-((dx + .35) ** 2 + (dy + .4) ** 2) * 6) - 0.06 * (dy > 0.55), 0, 1.25)
    arr = np.zeros((s, s, 4), np.uint8)
    for k in range(3): arr[:, :, k] = np.clip(cor[k] * lum + 40 * (lum > 1.05), 0, 255)
    arr[:, :, 3] = (dd <= 1) * 255
    produto(img, Image.fromarray(arr, "RGBA").filter(ImageFilter.GaussianBlur(0.5)), cx, top_y, s, s, ry)

def arco(img, cx, base_y, w, h, cor, seed):
    """Painel em arco atrás dos pedestais, com padrão bojagi bem suave (identidade OMG)."""
    rnd = random.Random(seed)
    pal = [mix(cor, c, 0.22) for c in [(255, 255, 255), (244, 143, 177), (158, 223, 196), (253, 228, 236), (255, 255, 255), (226, 245, 236)]]
    pan = Image.new("RGB", (w, h), mix(cor, (255, 255, 255), 0.45)); d = ImageDraw.Draw(pan)
    def parte(x, y, ww, hh, prof):
        if prof > 3 or (ww < 150 and hh < 150) or (prof > 1 and rnd.random() < .3):
            g = 5; d.rectangle([x + g, y + g, x + ww - g, y + hh - g], fill=rnd.choice(pal)); return
        if ww >= hh:
            c = int(ww * rnd.uniform(.35, .65)); parte(x, y, c, hh, prof + 1); parte(x + c, y, ww - c, hh, prof + 1)
        else:
            c = int(hh * rnd.uniform(.35, .65)); parte(x, y, ww, c, prof + 1); parte(x, y + c, ww, hh - c, prof + 1)
    parte(0, 0, w, h, 0)
    m = Image.new("L", (w, h), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, w - 1, h + w // 2], radius=w // 2, fill=235)
    sh = Image.new("L", (W, H), 0); sh.paste(m.point(lambda v: int(v * .35)), (cx - w // 2 + 14, base_y - h + 18))
    img.alpha_composite(Image.merge("RGBA", [Image.new("L", (W, H), 90), Image.new("L", (W, H), 60), Image.new("L", (W, H), 75), sh.filter(ImageFilter.GaussianBlur(26))]))
    img.paste(pan.convert("RGBA"), (cx - w // 2, base_y - h), m)

def cena(m, idx):
    slug, nome = m["slug"], m["marca"]
    prods = []
    for i in CENA.get(slug, []):
        pth = f"{R}/tools/marcas/recortes/{slug}/{i}.png"
        if os.path.exists(pth):
            prods.append(Image.open(pth).convert("RGBA"))
    hue = cor_dominante(prods) if prods else None
    top, bot = paleta(hue, idx)
    img, floor_y = fundo(top, bot, idx)
    ped = mix(bot, (255, 255, 255), 0.55)
    if prods:
        bolhas(img, idx, top)
        prods = prods[:3]
        n = len(prods)
        # (cx, largura do pedestal, altura do pedestal, altura alvo do produto)
        lay = [(1040, 340, 180, 610), (735, 290, 90, 500), (1350, 290, 65, 520)]
        cenas = [(lay[k], prods[k]) for k in range(n)]
        deco = []
        if n == 1:
            cenas = [((1020, 360, 150, 640), prods[0])]
            deco = [((1340, 240, 75), "esfera"), ((730, 210, 55), "esfera2")]
        elif n == 2:
            cenas = [((920, 340, 165, 610), prods[0]), ((1270, 300, 75, 540), prods[1])]
            deco = [((660, 180, 50), "esfera2")]
        itens = [("p",) + c for c in cenas] + [("d",) + d for d in deco]
        for it in sorted(itens, key=lambda c: -c[1][2]):
            if it[0] == "p":
                (cx, pw, ph, alvo), pr = it[1], it[2]
                ty, ry = pedestal(img, cx, floor_y + 70, pw, ph, ped)
                asp = pr.height / pr.width
                produto(img, pr, cx, ty, min(alvo, ty - 40), pw * (1.0 if asp > 1.3 else 1.3), ry)
            else:
                (cx, pw, ph), tipo = it[1], it[2]
                ty, ry = pedestal(img, cx, floor_y + 70, pw, ph, ped)
                cor = mix(mix(bot, (255, 255, 255), 0.25), (244, 143, 177) if tipo == "esfera" else (158, 223, 196), 0.45)
                esfera(img, cx, ty, ry, int(pw * 0.36), cor)
    else:
        # versão decorativa (sem foto oficial): arco com padrão bojagi suave + pedestais com esferas
        rnd = random.Random(idx * 13 + 5)
        arco(img, 1040, floor_y + 70, 520, 600, bot, idx)
        d = ImageDraw.Draw(img)
        for _ in range(5):
            estrela(d, rnd.randint(int(W * .45), W - 60), rnd.randint(60, int(H * .5)), rnd.randint(9, 18), (255, 255, 255, 235))
        cores = [(244, 143, 177), (158, 223, 196), (250, 206, 170), (196, 182, 236), (255, 255, 255)]
        rnd.shuffle(cores)
        alt = [rnd.randint(150, 200), rnd.randint(70, 110), rnd.randint(50, 90)]
        for (cx, pw, ph, r), c in zip(sorted([(1040, 330, alt[0], 120), (735, 270, alt[1], 88), (1345, 260, alt[2], 70)], key=lambda t: -t[2]), cores):
            ty, ry = pedestal(img, cx, floor_y + 70, pw, ph, ped)
            esfera(img, cx, ty, ry, r, mix(mix(bot, (255, 255, 255), 0.35), c, 0.7))
    por_logo(img, slug, nome, top)
    out = img.convert("RGB").resize((OUTW, OUTH), Image.LANCZOS)
    p = f"{R}/site/marcas/cenas/{slug}.webp"
    q = 84
    while True:
        out.save(p, "WEBP", quality=q, method=6)
        if os.path.getsize(p) <= 80_000 or q <= 60: break
        q -= 6
    return "foto" if prods else "decorativa"

if __name__ == "__main__":
    so = set(sys.argv[1:])
    res = {}
    for idx, m in enumerate(M):
        if so and m["slug"] not in so: continue
        res[m["slug"]] = cena(m, idx)
        m["cena"] = res[m["slug"]]
    if not so:
        json.dump(M, open(f"{R}/site/marcas/marcas.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print({k: sum(1 for v in res.values() if v == k) for k in ("foto", "decorativa")})
