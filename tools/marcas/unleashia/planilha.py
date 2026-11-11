# Planilha oficial de produtos · UNLEASHIA (formato aprovado em 02/11/2026, Guia de precificação v3.4 seção 6)
# Entrada: tools/marcas/unleashia/dados/{kr.json, jolse.json, yesstyle.json}. Saída: caminho em argv[1].
import json, sys, re, datetime
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter as L
from openpyxl.comments import Comment

D = "tools/marcas/unleashia/dados/"
KR = {p["no"]: p for p in json.load(open(D + "kr.json"))["produtos"] if "erro" not in p}
JOL = {x["id"]: x for x in json.load(open(D + "jolse.json"))}
OUT = sys.argv[1]
VERSAO = "v1"
AGORA = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) - datetime.timedelta(hours=3)
SKU0 = 4119  # próximo MB livre no catálogo em 10/11/2026 (MB004118 = última TAFOMI); confirmar na criação

# ---------- produtos (página = grupo com moldura azul) ----------
# no: produto KR; en: nome; linha; pt: descrição para o título; cat; tam; peso (g, estimado); ref: (fonte, US$, link, nome na fonte)
J = lambda i: ("Jolse", float(JOL[i]["precos"][1]), JOL[i]["url"], JOL[i]["nome"])
Y = lambda nome, preco, url="https://www.yesstyle.com/en/list.html?q=unleashia&bt=1": ("YesStyle", preco, url, nome)
P = [
 # pagina, no, en, linha, pt, cat, tam, peso, ref, cores (en na ordem das opções KR), tipo (versão)
 ("Hey Dew Blue Cushion", "273", "Hey Dew Blue Cushion", "A by Unleashia", "cushion de cobertura leve e acabamento iluminado", "Maquiagem › Base e cushion", "6 g", 60, J("91689"),
  "11N Morning|13N Breeze|14N Angel Haze|16N Cream Silk|18C Lucir|18N Murmur|19N Cooing|20N Stella|21C Lovesome|21N Blooming|21W Grace|22N Muse|23N Witty|23W Sunday|24N Eternal|25N Ash Rose|27W Melody|28N Solace|29N Humble|32N Mocha Veil|35N Bronze Dew|38N Drizzle|41N Rooted|43N Moon Dust|46N Cocoa Kiss|51N Night Bear", None),
 ("Bae Bae Blue Cushion", "268", "Bae Bae Blue Cushion", "A by Unleashia", "cushion de cobertura leve", "Maquiagem › Base e cushion", "6 g", 60, J("88918"), "01 Angel|02 Dreamy", None),
 ("Satin Wear Healthy-Green Cushion", "224", "Satin Wear Healthy-Green Cushion", "Unleashia", "cushion de acabamento acetinado SPF30 PA++", "Maquiagem › Base e cushion", "15 g", 130, J("60862"),
  "16N Peach Fuzz|18C Seashell|21N Evernin|23W Bisque|27W Peach Tan", "Cushion"),
 ("Satin Wear Healthy-Green Cushion", "225", "Satin Wear Healthy-Green Cushion Refill", "Unleashia", "refil do cushion acetinado SPF30 PA++ (com esponja)", "Maquiagem › Base e cushion", "15 g", 50, J("78565"),
  "11N Floral White|14N Rosy Cheeks|16N Peach Fuzz|18C Seashell|18N Butter Vanilla|20N Apricot|21N Evernin|21W Creamer|22N Sienna|23N Nude Beach|23W Bisque|24N Wind Storm|25N Blush|27W Peach Tan|29N Bamboo|32N Middle Honey|35N Toffee|38N Sun Stream|41N Butter Rum|46N Burnt Umber|51N Choco Fudge", "Refil"),
 ("Don't Touch Glass Pink Cushion", "247", "Don't Touch Glass Pink Cushion", "Unleashia", "cushion de acabamento glow SPF50+ PA+++", "Maquiagem › Base e cushion", "15 g", 130, J("68582"),
  "21N Hyaline|23W With Care|25N Molten", "Cushion"),
 ("Don't Touch Glass Pink Cushion", "259", "Don't Touch Glass Pink Cushion Refill", "Unleashia", "refil do cushion glow SPF50+ PA+++ (com esponja)", "Maquiagem › Base e cushion", "15 g", 50, J("83319"),
  "13N Mirror|16N Luminous|18C Cherish|19N Prism|20N Moonlit|21N Hyaline|21W Starry|22W Melt|23N Solid|23W With Care|24N Silhouette|25N Molten|27N Limpid|28N Vivacity|30N Build Up|33N Mirage|40N Bake|43N Bronze", "Refil"),
 ("Babe Skin Baby Blue Cushion", "252", "Babe Skin Baby Blue Cushion", "Unleashia", "cushion de cobertura leve SPF40 PA++", "Maquiagem › Base e cushion", "15 g", 130, J("73357"),
  "17C Seraphic|18N Pure|21C Baby Cheek|21N Fluffy|23W Jolly|25N Good Night", "Cushion"),
 ("Babe Skin Baby Blue Cushion", "258", "Babe Skin Baby Blue Cushion Refill", "Unleashia", "refil do cushion SPF40 PA++ (com esponja)", "Maquiagem › Base e cushion", "15 g", 50, J("81543"),
  "21N Fluffy|21W Moony|22N Mellow|23N Cuddly|23W Jolly|24N Heimish|27N Bliss|29N Afterglow", "Refil"),
 ("Cushion Case", "256", "Cushion Case", "Unleashia", "estojo vazio para os refis de cushion", "Maquiagem › Acessórios", "1 un.", 80, J("81502"), "Green|Pink|Blue", None),
 ("Sunset Dazzle Gloss Balm", "260", "Sunset Dazzle Gloss Balm", "Unleashia", "gloss balm hidratante com brilho", "Maquiagem › Lábios", "10 g", 40, J("86508"),
  "No.0 Waikiki|No.1 Malibu|No.2 Bondi|No.3 Ibiza|No.4 Bora Bora|No.5 Amalfi|No.6 Prague|No.7 Roma|No.8 Firenze|No.9 Vienna|No.10 Boston", None),
 ("Non-Sticky Dazzle Tint", "124", "Non-Sticky Dazzle Tint", "Unleashia", "tint labial com brilho que não gruda", "Maquiagem › Lábios", "4 g", 30, J("56375"),
  "No.1 Blink|No.2 Sunbeam|No.3 Glow Day|No.4 Humming|No.5 Nice Step|No.10 Pink Muhly|No.11 Gentle Tiger|No.12 Flamingo", None),
 ("Luv Hug Velvet Tint", "198", "Luv Hug Velvet Tint", "Unleashia", "tint labial aveludado", "Maquiagem › Lábios", "4,5 g", 30, J("56372"),
  "No.1 Be With|No.2 Mingle|No.3 Share|No.4 Join|No.5 Together|No.6 Our", None),
 ("Glacier Vegan Lip Balm", "215", "Glacier Vegan Lip Balm", "Unleashia", "lip balm vegano com cor", "Maquiagem › Lábios", "3,3 g", 30, J("56373"), "No.1 Snow Frost|No.2 Blue Lagoon|No.3 Nude Bluff", None),
 ("Oh! Happy Day Lip Pencil", "248", "Oh! Happy Day Lip Pencil", "Unleashia", "lápis labial cremoso", "Maquiagem › Lábios", "0,8 g", 20, J("69658"),
  "No.1 Birthday|No.2 Keep Smile|No.3 Strawberry Cake|No.4 Bebe|No.5 Love Rose|No.6 After Party|No.7 Burnt Toast|(Kit todas as cores)", None),
 ("Tanghulu Glaze Tint", "265", "Tanghulu Glaze Tint", "A by Unleashia", "tint labial com efeito vitrificado", "Maquiagem › Lábios", "2 g", 20, J("88787"),
  "No.0 Ice Sugar|No.1 Angel Pink|No.2 Amber Rose|No.3 Hush Grape|No.4 Cherry Coke", None),
 ("Cloud Kiss Velvet Tint", "266", "Cloud Kiss Velvet Tint", "A by Unleashia", "tint labial aveludado", "Maquiagem › Lábios", "2,2 g", 20, J("89233"), "No.1 Blush Pink|No.2 Fancy", None),
 ("Berry Cool Plumping Lip Balm", "267", "Berry Cool Plumping Lip Balm", "A by Unleashia", "lip balm com efeito volumizador", "Maquiagem › Lábios", "1,2 g", 20, J("88917"), "No.1 Ruby Kiss|No.2 Peach Haze", None),
 ("Pillow Kiss Lip Pencil", "278", "Pillow Kiss Lip Pencil", "A by Unleashia", "lápis labial", "Maquiagem › Lábios", "0,3 g", 15, J("94443"), "No.1 Lovesome|No.2 Charming|No.3 Bare Shadow", None),
 ("Sisua Berry Shot Lip Tint", "253", "Sisua Berry Shot Lip Tint", "Sisua", "tint labial frutado", "Maquiagem › Lábios", "3,8 g", 30, J("75249"),
  "No.1 White Berry|No.2 Peach Peach|No.3 Cheers|No.4 Woo Woo|No.5 Calm Grape", None),
 ("Sisua Popcorn Syrup Lip Plumper", "245", "Sisua Popcorn Syrup Lip Plumper", "Sisua", "gloss volumizador", "Maquiagem › Lábios", "3,8 g", 30, J("68581"),
  "No.100 Unicorn Salt|No.1 Strawberry Cream|No.2 Mango Caramel|No.3 Neon Guava|No.4 Honey Grapefruit", None),
 ("Glitterpedia Eye Palette", "141", "Glitterpedia Eye Palette", "Unleashia", "paleta de sombras com glitter (4 cores)", "Maquiagem › Olhos", "6,6 g", 90, J("56371"),
  "No.1 All of Glitter|No.2 All of Brown|No.3 All of Coral Pink|No.4 All of Lavender Fog|No.5 All of Dusty Rose|No.6 All of Citrus|No.7 All of Peach Ade|No.8 All of Dancing Swan|No.9 All of Pink Glitter", None),
 ("Mood Shower Eye Palette", "244", "Mood Shower Eye Palette", "Unleashia", "paleta de sombras", "Maquiagem › Olhos", "4 g", 60, J("68580"), "No.1 Vanilla Shower|No.2 Rose Shower|No.3 Nude Shower", None),
 ("Tap Me Palette Duo", "118", "Tap Me Palette Duo", "Unleashia", "duo de sombras", "Maquiagem › Olhos", "8,4 g", 70, J("56374"), "No.1 Pitapat|No.2 Groovy|No.3 Rub-a-dub", None),
 ("Get Loose Glitter Gel", "102", "Get Loose Glitter Gel", "Unleashia", "glitter em gel para olhos e rosto", "Maquiagem › Olhos", "4 g", 25, J("56369"),
  "No.1 Aurora Catcher|No.2 Starlit Chaser|No.3 Gold Obsessor|No.4 Love Dreamer|No.5 Diamond Stealer|No.6 Sunset Lover|No.7 Happy Baker", None),
 ("Pretty Easy Glitter Stick", "108", "Pretty Easy Glitter Stick", "Unleashia", "glitter em bastão", "Maquiagem › Olhos", "0,7 g", 20, J("56370"),
  "No.1 Thrilled|No.2 Flutter|No.3 Brave|No.5 Dusk|No.6 Wee Hours|No.7 Sheer Skin|No.8 Nudie Moon", None),
 ("Moonlight Liquid Glitter", "262", "Moonlight Liquid Glitter", "A by Unleashia", "glitter líquido", "Maquiagem › Olhos", "4,1 g", 25, J("88761"), "No.1 Shine Star|No.2 Gold Star|No.3 Peach Star", None),
 ("Easy Glide Flat Eyeliner", "255", "Easy Glide Flat Eyeliner", "Unleashia", "delineador de ponta chata", "Maquiagem › Olhos", "0,15 g", 20, J("76533"), "No.1 Deep Black|No.2 Mood Brown", None),
 ("Non Stop Liquid Eyeliner", "275", "Non Stop Liquid Eyeliner", "A by Unleashia", "delineador líquido", "Maquiagem › Olhos", "0,5 g", 20, J("94558"), "No.1 Ash Black|No.2 Classic Brown", None),
 ("Lift Lock Fixing Mascara", "277", "Lift Lock Fixing Mascara", "A by Unleashia", "máscara de cílios que curva e fixa", "Maquiagem › Olhos", "3,7 g", 30, J("94560"), "No.1 Clear Black", None),
 ("Real Fine 1mm Eyebrow Pencil", "276", "Real Fine 1mm Eyebrow Pencil", "A by Unleashia", "lápis de sobrancelha ultrafino", "Maquiagem › Sobrancelhas", "0,025 g", 15, J("94559"), "No.1 Umber Gray|No.2 Mud Brown", None),
 ("Shaper Defining Eyebrow Pencil", "221", "Shaper Defining Eyebrow Pencil", "Unleashia", "lápis de sobrancelha", "Maquiagem › Sobrancelhas", "0,025 g", 15, J("58771"),
  "@Clear Fixer|No.1 Oatmeal Brown|No.2 Craft Brown|No.3 Taupe Gray", None),
 ("Shaper Pomade Eyebrow Fixer", "221", "Shaper Pomade Eyebrow Fixer", "Unleashia", "gel fixador transparente para sobrancelhas", "Maquiagem › Sobrancelhas", "8 g", 40, J("58770"),
  "Clear Fixer|@No.1 Oatmeal Brown|@No.2 Craft Brown|@No.3 Taupe Gray", None),
 ("Dough Dough Waffle Blush", "280", "Dough Dough Waffle Blush", "Unleashia", "blush em textura de massa", "Maquiagem › Blush e iluminador", "7 g", 50, J("97105"),
  "No.1 Peach Batter|No.2 Icy Berry|No.3 Jammy Grape|No.4 Toasted Crumb", None),
 ("Sisua Butter Waffle Dough Blusher", "238", "Sisua Butter Waffle Dough Blusher", "Sisua", "blush cremoso", "Maquiagem › Blush e iluminador", "8 g", 50, J("64264"),
  "No.1 Strawberry Vanilla|No.2 Apricot Sherbet|No.3 Honey Oolong|No.4 Rose Choco Mousse", None),
 ("Sisua Butter Glow Stick", "237", "Sisua Butter Glow Stick", "Sisua", "iluminador em bastão", "Maquiagem › Blush e iluminador", "7 g", 40, J("64263"), "", None),
 ("Tinted Drop Jellying Cheek", "264", "Tinted Drop Jellying Cheek", "A by Unleashia", "blush em gel", "Maquiagem › Blush e iluminador", "5,2 g", 30, J("89234"), "No.1 Pink Dream|No.2 Tahiti Sunset", None),
 ("Cotton Candy Face Palette", "263", "Cotton Candy Face Palette", "A by Unleashia", "paleta de rosto (blush e iluminador)", "Maquiagem › Blush e iluminador", "1,6 g", 25, J("88759"),
  "No.1 Peach Bronze|No.2 Cocoa Mist|No.3 Rose Veil|No.4 Mystic Petal", None),
 ("Mood Shower Face Palette (Ballerina)", "251", "Mood Shower Face Palette Highlighter Version", "Unleashia", "paleta de rosto com iluminador", "Maquiagem › Blush e iluminador", "4 g", 60,
  Y("Mood Shower Face Palette Highlighter Version - 2 Types", 14.00), "No.100 Ballerina|No.101 Ballerino", None),
 ("ABC Sorbet Facial Cleanser", "272", "ABC Sorbet Facial Cleanser", "Unleashia", "gel de limpeza facial em textura sorbet", "Skincare › Limpeza", "120 ml", 160, J("89729"), "Versão antes da renovação", None),
 ("ABC Sorbet Facial Cleanser", "283", "ABC Sorbet Facial Cleanser (Renewal)", "Unleashia", "gel de limpeza facial em textura sorbet (nova versão)", "Skincare › Limpeza", "120 ml", 160, J("101181"), "", None),
 ("Niacinamide Banana Sun Serum", "274", "Niacinamide Banana Sun Serum", "Unleashia", "sérum protetor solar com niacinamida", "Skincare › Protetor solar", "40 ml", 80, J("93745"), "", None),
 ("Dr. Obvious Daily Relief Cream", "286", "Dr. Obvious Daily Relief Cream", "Unleashia", "creme calmante de uso diário", "Skincare › Hidratante", "?", 120, Y("Dr. Obvious Daily Relief Cream", 12.22), "", None),
 ("2-Step Zero Pore Overnight Bubble Mask", "285", "2-Step Zero Pore Overnight Bubble Mask", "Unleashia", "máscara noturna de bolhas para poros (2 passos)", "Skincare › Máscara", "40 ml", 90, J("105665"), "", None),
 ("Reduire Refreshing Time Cleansing Water", "254", "Reduire Refreshing Time Cleansing Water", "Reduire by Unleashia", "água de limpeza (demaquilante)", "Skincare › Limpeza", "?", 300, Y("reduire Refreshing Time Cleansing Water", 15.89), "", None),
]

