# Políticas da OMG — onde colar e o que falta

Rascunho para revisão. **Antes de publicar, peça a revisão final aos advogados (Neco e Simone).**

## Onde cada texto vai no Shopify
| Arquivo (site/politicas/) | Onde colar no Shopify | URL pública |
|---|---|---|
| `termos-de-uso.html` | Configurações → Políticas → **Termos de serviço** | /policies/terms-of-service |
| `privacidade.html` | Configurações → Políticas → **Política de privacidade** | /policies/privacy-policy |
| `trocas-devolucoes-reembolsos.html` | Configurações → Políticas → **Política de reembolso** (ou "Devoluções e reembolsos") | /policies/refund-policy |
| `entrega-frete.html` | Configurações → Políticas → **Política de frete** | /policies/shipping-policy |
| `empresa-contato.html` | Configurações → Políticas → **Informações de contato** | /policies/contact-information |
| `cookies.html` | Loja virtual → Páginas → **nova página "Cookies"** (handle `cookies`) | /pages/cookies |
| `rodape-empresa.html` | Tema → Rodapé → bloco **HTML personalizado / Texto** | todas as páginas |

Como colar: no editor de cada política, clique no botão **"<>" (mostrar HTML)** e cole o conteúdo do arquivo inteiro.

**Menu do rodapé:** criar o menu "Institucional" com: Termos de Uso · Privacidade · Trocas e Devoluções · Entrega e Frete · Cookies · Central de Ajuda · Fale conosco.

**Banner de cookies:** ativar em Configurações → Privacidade do cliente → **Banner de cookies** (região Brasil), com opções aceitar/recusar/personalizar.

**Checkout:** mostrar link para Termos e Privacidade no checkout (Configurações → Checkout) e exigir a caixa "Li e aceito os Termos".

## Ainda pendente
- **[A VERIFICAR #V8] Produto claramente consumido no arrependimento** — confirmar com advogado se cabe abatimento proporcional (nunca recusa prévia).
- **Benefício por avaliação (D16)** — nos Termos aparece como "serão anunciados em breve"; na Central de Ajuda continua marcado como pendente.
- **[A CONFIRMAR CEP] Endereço de devolução** — Rua Engenheiro Albert Leimer, 426 – Taboão, Guarulhos – SP (centro de devoluções da Mile, tirado da etiqueta). Confirmar o CEP com a Mile; o CEP **não** aparece no site, vai na etiqueta de devolução enviada pelo atendimento.

## Decisões do Tae aplicadas (24/10/2026)
- **Identificação da empresa:** só "MPOEMA INC — Los Angeles, Califórnia, EUA". **Sem número de registro (TIN/EIN)** e sem endereço de rua em nenhum texto público, por decisão do Tae (dado sensível nos EUA). Uso interno: TIN US933093849.
- **Encarregado de dados (DPO):** info.br@ohmygirl.com.br.
- **Fidelidade:** 10 pontos por R$ 1; resgate 1.000 pontos = R$ 1 (≈1% de volta). Categorias com vantagens maiores serão anunciadas depois.
- **Devolução:** destino Mile em Guarulhos, sempre com contato prévio e autorização/etiqueta da OMG, frete pago pela OMG.

## Pontos para o advogado olhar com atenção
1. **Momento do estorno no arrependimento.** O Decreto 7.962, art. 5º, §3º manda comunicar a administradora do cartão "imediatamente". O texto (igual à Central de Ajuda) diz que comunicamos **assim que a devolução é postada**. Avaliar se deve ser já na manifestação do arrependimento.
2. **Reentrega cobrada** quando a falha é da cliente: informada antes da compra (CDC, art. 6º, III). Conferir redação.
3. **Transferência internacional (LGPD, art. 33)**: base em execução de contrato (art. 33, IX c/c art. 7º, V) e garantias contratuais (art. 33, II — cláusulas-padrão da ANPD). Conferir se é preciso adotar as cláusulas-padrão da ANPD com os parceiros.
4. **Prazos de guarda** ("em geral até 5 anos"): ajustar aos prazos fiscais/aduaneiros aplicáveis à MPOEMA INC.
5. **Foro**: domicílio da consumidora (CDC, art. 101, I) — mantido assim de propósito.
6. **Endereço e registro da empresa (risco).** O Decreto 7.962/2013, art. 2º, I e II pede "nome empresarial e número de inscrição" e "endereço físico e eletrônico" em local de destaque. O site mostra só cidade/estado/país e não mostra o número de registro, por decisão do Tae. Há precedente de multa do Procon-SP (WePink) em que a falta de endereço e contato pesou. Avaliar se basta cidade/estado/país + e-mail + WhatsApp ou se é preciso o endereço completo (pode ser o de um agente/escritório).
7. **Erro de preço (Termos, item 8).** Redigido para valer só em erro **evidente e grosseiro**, com aviso rápido e estorno integral, seguindo o STJ (REsp 1.794.991, 3ª Turma, 2020: não há falha quando o erro grosseiro é logo identificado, a cobrança é cancelada e o cliente avisado; o CDC se orienta pela boa-fé). Erro não evidente obriga a cumprir o preço (CDC, arts. 30 e 35). Conferir a redação.
8. **Licença de uso de avaliações e fotos (Termos, item 18).** Gratuita, não exclusiva, com direito de pedir remoção — conferir com a Lei 9.610/1998 (direitos autorais) e direito de imagem.
9. **Decisão automatizada antifraude (Privacidade, item 8).** Direito de revisão (LGPD, art. 20) — conferir se a revisão humana é viável na operação.

## Referências legais usadas
- Código de Defesa do Consumidor — Lei nº 8.078/1990 (arts. 6º, 18, 26, 30, 49, 51, 101): https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm
- Decreto nº 7.962/2013 (comércio eletrônico; arts. 2º, 4º e 5º): https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/decreto/d7962.htm
- LGPD — Lei nº 13.709/2018 (arts. 7º, 14, 18, 33, 41): https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm
- Programa Remessa Conforme — IN RFB nº 1.737/2017 (arts. 20-B a 20-D) e Portaria Coana nº 130/2023: https://www.gov.br/receitafederal (busca "Remessa Conforme") e https://normas.receita.fazenda.gov.br
- Procon-MG × Shein (set/2026), arrependimento de cosméticos com lacre removido — ver notas em docs/ajuda/DECISOES.md.
- STJ, REsp 1.794.991 (erro grosseiro de preço): https://www.conjur.com.br/2020-mai-12/cancelamento-compra-erro-grosseiro-nao-falha-stj/
- Estrutura de referência: Condições Gerais de Utilização e de Venda da Shein (versão em português): https://m.shein.com/pt/product/article/399

## Como editar
Edite os arquivos `docs/politicas/NN-*.md` e rode `python3 tools/politicas/gerar.py`. O HTML em `site/politicas/` é regenerado.
