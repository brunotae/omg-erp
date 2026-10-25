"""Gera a planilha mestre de produtos (um SKU por linha) com tamanho, peso e dimensões.

Uso: python3 tools/pesos/planilha.py saida.xlsx products_export_1.csv [products_export_2.csv ...]

- Lote 1 (1.439 produtos): peso de tools/pesos/pesos_final.csv (site oficial → varejo → estimado pelo tamanho).
- Demais produtos: estimativa pelo tamanho, quando o tamanho está no nome; senão, peso que está hoje no Shopify (padrão).
- Dimensões: as do Shopify hoje (quase todas padrão 8 × 22 × 10 cm), marcadas como "padrão do site".
- Colunas amarelas (peso real e dimensões reais) são para preencher na embalagem; "Peso a usar" pega o real quando existir.
"""
import csv
import re
import sys
from pathlib import Path

from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

A = Path(__file__).resolve().parent
csv.field_size_limit(10**9)
saida, arquivos = sys.argv[1], sys.argv[2:]

# 1. Pesos consolidados do lote 1
LOTE = {r["handle"]: r for r in csv.DictReader(open(A / "pesos_final.csv", encoding="utf-8"))}
FATOR = 1.76  # g por ml/g de conteúdo (mediana dos produtos com peso oficial; ver consolidar.py)


def tam(s):
    m = re.search(r"(\d+(?:[.,]\d+)?)\s?(ml|g)\b", s or "", re.I)
    return (float(m.group(1).replace(",", ".")), m.group(2).lower()) if m else None


def dim(v):
    v = (v or "").strip().lstrip("'")
    try:
        return float(v)
    except ValueError:
        return None


# 2. Linhas do export (uma por variante/SKU)
linhas, prod = [], {}
for f in arquivos:
    for r in csv.DictReader(open(f, encoding="utf-8")):
        h = r["Handle"]
        if r["Title"]:
            prod[h] = r
        p = prod.get(h)
        if not p or not (r["Variant SKU"] or r["Variant Price"]):
            continue
        variante = " / ".join(x for x in [r["Option1 Value"], r["Option2 Value"]] if x and x != "Default Title")
        nome = p["Title"]
        t = tam(variante) or tam(nome)
        lote = LOTE.get(h)
        shop_g = float(r["Variant Grams"] or 0) or None
        if lote and lote["peso_g"]:
            peso, origem = float(lote["peso_g"]), lote["fonte"]
            if variante and t and tam(variante) and lote["tamanho"] and tam(lote["tamanho"]) != t:
                peso, origem = round(t[0] * FATOR), "estimado pelo tamanho"
        elif t and 5 <= t[0] <= 1000:
            peso, origem = round(t[0] * FATOR), "estimado pelo tamanho"
        elif shop_g:
            peso, origem = shop_g, "padrão do site (não confiável)"
        else:
            peso, origem = None, "sem peso"
        d = [dim(p.get("depth (product.metafields.custom.depth)")), dim(p.get("width (product.metafields.custom.width)")), dim(p.get("height (product.metafields.custom.height)"))]
        linhas.append({
            "lote": "Sim" if lote else "Não",
            "status": {"draft": "Rascunho", "active": "Ativo", "archived": "Arquivado"}.get(p["Status"], p["Status"]),
            "marca": p["Vendor"],
            "produto": nome,
            "variante": variante,
            "sku": r["Variant SKU"],
            "handle": h,
            "tipo": p.get("Type", ""),
            "tamanho": f"{t[0]:g} {t[1]}" if t else "",
            "preco": float(r["Variant Price"]) if r["Variant Price"] else None,
            "peso_shop": shop_g,
            "peso_est": peso,
            "origem": origem,
            "c": d[0], "l": d[1], "a": d[2],
            "dim_origem": "padrão do site (não confiável)" if any(d) else "sem dimensão",
        })

linhas.sort(key=lambda x: (x["lote"] != "Sim", x["marca"].lower(), x["produto"].lower(), x["variante"]))

# 3. Planilha
wb = Workbook()
ws = wb.active
ws.title = "Produtos"
F = "Arial"
cab = ["Lote 1", "Status no site", "Marca", "Produto", "Variante", "SKU", "Handle (Shopify)", "Tipo", "Tamanho",
       "Preço (R$)", "Peso no Shopify hoje (g)", "Peso estimado (g)", "Origem do peso",
       "Peso real (g)", "Peso a usar (g)", "Origem do peso a usar",
       "Comprimento site (cm)", "Largura site (cm)", "Altura site (cm)", "Origem das dimensões",
       "Comprimento real (cm)", "Largura real (cm)", "Altura real (cm)", "Observação"]
ws.append(cab)
amarelo = PatternFill("solid", start_color="FFFF00")
cinza = PatternFill("solid", start_color="F2E8EE")
for i, c in enumerate(ws[1], 1):
    c.font = Font(name=F, bold=True, color="FFFFFF")
    c.fill = PatternFill("solid", start_color="4A1D45")
    c.alignment = Alignment(wrap_text=True, vertical="center")
for col in ("N", "U", "V", "W"):
    ws[f"{col}1"].fill = PatternFill("solid", start_color="D61F6E")

for n, x in enumerate(linhas, start=2):
    ws.append([x["lote"], x["status"], x["marca"], x["produto"], x["variante"], x["sku"], x["handle"], x["tipo"], x["tamanho"],
               x["preco"], x["peso_shop"], x["peso_est"], x["origem"],
               None, f'=IF(N{n}<>"",N{n},IF(L{n}<>"",L{n},""))', f'=IF(N{n}<>"","pesado (real)",M{n})',
               x["c"], x["l"], x["a"], x["dim_origem"], None, None, None, None])