def opcoes(no):
    ops = KR[no].get("opcoes") or []
    vals = []
    for o in ops:
        v = o["valor"][0] if isinstance(o["valor"], list) else o["valor"]
        vals.append((re.sub(r"\s+", " ", v).strip(), o.get("usa_esgotado") == "T" and not o.get("estoque")))
    return vals

def preco_kr(no):
    p = KR[no]; s = p.get("product_sale_price"); return int(float(s)) if s not in (None, "", "None") else int(float(p["product_price"])), int(float(p["product_price"]))

linhas = []
for pg, no, en, linha, pt, cat, tam, peso, ref, cores, tipo in P:
    kr = KR[no]; prod_esg = no in ("283", "285")
    ops = opcoes(no)
    cs = [c for c in cores.split("|")] if cores else [""]
    if no == "102":  # 1+1: opções combinadas "cor A-cor B" -> uma cor por SKU; esgotada se todas as combinações dela estão esgotadas
        cores_kr = {}
        for v, e in ops:
            a = v.split("-")[0].strip(); cores_kr.setdefault(a, []).append(e)
        ops = [(a, all(es)) for a, es in cores_kr.items()]
    if not ops: ops = [("", False)]
    if len(ops) != len(cs): raise SystemExit(f"{no}: {len(ops)} opções KR x {len(cs)} cores EN")
    venda, cheio = preco_kr(no)
    for (vkr, esg), cen in zip(ops, cs):
        if cen.startswith("@"): continue  # pertence à outra página (221)
        obs, instr = [], ""
        sit = "Esgotado no fabricante" if (prod_esg or esg) else "À venda"
        if no == "283": obs.append("Versão renovada esgotada na loja coreana; a versão anterior (linha de cima) está à venda.")
        if no == "285": obs.append("Esgotado na loja coreana.")
        if no == "102": obs.append("Na Coreia sai como 1+1 de mini gel (₩ é do par). Jolse vende a unidade de 4 g: confirmar com a Janice o que ela compra.")
        if no == "221": obs.append("Na loja coreana o lápis e o fixador são o mesmo produto com opções; aqui viram 2 páginas.")
        if no == "248" and cen.startswith("("): obs.append("Kit com as 7 cores (35% off na Coreia). Proposta: não subir agora."); sit = "Kit da loja"
        if no == "251": obs.append("Jolse vende outra versão da paleta; referência pela YesStyle (mesma versão).")
        if tam == "?": obs.append("Tamanho não aparece no texto da loja: ler nas imagens do detalhe.")
        if sit != "À venda": instr = "Não subir"
        linhas.append(dict(pg=pg, no=no, en=en, linha=linha, pt=pt, cat=cat, tam=tam, peso=peso, ref=ref, cor_en=cen, cor_kr=vkr, tipo=tipo,
                           sit=sit, venda=venda, cheio=cheio, url=kr["url"], nome_kr=kr.get("product_name", ""), obs=" ".join(obs), instr=instr))

