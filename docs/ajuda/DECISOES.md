# Decisões pendentes da Central de Ajuda

Atualizado com as respostas do Tae (24/10/2026). Ficam abaixo só os itens ainda abertos.

Cada item aparece no texto como [A DEFINIR #Dn] ou [A VERIFICAR #Vn]. Decida, edite `tools/ajuda/conteudo.py` e rode `python3 tools/ajuda/gerar.py`.

## A DEFINIR (decisões de negócio)

**D16. Desconto por avaliação com foto/vídeo**  
Sugestão: Em discussão com o Tae (benefício para quem é fiel × para quem chega).  
Aparece em (1): Avaliações e conteúdo › Ganho desconto por avaliar com foto ou vídeo?

**D29. Forma de compensação quando o pedido passa do prazo (D27)**  
Sugestão: Ex.: cupom de 10% na próxima compra ou pontos de fidelidade extras; além do reembolso, se a cliente preferir cancelar.  
Aparece em (0): —

## A VERIFICAR (fatos a confirmar)

**V8. Produto claramente usado/consumido devolvido no prazo de arrependimento**  
Como: A OMG aceita o arrependimento em 7 dias, inclusive com embalagem aberta (o Procon-MG multou a Shein em set/2026 por restringir o arrependimento de cosméticos com lacre removido). Confirmar com advogado se, em casos de uso evidente (produto consumido), cabe abatimento proporcional — nunca recusar de antemão.  
Aparece em (0): —

## Notas legais (base das respostas)

- **Direito de arrependimento — CDC, art. 49**: 7 dias a contar do recebimento, sem justificativa; devolução **imediata e integral** dos valores pagos, **inclusive frete** (e, na OMG, impostos). Fonte: [Lei 8.078/1990](https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm); [Idec](https://idec.org.br/dicas-e-direitos/direito-do-consumidor-devolucao).
- **Decreto 7.962/2013 (comércio eletrônico)**: art. 2º exige nome empresarial, nº de inscrição e **endereço físico e eletrônico** em destaque no site (ver D31); art. 4º, parágrafo único: responder às demandas em **até 5 dias**; art. 5º: informar os meios de arrependimento, aceitar o arrependimento pelo **mesmo canal** da compra, **confirmar imediatamente** o recebimento e **comunicar imediatamente a administradora do cartão** para não lançar ou estornar a cobrança. Fonte: [Planalto](https://www.planalto.gov.br/CCivil_03/_Ato2011-2014/2013/Decreto/D7962.htm).
- **Produto aberto/cosméticos**: a Shein (In Glow Brasil) foi multada pelo **Procon-MG em 10/09/2026** (R$ 171.666,67) por restringir o arrependimento em categorias como beleza, roupas íntimas e **cosméticos com lacre removido** — a decisão diz que razões de higiene não justificam proibição prévia por categoria. Por isso a OMG **não** copia a regra da Shein de não aceitar devolução de cosméticos. Fonte: [decisão Procon-MG](https://www.mpmg.mp.br/data/files/7D/97/6F/30/CF8C0A10E78A2B0AAAA8F9C2/Decisao%20administrativa_CDC_Verificacao%20de%20restricao%20ao%20exercicio%20do%20direito%20de%20arrependimento%20do%20consumidor_ProconMG_10%20set%202026.pdf).
- **Vício aparente — CDC, art. 26, I**: 30 dias para reclamar de produto **não durável** (cosméticos), contados da entrega. **Art. 18**: o fornecedor tem até 30 dias para sanar; se não sanar, a cliente escolhe troca, reembolso ou abatimento. Por isso o prazo para avisar avaria/item errado/faltando é **30 dias**, não 7. A orientação de recusar pacote com lacre rompido é recomendação, **nunca condição** para o direito.
- **Reembolso após análise (D11)**: em defeito/avaria a análise é legítima (art. 18). No **arrependimento**, o Decreto 7.962 manda comunicar a administradora **imediatamente** — por isso o texto diz que o estorno é solicitado assim que a devolução é postada, sem esperar análise longa.
- **Reentrega por culpa da cliente (D26)**: cobrar a nova entrega é aceitável quando a falha for da cliente (endereço errado/incompleto ou ausência após as tentativas) e a regra estiver informada antes da compra (CDC, art. 6º, III). Se a falha for da transportadora, a OMG reenvia sem custo.
- **Cancelamento até o embarque (D7)**: compatível com a lei, porque é mais favorável do que o mínimo legal; depois do embarque, a cliente mantém o arrependimento de 7 dias após receber (ou pode recusar a entrega). Ref.: Procon-SP multou a WePink (cosméticos) em R$ 1,57 mi por atrasos, pedidos incompletos, reembolsos lentos, falha no arrependimento e falta de endereço/contato no site ([Diário do Pará](https://diariodopara.com.br/noticias/wepink-de-virginia-fonseca-e-multada-em-mais-de-r-15-milhao/)).

## Notas internas para o Tae (não vão para o site)

- **Compra como visitante e fraude (D21)**: o Shopify permite checkout sem conta. Com Shopify Payments, **o chargeback é do lojista**: o valor contestado + taxa são descontados do próximo repasse; o Shopify diz não ser responsável por chargebacks ([Shopify — Chargebacks](https://help.shopify.com/en/manual/payments/chargebacks)). A loja tem **análise de fraude** (risco baixo/médio/alto e recomendação de cancelar; recomendações exigem plano Grow ou Shopify Payments — a OMG tem os dois) ([Shopify — Fraud analysis](https://help.shopify.com/en/manual/fulfillment/managing-orders/protecting-orders/fraud-analysis)). **Rotina sugerida**: antes do corte das 18h, revisar pedidos de risco médio/alto e cancelar/reembolsar os suspeitos antes de comprar na Coreia; pedido de alto risco não entra na lista do dia. Exigir conta não reduz fraude de forma relevante; o 3D Secure do banco (quando acionado) ajuda.
- **Cartão salvo (V7)**: o Shopify Payments processa o cartão; com o **Shop Pay**, a cliente pode optar por salvar e-mail, cartão e endereço, guardados nos **servidores do Shopify com padrão PCI** — a loja só recebe os dados de entrega e cobrança do pedido ([Shopify — Shop Pay](https://help.shopify.com/manual/payments/shop-pay)).
- **Câmbio (V4)**: decidido PTAX do dia anterior. Não consegui confirmar o que Shein, Amazon e AliExpress dizem nas centrais deles (páginas carregam só por app/JS); vale olhar com a Clarice/ShipSmart se a regra deles é diferente.