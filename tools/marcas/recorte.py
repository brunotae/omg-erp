# Recorta packshots (produto sobre fundo claro/liso) -> RGBA com borda suave.
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

def recortar(im, tol=26):
    im = im.convert("RGB")
    if max(im.size) > 900:
        im.thumbnail((900, 900), Image.LANCZOS)
    a = np.asarray(im).astype(np.int16)
    h, w, _ = a.shape
    borda = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bg = np.median(borda, axis=0)
    unif = float(np.mean(np.abs(borda - bg).sum(1) < 40))      # quão liso é o fundo na borda
    dist = np.abs(a - bg).sum(2)
    parecido = dist < tol * 3
    lab, n = ndi.label(parecido)
    tocam = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    fundo = np.isin(lab, list(tocam))
    fg = ~fundo
    fg = ndi.binary_opening(fg, iterations=2)
    fg = ndi.binary_fill_holes(fg)
    # remove pedaços pequenos
    lab2, n2 = ndi.label(fg)
    if n2 == 0:
        return None, {"unif": unif, "area": 0}
    tam = ndi.sum(fg, lab2, range(1, n2 + 1))
    keep = np.isin(lab2, [i + 1 for i, t in enumerate(tam) if t > 0.01 * h * w])
    area = float(keep.mean())
    alpha = Image.fromarray((keep * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
    rgba = im.convert("RGBA"); rgba.putalpha(alpha)
    box = alpha.point(lambda p: 255 if p > 20 else 0).getbbox()
    if not box:
        return None, {"unif": unif, "area": 0}
    rgba = rgba.crop(box)
    # toca a borda? (produto cortado)
    toca = box[0] <= 1 or box[1] <= 1 or box[2] >= w - 1 or box[3] >= h - 1
    return rgba, {"unif": unif, "area": area, "toca": toca, "bg": bg.tolist(), "aspect": rgba.height / rgba.width}