# ---------- planilha ----------
wb = Workbook()
ws = wb.active; ws.title = "Unleashia"
par = wb.create_sheet("Parâmetros"); ver = wb.create_sheet("Versões"); leg = wb.create_sheet("Legenda")
ARIAL = "Arial"
fin = Side(style="thin", color="BFBFBF"); azul = Side(style="medium", color="1F4E9E")
B = Border(left=fin, right=fin, top=fin, bottom=fin)
f = lambda **k: Font(name=ARIAL, size=k.pop("size", 10), **k)

# Parâmetros (todas as contas da planilha usam estas células)
prm = [("Câmbio US$ → R$", 5.40, "Guia v3.4"), ("Fator sobre o preço do exterior", 1.15, "Guia v3.4, seção 4"), ("Voo Coreia→Brasil (US$/kg)", 10, "config frete_omg"),
       ("Embalagem (g)", 100, "config frete_omg"), ("Parte do frete de SP embutida no preço", 0.65, "Guia v3.4, seção 9"), ("Parte do frete cobrada da cliente", 0.35, "Guia v3.4, seção 9"),
       ("ICMS (por dentro)", 0.17, "Guia v3.4, seção 2"), ("₩ → R$", 0.0039, "config geral do ERP"), ("Frete grátis a partir de (R$ em produtos)", 200, "Guia v3.4, seção 10")]
