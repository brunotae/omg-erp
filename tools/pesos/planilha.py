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
import json
MED = json.loads((A / "medidas_sku.json").read_text())
CONF = json.loads((A / "conferir.json").read_text()) if (A / "conferir.json").exists() else {}
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
        md = MED.get(r["Variant SKU"], {})
        if md.get("peso"):
            peso, origem = md["peso"], md["peso_origem"]
        est = md.get("dim") or [None, None, None]
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
            "c": est[0], "l": est[1], "a": est[2],
            "dim_origem": md.get("dim_origem", "sem dimensão"),
            "classe": md.get("classe") or "", "barcode": md.get("barcode", ""),
            "dim_site": " × ".join(f"{x:g}" for x in d) if all(d) else "",
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
       "Comprimento estimado (cm)", "Largura estimada (cm)", "Altura estimada (cm)", "Origem das dimensões",
       "Comprimento real (cm)", "Largura real (cm)", "Altura real (cm)",
       "Volume a usar (cm³)", "Peso cubado aéreo (g)", "Formato (tipo de embalagem)", "Código de barras", "Dimensões no Shopify hoje (cm)", "Conferir (por quê)"]
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
               x["c"], x["l"], x["a"], x["dim_origem"], None, None, None,
               f'=IF(AND(U{n}<>"",V{n}<>"",W{n}<>""),U{n}*V{n}*W{n},IF(Q{n}<>"",Q{n}*R{n}*S{n},""))',
               f'=IF(X{n}<>"",X{n}/6,"")', x["classe"], x["barcode"], x["dim_site"], "; ".join(CONF.get(x["sku"], []))])

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
for col in ("X", "Y"):
    for r in range(2, ult + 1):
        ws[f"{col}{r}"].number_format = '#,##0'
for col in ("Q", "R", "S"):
    for r in range(2, ult + 1):
        ws[f"{col}{r}"].number_format = '0.0'
for col in ("K", "L", "N", "O"):
    for r in range(2, ult + 1):
        ws[f"{col}{r}"].number_format = '#,##0'

larg = [7, 10, 16, 52, 14, 14, 30, 16, 10, 10, 11, 11, 30, 10, 10, 26, 11, 11, 11, 34, 11, 11, 11, 11, 11, 16, 16, 16, 24]
for i, w in enumerate(larg, 1):
    ws.column_dimensions[get_column_letter(i)].width = w
ws.row_dimensions[1].height = 42
ws.freeze_panes = "E2"
ws.auto_filter.ref = f"A1:AC{ult}"
ws["L1"].comment = Comment("Estimativa: site oficial da marca → lojas de varejo (Soko Glam, Ohlolly) → tamanho × 1,76 g por ml/g (mediana dos produtos com peso oficial). Ver coluna M.", "OMG")
ws["N1"].comment = Comment("Preencher com o peso do produto pesado na embalagem (balança de 1 g), em gramas.", "OMG")
ws["Q1"].comment = Comment("Estimativa: medida real → planilha do fornecedor (unidade) → caixa master ÷ quantidade → tipo de embalagem e conteúdo (ml/g), calibrado com as medidas reais. Ver coluna T.", "OMG")
ws["Y1"].comment = Comment("Peso cubado do frete aéreo = C × L × A ÷ 6.000 (em kg) = volume em cm³ ÷ 6 (em g). O frete cobra o maior entre o peso real e o cubado.", "OMG")
ws["AB1"].comment = Comment("Valor que está hoje no Shopify: quase todos 8 × 22 × 10 cm, preenchido em massa (não é medida real).", "OMG")
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
origens = [("pesado / medida real", "pesado (real)"), ("medida real (enviada)", "medida real*"), ("planilha do fornecedor", "fornecedor*"),
           ("site oficial da marca", "site oficial*"), ("lojas de varejo", "varejo*"), ("ajuste manual", "ajuste manual*"), ("estimado por tipo de embalagem", "estimado por tipo*")]
for i, (rot, crit) in enumerate(origens, start=4):
    rs.append([rot, f'=COUNTIFS(Produtos!$P$2:$P${ult},"{crit}",Produtos!$A$2:$A${ult},"Sim")', f'=COUNTIF(Produtos!$P$2:$P${ult},"{crit}")'])
t = 4 + len(origens)
rs.append(["Total", f"=SUM(B4:B{t-1})", f"=SUM(C4:C{t-1})"])
rs.append([])
rs.append(["Origem das dimensões", "Lote 1 (SKUs)", "Todos (SKUs)"])
d0 = t + 3
dims_o = [("medida real", "medida real*"), ("fornecedor: unidade", "fornecedor*(unidade)"), ("fornecedor: caixa master ÷ quantidade", "fornecedor*aproximado)"),
          ("ajuste manual", "ajuste manual*"), ("estimado pelo peso do kit", "estimado pelo peso*"), ("estimado por tipo de embalagem", "estimado por tipo*")]
for i, (rot, crit) in enumerate(dims_o, start=d0):
    rs.append([rot, f'=COUNTIFS(Produtos!$T$2:$T${ult},"{crit}",Produtos!$A$2:$A${ult},"Sim")', f'=COUNTIF(Produtos!$T$2:$T${ult},"{crit}")'])
