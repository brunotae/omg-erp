# Roda no GitHub Actions: recorta o fundo das fotos oficiais (rembg) -> PNG com transparência.
import glob, os
from PIL import Image
from rembg import remove, new_session
sess = new_session("isnet-general-use")
for f in sorted(glob.glob("tools/marcas/fundos/*/*.jpg")):
    slug, nome = f.split("/")[-2], os.path.basename(f).rsplit(".", 1)[0]
    out = f"tools/marcas/recortes/{slug}/{nome}.png"
    if os.path.exists(out): continue
    os.makedirs(os.path.dirname(out), exist_ok=True)
    im = Image.open(f).convert("RGB"); im.thumbnail((900, 900))
    cut = remove(im, session=sess, post_process_mask=True)
    box = cut.getchannel("A").point(lambda p: 255 if p > 24 else 0).getbbox()
    if box: cut = cut.crop(box)
    cut.save(out, optimize=True)
    print(out, cut.size, flush=True)
