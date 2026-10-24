# Parametrização diária · Manifesto da Mile (serve também para a Coreia)

Modelo da Mile: planilha "Manifest" (30 colunas). Uma linha por pacote/item, com cabeçalho por embarque.

## 1. Cabeçalho (1 por embarque / AWB)
| Campo | Fonte |
|---|---|
| Manifest # | ERP · nº do embarque (EMB-001) |
| Date Manifest | ERP |
| Shipper | Fixo · La Belle + endereço em Seul |
| Consignee | Fixo · MILE EXPRESS |
| Country of Destination | Fixo · BRAZIL GRU |
| Airlines | Skyroad → ERP (embarque) |
| AWB | Skyroad → ERP (embarque) |
| Total Weight (kg) | ERP calcula |
| Total Items | ERP calcula |
| Manifest Status | Fixo · MANIFEST READY |

## 2. Por venda (cliente)
| Coluna | Fonte |
|---|---|
| AWB, SHIPPER | Do cabeçalho |
| CONSIGNEE | Pedido Shopify · nome completo |
| DNI | CPF (checkout) |
| ADDRESS | Pedido Shopify · endereço completo |
| ZIP CODE | Pedido Shopify · CEP |
| CITY / STATE | Pedido Shopify |
| PHONE | Pedido Shopify · com DDD |
| FREIGHT U$ | **Regra a definir** |
| INSURANCE | Fixo · 0 |
| SERVICE_TYPE | Fixo · DDP |
| INVOICE URL | ERP gera |
| LOCAL TRACKING PROVIDER, EXTERNAL TRACKING, PROVIDER NAME, COPA ID, COPA NAME | Mile |

## 3. Por produto (item)
| Coluna | Fonte |
|---|---|
| DESCRIPTION | Catálogo · nome em inglês |
| HS | Catálogo · código HS (ex.: 3304.99, 3307.90) |
| QUANTITY | Pedido |
| WEIGHT / UNIT WEIGHT | Catálogo · peso em KG |
| VALUE U$ FCA | **Regra a definir** |
| LENGTH / WIDTH / HEIGHT (cm), DIMEN UNIT | Catálogo · dimensões |

## 4. Do pacote (Skyroad)
BAG, BAG TAG.

## Regras em aberto (decidir com Clarice / Daolu)
1. VALUE U$ FCA: preço pago pela cliente sem impostos em US$, ou custo?
2. FREIGHT U$: frete cobrado da cliente em US$, ou custo Mile por pacote?
3. Venda com vários itens: uma linha por item ou uma por pacote?

## Faltam no ERP
- Catálogo: nome em inglês, HS, dimensões (peso já existe)
- Venda: endereço completo, CEP, telefone separados (vêm do Shopify)