t2 = d0 + len(dims_o)
rs.append(["Total", f"=SUM(B{d0}:B{t2-1})", f"=SUM(C{d0}:C{t2-1})"])
rs.append([])
rs.append(["Dimensões reais preenchidas", f'=COUNTIFS(Produtos!$U$2:$U${ult},"<>",Produtos!$A$2:$A${ult},"Sim")', f'=COUNTIF(Produtos!$U$2:$U${ult},"<>")'])
for row in rs.iter_rows(min_row=2, max_row=t2 + 2):
    for c in row:
        c.font = Font(name=F, size=10, bold=(c.row in (3, t, d0 - 1, t2)))
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
    ("• Comprimento, largura e altura reais (cm): meça a caixinha (ou o frasco, se vier sem caixa). Ex.: 4,5 · 4,5 · 14", False),
    ("Quando o real é preenchido, 'Peso a usar' e 'Volume a usar' passam a usá-lo.", False),
    ("", False),
    ("De onde vêm as estimativas (colunas M e T), da mais confiável para a menos:", True),
    ("1. medida real: medida enviada pela equipe (hoje: Zero Pore Pad 2.0);", False),
    ("2. planilha do fornecedor (unidade): C × L × A e peso informados pelo fabricante (Biodance, numbuzin, Unove, Growus, CFC, Purito, BoJ…);", False),
    ("3. planilha do fornecedor (caixa master ÷ quantidade): volume aproximado, um pouco maior que o real porque inclui a folga da caixa (VT, CLIO, BoJ);", False),
    ("4. site oficial da marca / lojas de varejo: só peso; quando o número não fazia sentido para o tamanho do produto, foi descartado (anotado na coluna M);", False),
    ("5. estimado por tipo de embalagem: formato típico (frasco de sérum, pote de creme, tubo, cushion, máscara…) ajustado ao conteúdo em ml/g e calibrado com as medidas reais acima. A coluna Z mostra o formato usado.", False),
    ("   'tamanho típico' = o produto não informa ml/g; foi usado o tamanho comum daquele tipo (menos confiável).", False),
    ("", False),
    ("Peso cubado (coluna Y): no frete aéreo cobra-se o maior entre o peso real e C × L × A ÷ 6.000. Em cosmético o peso real quase sempre é maior.", False),
    ("Aba 'Para conferir': SKUs com número suspeito, em ordem de prioridade (1 = mais grave). Lote 1 primeiro.", False),
    ("Aba 'Para o Keepa': SKUs do lote 1 que ainda dependem de estimativa, com código de barras quando o fornecedor informou. É a fila da próxima etapa.", False),
    ("Fontes: exportação do Shopify (24/10/2026), planilhas dos fornecedores (pasta OMG Fornecedores), sites oficiais das marcas e lojas de varejo (robô do ERP, 25/10/2026).", False),
]
for i, (t_, b) in enumerate(txt, 1):
    cu.cell(row=i, column=1, value=t_).font = Font(name=F, size=11 if b else 10, bold=b)
cu.column_dimensions["A"].width = 120

PRIO = ["pesado demais", "leve demais", "peso acima", "peso do site oficial descartado", "caixa master", "kit", "o produto não informa"]
cf = wb.create_sheet("Para conferir")
cf.append(["Prioridade", "Lote 1", "SKU", "Marca", "Produto", "Variante", "Peso a usar (g)", "C × L × A (cm)", "Por quê"])
for c in cf[1]:
    c.font = Font(name=F, bold=True, color="FFFFFF"); c.fill = PatternFill("solid", start_color="D61F6E")
lst = []
for x in linhas:
    mot = CONF.get(x["sku"])
    if not mot:
        continue
    pr = min(next((i for i, p_ in enumerate(PRIO) if m_.startswith(p_)), 9) for m_ in mot) + 1
    lst.append((x["lote"] != "Sim", pr, x["marca"], x["produto"], x))
for _, pr, _, _, x in sorted(lst, key=lambda t: t[:4]):
    dims_ = " × ".join(f"{v:g}" for v in (x["c"], x["l"], x["a"])) if x["c"] else ""
    cf.append([pr, x["lote"], x["sku"], x["marca"], x["produto"], x["variante"], x["peso_est"], dims_, "; ".join(CONF[x["sku"]])])
for row in cf.iter_rows(min_row=2):
    for c in row:
        c.font = Font(name=F, size=10)
for i, w in enumerate([10, 7, 14, 16, 60, 16, 12, 18, 80], 1):
    cf.column_dimensions[get_column_letter(i)].width = w
cf.freeze_panes = "A2"
cf.auto_filter.ref = f"A1:I{cf.max_row}"
kp = wb.create_sheet("Para o Keepa")
kp.append(["SKU", "Marca", "Produto", "Variante", "Tamanho", "Código de barras", "Origem das dimensões hoje"])
for c in kp[1]:
    c.font = Font(name=F, bold=True, color="FFFFFF"); c.fill = PatternFill("solid", start_color="4A1D45")
for x in linhas:
    if x["lote"] == "Sim" and x["dim_origem"].startswith("estimado"):
        kp.append([x["sku"], x["marca"], x["produto"], x["variante"], x["tamanho"], x["barcode"], x["dim_origem"]])
for row in kp.iter_rows(min_row=2):
    for c in row:
        c.font = Font(name=F, size=10)
for i, w in enumerate([14, 16, 60, 16, 10, 16, 40], 1):
    kp.column_dimensions[get_column_letter(i)].width = w
kp.freeze_panes = "A2"
wb.move_sheet("Como usar", offset=-3)
wb.active = 1
wb.save(saida)
print("linhas:", len(linhas), "lote 1:", sum(1 for x in linhas if x["lote"] == "Sim"))