par["A1"] = "Parâmetros"; par["A1"].font = f(bold=True, size=12)
for i, (a, b, c) in enumerate(prm, start=3):
    par.cell(i, 1, a).font = f(); par.cell(i, 2, b).font = f(color="0000FF"); par.cell(i, 3, c).font = f(color="808080", size=9)
    par.cell(i, 2).fill = PatternFill("solid", fgColor="FFF2CC")
par["B10"].number_format = "0.0000"
for r in (7, 8, 9): par.cell(r, 2).number_format = "0%"
par["A14"] = "Mile · São Paulo capital (US$ por pacote)"; par["A14"].font = f(bold=True)
par["A15"], par["B15"] = "Pacote a partir de (g)", "US$"
mile = [(0, 1.4768), (301, 1.5762), (501, 1.7381), (751, 1.8886), (1001, 1.9965), (1251, 2.1158), (1501, 2.3657), (2001, 2.6242), (2501, 2.8883)]
for i, (a, b) in enumerate(mile, start=16):
    par.cell(i, 1, a).font = f(color="0000FF"); par.cell(i, 2, b).font = f(color="0000FF")
par["C16"] = "config frete_mile (lm › SP CAP), faixas até 300 g, 500 g, 750 g…"; par["C16"].font = f(color="808080", size=9)
par.column_dimensions["A"].width = 42; par.column_dimensions["B"].width = 12; par.column_dimensions["C"].width = 60
CAMB, FATOR, VOO, EMB, EMBUT, COBR, ICMS, KRW = ("Parâmetros!$B$3", "Parâmetros!$B$4", "Parâmetros!$B$5", "Parâmetros!$B$6", "Parâmetros!$B$7", "Parâmetros!$B$8", "Parâmetros!$B$9", "Parâmetros!$B$10")
MLIM, MUSD = "Parâmetros!$A$16:$A$24", "Parâmetros!$B$16:$B$24"

