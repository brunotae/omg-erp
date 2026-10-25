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
- **[A DEFINIR #D31] Endereço físico da MPOEMA INC** — obrigatório (Decreto 7.962/2013, art. 2º). Aparece em: Termos, Privacidade, Empresa e contato, rodapé.
- **[A DEFINIR] Encarregado de dados (DPO)** — nome e contato (LGPD, art. 41). Enquanto isso, usar info.br@ohmygirl.com.br.
- **[A DEFINIR #D30] Resgate dos pontos de fidelidade** — valor, validade, mínimo.
- **[A VERIFICAR #V8] Produto claramente consumido no arrependimento** — confirmar com advogado se cabe abatimento proporcional (nunca recusa prévia).
- **[A DEFINIR #D28] Endereço de devolução da parceira em SP** — uso interno; a cliente recebe no atendimento.

## Pontos para o advogado olhar com atenção
1. **Momento do estorno no arrependimento.** O Decreto 7.962, art. 5º, §3º manda comunicar a administradora do cartão "imediatamente". O texto (igual à Central de Ajuda) diz que comunicamos **assim que a devolução é postada**. Avaliar se deve ser já na manifestação do arrependimento.
2. **Reentrega cobrada** quando a falha é da cliente: informada antes da compra (CDC, art. 6º, III). Conferir redação.
3. **Transferência internacional (LGPD, art. 33)**: base em execução de contrato (art. 33, IX c/c art. 7º, V) e garantias contratuais (art. 33, II — cláusulas-padrão da ANPD). Conferir se é preciso adotar as cláusulas-padrão da ANPD com os parceiros.
4. **Prazos de guarda** ("em geral até 5 anos"): ajustar aos prazos fiscais/aduaneiros aplicáveis à MPOEMA INC.
5. **Foro**: domicílio da consumidora (CDC, art. 101, I) — mantido assim de propósito.

## Referências legais usadas
- Código de Defesa do Consumidor — Lei nº 8.078/1990 (arts. 6º, 18, 26, 30, 49, 51, 101): https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm
- Decreto nº 7.962/2013 (comércio eletrônico; arts. 2º, 4º e 5º): https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/decreto/d7962.htm
- LGPD — Lei nº 13.709/2018 (arts. 7º, 14, 18, 33, 41): https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm
- Programa Remessa Conforme — IN RFB nº 1.737/2017 (arts. 20-B a 20-D) e Portaria Coana nº 130/2023: https://www.gov.br/receitafederal (busca "Remessa Conforme") e https://normas.receita.fazenda.gov.br
- Procon-MG × Shein (set/2026), arrependimento de cosméticos com lacre removido — ver notas em docs/ajuda/DECISOES.md.

## Como editar
Edite os arquivos `docs/politicas/NN-*.md` e rode `python3 tools/politicas/gerar.py`. O HTML em `site/politicas/` é regenerado.
