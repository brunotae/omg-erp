# Ajustes no site · 29/10/2026 (lista de erros da Isa, 28/10)

## Produtos
- **103 duplicados tirados do ar** (rascunho, reversível). Era o mesmo produto em 2 páginas; ficou a versão de nome completo.
  Lista: `site/duplicados_rascunho_2026-10-29.json`. Inclui:
  - o Relief Sun Aqua-Fresh "-1", com a página quebrada que a Isa achou;
  - o "Kit Rotina Premium PDRN", com o texto diferente que a Isa achou.
- **Categorias** (etiquetas `cat-*`, que alimentam os menus):
  - 166 kits de skincare estavam em `cat-maquiagem`. Foram para `cat-rosto`; os 4 kits Peptide-132 de cabelo foram para `cat-cabelo`.
  - Ficaram em Maquiagem só os kits de maquiagem: Kit Glow Base, Lip Trio, Cushion Trial Kits, Waterism Tint Set, Prism Highlighter e Perfect Setting Duo.
  - Os protetores solares (avulsos e kits) ganharam também `cat-protetor-solar`: o menu Protetor Solar passou de 15 para 71 produtos. A etiqueta antiga `cat:protetor-solar` impedia o Shopify de aceitar a nova, por isso foi trocada.
  - Os produtos sem categoria ganharam uma. Acessórios como nécessaires, bolsa e adesivos continuam só em "Todos os produtos".
- 1 produto com a marca "Biodance" virou "BIODANCE".

## Tema e menus
- Botão flutuante de WhatsApp: trocado o número antigo (94588-4562) por **99304-9122**. As páginas e políticas já usavam o novo.
- Menu da conta: "Orders" virou **Meus pedidos** e "Profile" virou **Meu perfil**.
- Rodapé › Marcas: "Abib", sem nenhum produto à venda, deu lugar a **mixsoon**.
- Home › carrossel de marcas: tinha marcas que não vendemos (aromatica, numbuzin, VT…). Agora mostra round-lab, centellian-24, biodance, dr-melaxin, celimax e arencia.
- Página Marcas: mostra as marcas com produto à venda. Quando entrar marca nova, use ERP › Raio-X › (marca) › **Publicar marca no site** (v18): monta a página sozinha, copia a imagem de `site/marcas/cenas/` e gera as fichas da Bomi (tabela `bomi_fichas_extra`).
- Banner "KAINE": era a demonstração do espaço de parceiro, já desligada em 28/10.

## Bomi
- Só indica produtos à venda: são 1.300 fichas. Antes eram 1.439 e incluíam duplicados e itens fora do lote 1.