# cabeçalho
ws["A1"] = f"UNLEASHIA · planilha de produtos OMG · {VERSAO} · {AGORA:%d/%m/%Y %H:%M}"; ws["A1"].font = f(bold=True, size=13)
ws["A2"] = ("Fonte: loja oficial coreana unleashiacosmetics.com (lida em " + json.load(open(D + "kr.json"))["lido"] + " UTC). "
            "Nenhum concorrente válido no Brasil (KS, Jini e Sephora BR não vendem Unleashia) e não há loja oficial nos EUA: preço pela cascata do Guia v3.4 (Jolse → YesStyle). "
            "Preço = US$ × 1,15 × 5,40 + 65% do frete de SP, arredondado para baixo em ,90. Pesos estimados.")
ws["A2"].font = f(size=9, color="595959"); ws["A2"].alignment = Alignment(wrap_text=True, vertical="top"); ws.merge_cells("A2:AE2"); ws.row_dimensions[2].height = 30

blocos = [("", 1, 3), ("Produto", 4, 11), ("Concorrente Brasil", 12, 12), ("Loja oficial (Coreia)", 13, 15), ("Exterior (referência de preço)", 16, 19),
          ("OMG", 20, 27), ("Cadastro", 28, 29), ("Conferência", 30, 32)]