ult = len(linhas) + 1
fonte = Font(name=F, size=10)
for row in ws.iter_rows(min_row=2, max_row=ult):
    for c in row:
        c.font = fonte
for col in ("N", "U", "V", "W"):
    for r in range(2, ult + 1):
        ws[f"{col}{r}"].fill = amarelo
for col in ("J",):
    for r in range(2, ult + 1):
        ws[f"{col}{r}"].number_format = '#,##0.00'
for col in ("K", "L", "N", "O"):
    for r in range(2, ult + 1):
        ws[f"{col}{r}"].number_format = '#,##0'

larg = [7, 10, 16, 52, 14, 14, 30, 16, 10, 10, 11, 11, 26, 10, 10, 22, 11, 11, 11, 24, 11, 11, 11, 24]
for i, w in enumerate(larg, 1):
    ws.column_dimensions[get_column_letter(i)].width = w
ws.row_dimensions[1].height = 42
ws.freeze_panes = "E2"
ws.auto_filter.ref = f"A1:X{ult}"
ws["L1"].comment = Comment("Estimativa: site oficial da marca → lojas de varejo (Soko Glam, Ohlolly) → tamanho × 1,76 g por ml/g (mediana dos produtos com peso oficial). Ver coluna M.", "OMG")
ws["N1"].comment = Comment("Preencher com o peso do produto pesado na embalagem (balança de 1 g), em gramas.", "OMG")
ws["Q1"].comment = Comment("Valor que está hoje no Shopify. 1.217 produtos têm o mesmo 8 × 22 × 10 cm: é padrão, não é medida real.", "OMG")
dv = DataValidation(type="decimal", operator="between", formula1="1", formula2="20000", allow_blank=True,
                    error="Digite o peso em gramas (1 a 20.000).", errorTitle="Peso inválido")
ws.add_data_validation(dv)
dv.add(f"N2:N{ult}")

# 4. Resumo (fórmulas)
rs = wb.create_sheet("Resumo")
rs["A1"] = "Resumo da planilha de produtos"
rs["A1"].font = Font(name=F, bold=True, size=14)
rs.append([])
rs.append(["Origem do peso a usar", "Lote 1 (SKUs)", "Todos (SKUs)"])
origens = ["pesado (real)", "site oficial da marca", "varejo (sokoglam.com)", "varejo (ohlolly.com)", "estimado pelo tamanho", "padrão do site (não confiável)", "sem peso"]
for i, o in enumerate(origens, start=4):
    rs.append([o, f'=COUNTIFS(Produtos!$P$2:$P${ult},A{i},Produtos!$A$2:$A${ult},"Sim")', f'=COUNTIF(Produtos!$P$2:$P${ult},A{i})'])
t = 4 + len(origens)
rs.append(["Total", f"=SUM(B4:B{t-1})", f"=SUM(C4:C{t-1})"])
rs.append([])
rs.append(["Dimensões reais preenchidas", f'=COUNTIFS(Produtos!$U$2:$U${ult},"<>",Produtos!$A$2:$A${ult},"Sim")', f'=COUNTIF(Produtos!$U$2:$U${ult},"<>")'])
for row in rs.iter_rows(min_row=2, max_row=t + 2):
    for c in row:
        c.font = Font(name=F, size=10, bold=(c.row in (3, t)))
rs.column_dimensions["A"].width = 36
rs.column_dimensions["B"].width = 16
rs.column_dimensions["C"].width = 16

# 5. Como usar
cu = wb.create_sheet("Como usar")
txt = [
    ("Como usar esta planilha", True),
    ("Uma linha por SKU (variante). Os produtos do lote 1 (os que vão ao ar na inauguração) vêm primeiro.", False),
    ("", False),
    ("Colunas amarelas = para preencher na embalagem:", True),
    ("• Peso real (g): pese o produto na balança (1 g de precisão) na primeira vez que ele for embalado. Ex.: 186", False),
    ("• Comprimento, largura e altura reais (cm): meça a caixinha do produto. Ex.: 4,5 · 4,5 · 14", False),
    ("Quando o peso real é preenchido, a coluna 'Peso a usar' passa a usá-lo e a origem vira 'pesado (real)'.", False),
    ("", False),
    ("De onde vem o peso estimado (coluna M):", True),
    ("• site oficial da marca: peso de envio publicado pela loja oficial da marca (pode incluir ou não a caixa);", False),
    ("• varejo: peso de envio publicado por lojas de K-beauty dos EUA (Soko Glam, Ohlolly);", False),
    ("• estimado pelo tamanho: conteúdo (ml ou g) × 1,76, a mediana dos produtos que têm peso oficial;", False),
    ("• padrão do site (não confiável): o valor que está hoje no Shopify, preenchido em massa.", False),
    ("Nos 131 produtos com peso do site oficial e do varejo, só 61 ficaram a menos de 30% de diferença: use o peso real assim que possível.", False),
    ("", False),
    ("Dimensões: as do Shopify hoje são padrão (8 × 22 × 10 cm em quase todos). Para o manifesto vale a caixa do pedido.", False),
    ("Fonte dos dados: exportação de produtos do Shopify (24/10/2026) e robô de pesos do ERP (25/10/2026).", False),
]
for i, (t_, b) in enumerate(txt, 1):
    cu.cell(row=i, column=1, value=t_).font = Font(name=F, size=11 if b else 10, bold=b)
cu.column_dimensions["A"].width = 120

wb.move_sheet("Como usar", offset=-2)
wb.active = 1
wb.save(saida)
print("linhas:", len(linhas), "lote 1:", sum(1 for x in linhas if x["lote"] == "Sim"))
