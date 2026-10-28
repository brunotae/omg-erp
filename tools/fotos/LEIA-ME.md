# Fotos oficiais: como decidimos

Uma foto oficial só entra no site se passar em **todos** os critérios:

1. **Mesma marca**: a foto vem do site oficial da própria marca.
2. **Mesmo produto**: todas as palavras do nome do nosso produto estão no nome oficial, e o oficial não tem palavra a mais (sérum ≠ creme ≠ pad ≠ máscara ≠ kit).
3. **Mesmo tamanho**: o ml/g/quantidade bate. Se o site oficial não escreve o tamanho, só passa quando a página oficial tem uma versão só.
4. **Único**: se mais de uma página oficial servir, não troca.
5. **Conferência visual**: alguém olha a foto atual e a oficial lado a lado (`folhas/`). Sai quem tiver outro produto, outra quantidade, outra concentração, refil × estojo, kit × unidade, ou selo de brinde ("Free Gift") que não damos.

O que não passa continua com a foto atual. Na dúvida, não troca.

- `regra_rigida.py` → `decisao.json` (critérios 1 a 4)
- `folhas.py` (robô "Fotos - folhas de conferência") → `folhas/*.jpg` (critério 5)
- `decisao_final.json` = resultado depois da conferência visual; o ERP usa no botão "Refazer fila"
- `fora_do_lote1.json` = produtos que estão com foto errada no site e cuja foto antiga não existe mais: ficam fora do lote 1 até ter foto certa