cores_bl = {"Produto": "D9E1F2", "Concorrente Brasil": "FCE4D6", "Loja oficial (Coreia)": "E2EFDA", "Exterior (referência de preço)": "FFF2CC", "OMG": "F8CBAD", "Cadastro": "EDEDED", "Conferência": "DDEBF7"}
for nome, a, b in blocos:
    if not nome: continue
    c = ws.cell(4, a, nome); c.font = f(bold=True); c.alignment = Alignment(horizontal="center")
    for k in range(a, b + 1): ws.cell(4, k).fill = PatternFill("solid", fgColor=cores_bl[nome]); ws.cell(4, k).border = B
    if b > a: ws.merge_cells(start_row=4, start_column=a, end_row=4, end_column=b)
cab = ["#", "Página", "SKU MB (proposto)",
       "Situação na Coreia", "Linha", "Produto (EN)", "Cor / opção (EN)", "Cor (KR)", "Título OMG proposto", "Categoria", "Tamanho",
       "KS · Jini · Sephora BR",
       "₩ venda", "₩ cheio", "Link loja KR",
       "Fonte", "Nome na fonte", "US$", "Link",
       "Peso g (est.)", "Pacote g", "Frete SP R$", "Mercadoria R$", "Frete exibido SP R$", "Final SP R$", "Preço KR em R$", "Mercadoria ÷ KR",
       "Nome KR (Master List)", "EAN",
       "O que falta / observação", "Instrução Tae", "O que fiz"]
