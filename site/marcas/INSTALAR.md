# Página "Marcas" · como instalar (quarta-feira)

Grade de quadrados, um por marca. 17 marcas têm fotos oficiais dos produtos-estrela no fundo; as outras 45 têm o padrão bojagi da OMG. O logo oficial (ou o nome) fica num cartão branco no centro. Clicar no quadrado abre os produtos daquela marca.
Prévia: `site/marcas/preview.html` (abre no navegador).

## O que tem aqui
| Arquivo | Para quê |
|---|---|
| `tiles/*.webp` | **62 quadrados finais 800×800** (é isso que vai para o site; ~650 KB no total) |
| `logos/*.png` | Logos de origem (42 oficiais + 20 só com o nome), usados para montar os quadrados |
| `fontes_fundos.csv` | De onde veio cada foto de fundo (site oficial da marca) |
| `sections/omg-marcas.liquid` | Seção do tema que desenha a grade |
| `templates/page.marcas.json` | Modelo de página já com as 62 marcas em ordem (mais produtos primeiro) |
| `fontes.csv` | De onde veio cada logo (site oficial, link, data) |
| `marcas.json` | Lista de marcas com nº de produtos |

## Passo a passo no Shopify
1. **Enviar os quadrados:** Conteúdo → Arquivos → **Fazer upload** → selecione todos os arquivos de `site/marcas/tiles/` de uma vez. Os nomes precisam ficar iguais (ex.: `cosrx.webp`).
2. **Criar a seção:** Loja virtual → Temas → (tema atual) **⋯ → Editar código** → pasta **sections** → **Adicionar nova seção** → nome `omg-marcas` → apague o conteúdo e cole o de `sections/omg-marcas.liquid` → Salvar.
3. **Criar o modelo:** na mesma tela, pasta **templates** → **Adicionar novo modelo** → tipo **page**, nome `marcas` → apague o conteúdo e cole o de `templates/page.marcas.json` → Salvar.
4. **Criar a página:** Conteúdo → Páginas → **Adicionar página** → Título **Marcas** → em *Modelo do tema* escolha **marcas** → Salvar. Endereço: `/pages/marcas`.
5. **Menu:** Conteúdo → Menus → Menu principal → item **Marcas** → link **Páginas → Marcas** → Salvar.
6. **Conferir:** abra `ohmygirl.com.br/pages/marcas`, clique em 3 marcas e veja se abrem os produtos certos.

## Manutenção (sem código)
No editor do tema (Personalizar → página Marcas): arrastar marcas para mudar a ordem, adicionar ou remover marca, trocar a imagem do quadrado (campo *Imagem do quadrado*), mudar título e texto.
Marca nova: gere o quadrado com `python3 tools/marcas/compor_tiles.py` (ou envie uma imagem 800×800), suba `nome-da-marca.webp` em Arquivos e adicione um bloco *Marca* com o nome igual ao **Fornecedor** do produto no Shopify.

## Observações
- O link de cada quadrado usa a coleção automática do Shopify por fornecedor (`/collections/vendors?q=Marca`). Por isso o **Fornecedor** dos produtos precisa estar certo (39 produtos ainda estão como "Mundo Beleza").
- Só aparecem produtos **ativos**. Marca sem produto ativo abre uma página vazia: oculte o bloco até ativar os produtos dela.
- **Uso dos logos:** os logos vêm dos sites oficiais das marcas e servem só para indicar que vendemos produtos originais delas (uso nominativo de marca). Não alterar os logos nem usá-los como se fossem nossos. A lista de origem fica em `fontes.csv`.
- **A conferir:** marcas com quadrado só com o nome (sem site oficial confirmado): AROMATICA, Rom&nd, d'Alba, Dr.G, Dr. Althea, A'pieu, Sungboon Editor, ILSO, WELLAGE, Peripera, Growus, COEVAL, UNOVE, LILY EVE, A'ddict, TS Shampoo, FOR, GYEOL HAUS, ARCANIC, THE KYEOK. Dá para trocar depois pelo logo oficial no editor.

- **Fotos de fundo:** vêm só dos sites oficiais das marcas (lista em `fontes_fundos.csv`), escolhidas à mão: só fotos de produto, sem pessoas nem selos de outras lojas. Para refazer: `python3 tools/marcas/compor_tiles.py` e depois `python3 tools/marcas/gerar_preview.py`.
