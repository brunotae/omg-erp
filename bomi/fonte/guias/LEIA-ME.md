# Guias de conteúdo da Bomi

Cada arquivo `*.json` desta pasta é uma lista de entradas da base de conhecimento da Bomi (assistente virtual da OMG, loja online de cosméticos coreanos originais que vende para o Brasil pelo Remessa Conforme). O `bomi/fonte/gerar.py` junta tudo em `bomi/base-conhecimento.json`.

## Formato de cada entrada

```json
{
  "id": "ativo-niacinamida",
  "categoria": "Ingredientes",
  "pergunta": "O que é niacinamida e para que serve?",
  "gatilhos": ["niacinamida serve pra que", "niacinamida é bom pra mancha?", "posso usar niacinamida com vitamina c", "..."],
  "resposta_chat": "até ~30 palavras, tom de amiga que entende de skincare",
  "resposta_chat_alt": "outra versão curta, mesmo fato",
  "escalar_humano": false,
  "quando_escalar": "",
  "notas_internas": "o fato completo e preciso, em 3 a 8 frases, que a Bomi usa como referência (pode ter detalhes que não cabem na resposta curta)",
  "links": []
}
```

- `id`: único, minúsculo, com o prefixo do arquivo (`ativo-`, `rotina-`, `termo-`, `tom-`, `validade-`, `original-`, `objecao-`, `marca-`).
- `gatilhos`: 6 a 12 jeitos REAIS de a cliente perguntar no WhatsApp: com e sem acento, abreviações (vc, pq, q, oq), erros comuns e às vezes em inglês. Sem duplicar.
- `resposta_chat`: **1 ou 2 frases, no máximo ~30 palavras**, português do Brasil, "você", no máximo 1 emoji (💗 ✨ 😊). Termina com um próximo passo ou pergunta curta quando fizer sentido.

## Regras obrigatórias (valem para todo texto)

1. **Nada de bastidores.** Nunca citar parceiros internos, fornecedores, horários de corte, listas internas, documentos de carga, nem sugerir que a OMG compra o produto depois da venda. Os produtos saem do **nosso estoque oficial na Coreia do Sul**, são originais de marcas e distribuidores oficiais.
2. **Nada de promessa de resultado ou linguagem de medicamento**: não dizer "cura", "trata", "elimina", "tira manchas", "anti-acne". Use "ajuda a", "indicado para", "deixa a pele com aparência de". Cosmético não trata doença.
3. **Saúde**: gravidez, amamentação, isotretinoína, dermatite, rosácea, acne grave, alergia ou reação → orientar procurar dermatologista/médico; nunca diagnosticar. Ativos fortes (retinol, ácidos) sempre com aviso de introduzir aos poucos, teste numa área pequena e protetor solar de dia.
4. **Não inventar** preço, estoque, cupom, prazo, regra da loja nem afirmar que a OMG vende um produto específico. Para produto específico, a Bomi usa a ferramenta `buscar_produto`; nas suas respostas, diga algo como "posso procurar opções no nosso catálogo".
5. **Fatos verificados.** Para fatos técnicos (ingredientes, tons de marcas, datas em coreano, história das marcas), confira em fontes confiáveis (site oficial da marca, artigos de dermatologia, INCI). Se não tiver certeza, não afirme.
6. Não falar mal de outras lojas ou marcas.
7. Fatos da loja que você pode usar: só cartão de crédito à vista; sem Pix/boleto/parcelamento; impostos (II + ICMS) calculados e pagos no checkout, nada na entrega; até US$ 50 o II é zero; prazo até 15 dias úteis para capitais; rastreio por e-mail; arrependimento em 7 dias após receber com frete de devolução pago pela OMG e reembolso total incluindo impostos; defeito/avaria/item errado em até 30 dias; vendedora MPOEMA INC (EUA, certificada no Remessa Conforme); sem frete grátis, mas há cupons (@omg_ohmygirlbr e newsletter); limite de 6 unidades do mesmo produto e US$ 3.000 por pedido; atendimento humano WhatsApp +55 11 99304-9122 e info.br@ohmygirl.com.br, seg–sex 9h–18h.

Depois de escrever, valide: `python3 -c "import json;d=json.load(open('ARQUIVO'));print(len(d))"`.