for i, h in enumerate(cab, start=1):
    c = ws.cell(5, i, h); c.font = f(bold=True, color="FFFFFF"); c.fill = PatternFill("solid", fgColor="44546A"); c.alignment = Alignment(wrap_text=True, vertical="center", horizontal="center"); c.border = B
ws.row_dimensions[5].height = 32

r = 6; sku = SKU0; prev = None; grupos = []
for i, x in enumerate(linhas, start=1):
    if x["pg"] != prev: grupos.append([r, r]); prev = x["pg"]
    grupos[-1][1] = r
    cor = x["cor_en"] if x["cor_en"] not in ("Versão antes da renovação",) else ""
    tipo = (x["tipo"] + " · ") if x["tipo"] else ""
    titulo = f'{x["en"].replace(" Refill", "")}: {x["pt"]} {x["tam"] if x["tam"] != "?" else ""}'.strip() + (f" · {tipo}{cor}" if (cor or tipo) else "")
    titulo = titulo.replace(" · ·", " ·").rstrip(" ·")
    vals = [i, x["pg"], f"MB{sku:06d}" if x["sit"] == "À venda" else "—",
            x["sit"], x["linha"], x["en"], x["cor_en"], x["cor_kr"], titulo, x["cat"], x["tam"],
            "Não vende",
            x["venda"], x["cheio"], x["url"],
            x["ref"][0], x["ref"][3], x["ref"][1], x["ref"][2],
            x["peso"], None, None, None, None, None, None, None,
            (x["nome_kr"] + (" / " + x["cor_kr"] if x["cor_kr"] else "")).strip(), "",
            x["obs"], x["instr"], ""]
    if x["sit"] == "À venda": sku += 1
    for k, v in enumerate(vals, start=1):
        c = ws.cell(r, k, v); c.font = f(); c.border = B; c.alignment = Alignment(vertical="top", wrap_text=k in (9, 17, 30))
    # fórmulas (colunas U..AA)
    ws.cell(r, 21, f"=T{r}+{EMB}")
    ws.cell(r, 22, f"=ROUND((U{r}/1000*{VOO}+INDEX({MUSD},MATCH(U{r},{MLIM},1)))*{CAMB},2)")
    ws.cell(r, 23, f"=FLOOR(R{r}*{FATOR}*{CAMB}+{EMBUT}*V{r}+0.1,1)-0.1")
    ws.cell(r, 24, f"=ROUND({COBR}*V{r},2)")
    ws.cell(r, 25, f"=ROUND((W{r}+X{r})/(1-{ICMS}),2)")
    ws.cell(r, 26, f"=ROUND(M{r}*{KRW},2)")
    ws.cell(r, 27, f"=IF(Z{r}>0,W{r}/Z{r},\"\")")
    for k in (21, 22, 23, 24, 25, 26, 27): ws.cell(r, k).font = f(); ws.cell(r, k).border = B
    for k in (22, 23, 24, 25, 26): ws.cell(r, k).number_format = 'R$ #,##0.00'
    ws.cell(r, 27).number_format = "0.00x"
    ws.cell(r, 18).number_format = '"US$" 0.00'; ws.cell(r, 13).number_format = '#,##0" ₩"'; ws.cell(r, 14).number_format = '#,##0" ₩"'
    ws.cell(r, 18).font = f(color="0000FF"); ws.cell(r, 20).font = f(color="0000FF")
    ws.cell(r, 15).hyperlink = x["url"]; ws.cell(r, 15).value = "abrir"; ws.cell(r, 15).font = f(color="0563C1", underline="single")
    ws.cell(r, 19).hyperlink = x["ref"][2]; ws.cell(r, 19).value = "abrir"; ws.cell(r, 19).font = f(color="0563C1", underline="single")
    ws.cell(r, 31).fill = PatternFill("solid", fgColor="FFF2CC")
    if x["sit"] != "À venda":
        for k in range(1, 33):
            if k != 31: ws.cell(r, k).font = Font(name=ARIAL, size=10, color="A6A6A6", italic=True)
    r += 1
ult = r - 1

# moldura azul por página
for a, b in grupos:
    for rr in range(a, b + 1):
        for k in range(1, 33):
            c = ws.cell(rr, k); bd = c.border
            c.border = Border(left=azul if k == 1 else bd.left, right=azul if k == 32 else bd.right,
                              top=azul if rr == a else bd.top, bottom=azul if rr == b else bd.bottom)

# alerta: mercadoria abaixo de 1,3× o preço coreano (margem apertada)
from openpyxl.formatting.rule import FormulaRule
ws.conditional_formatting.add(f"AA6:AA{ult}", FormulaRule(formula=[f'AND(ISNUMBER(AA6),AA6<1.3)'], fill=PatternFill("solid", fgColor="F4CCCC"), font=Font(name=ARIAL, color="9C0006")))

# larguras, grupos de colunas secundárias, congelar
larg = {1: 5, 2: 26, 3: 12, 4: 14, 5: 14, 6: 30, 7: 22, 8: 18, 9: 60, 10: 22, 11: 9, 12: 12, 13: 10, 14: 10, 15: 7, 16: 9, 17: 40, 18: 9, 19: 7,
        20: 8, 21: 8, 22: 11, 23: 13, 24: 12, 25: 12, 26: 12, 27: 10, 28: 40, 29: 14, 30: 50, 31: 22, 32: 22}
for k, w in larg.items(): ws.column_dimensions[L(k)].width = w
for a, b in [(8, 8), (14, 15), (17, 17), (19, 19), (21, 22), (24, 24), (28, 29)]:
    ws.column_dimensions.group(L(a), L(b), outline_level=1, hidden=True)
ws.freeze_panes = "D6"
ws.sheet_view.showGridLines = False
ws.auto_filter.ref = f"A5:AF{ult}"
ws.cell(5, 31).comment = Comment("Escreva aqui: subir, não subir, mudar preço…", "Claude")

# totais
ws.cell(ult + 2, 2, "Resumo").font = f(bold=True)
ws.cell(ult + 3, 2, "SKUs à venda na Coreia").font = f(); ws.cell(ult + 3, 3, f'=COUNTIF(D6:D{ult},"À venda")').font = f()
ws.cell(ult + 4, 2, "Esgotados / fora").font = f(); ws.cell(ult + 4, 3, f'=COUNTA(D6:D{ult})-C{ult + 3}').font = f()
ws.cell(ult + 5, 2, "Páginas no site").font = f(); ws.cell(ult + 5, 3, len(grupos)).font = f()
ws.cell(ult + 6, 2, "SKUs com mercadoria < 1,3× preço KR").font = f(); ws.cell(ult + 6, 3, f'=COUNTIFS(AA6:AA{ult},"<1.3",D6:D{ult},"À venda")').font = f()

# Versões
ver["A1"], ver["B1"], ver["C1"] = "Versão", "Data", "O que mudou"
for c in ("A1", "B1", "C1"): ver[c].font = f(bold=True)
ver["A2"], ver["B2"], ver["C2"] = VERSAO, f"{AGORA:%d/%m/%Y %H:%M}", "Primeira versão: catálogo inteiro da loja coreana, preços pela cascata (Jolse → YesStyle), pesos estimados."
for c in ("A2", "B2", "C2"): ver[c].font = f()
ver.column_dimensions["C"].width = 100; ver.column_dimensions["B"].width = 18

# Legenda
txt = ["Como ler",
       "• Uma linha por SKU (cor). Linhas com moldura azul = uma página só no site (cores e versões cushion/refil como opções).",
       "• Azul = número digitado (US$ da fonte, peso). Preto = fórmula. Amarelo = Instrução Tae (você preenche).",
       "• Mercadoria = US$ × 1,15 × 5,40 + 65% do frete de SP, arredondada para baixo em ,90 (Guia v3.4).",
       "• Final SP = (mercadoria + 35% do frete) com ICMS de 17% por dentro, para uma compra só deste item em São Paulo capital.",
       "• Mercadoria ÷ KR em vermelho: o nosso preço fica menos de 1,3× o preço de venda na loja coreana. Margem apertada se a Janice comprar no varejo.",
       "• Linhas cinza: esgotadas no fabricante ou kit da loja. Proposta: não subir.",
       "• Colunas escondidas (+ no topo): cor em coreano, ₩ cheio, link KR, nome na fonte, link da fonte, pacote, frete SP, frete exibido, nome KR, EAN.",
       "• Parâmetros: aba Parâmetros (mudar ali recalcula tudo)."]
for i, t in enumerate(txt, start=1):
    c = leg.cell(i, 1, t); c.font = f(bold=(i == 1), size=11 if i == 1 else 10)
leg.column_dimensions["A"].width = 130
wb.save(OUT)
print(len(linhas), "linhas,", len(grupos), "páginas,", sku - SKU0, "SKUs à venda; última linha", ult)
