# Bomi (봄이) · assistente virtual da OMG

A Bomi atende as clientes da OMG no WhatsApp e por e-mail, com o jeito de "a amiga que entende de skincare". Ela responde a partir da mesma base da Central de Ajuda do site. Quando o caso pede uma pessoa, passa para a equipe.

> **Status:** só conteúdo. **Nada está conectado ainda**: nenhum número, nenhuma chave e nenhuma automação ativa.

## O que tem nesta pasta

| Arquivo | Para que serve |
|---|---|
| `persona.md` | Quem é a Bomi: voz, tom, faça/não faça e exemplos. É a referência para qualquer pessoa que for escrever respostas. |
| `system-prompt.md` | O prompt de sistema do modelo de IA, em português. Traz as regras, os fatos fixos, as 4 ferramentas, quando escalar e exemplos. |
| `base-conhecimento.json` | 229 entradas. Cada uma tem: gatilhos (jeitos reais de perguntar), resposta de chat, resposta alternativa, quando escalar e notas internas. |
| `testes/conversas.md` | 40 conversas de teste com personas e critérios de aprovação. |
| `fonte/` | De onde o JSON é gerado. É aqui que se edita (veja abaixo). |

## Como as peças se encaixam

```
Central de Ajuda (tools/ajuda/conteudo.py)
        │  gera
        ▼
docs/ajuda/base-bot.json  ──┐   fatos oficiais (169 perguntas)
bomi/fonte/chat_a..e.py   ──┼─► bomi/fonte/gerar.py ─► bomi/base-conhecimento.json
bomi/fonte/chat_novos.py  ──┘   tom de chat + 60 intenções só do chat

Mensagem da cliente ─► canal (WhatsApp/e-mail) ─► função no servidor
   └─► modelo de IA com system-prompt.md + entradas relevantes da base
         ├─ consultar_pedido   → pedidos (Shopify/ERP)
         ├─ buscar_produto     → catálogo do Shopify
         ├─ transferir_humano  → caixa de atendimento da equipe
         └─ registrar_feedback → tabela de feedback (ERP)
```

**Regra de ouro:** os **fatos** (prazo, imposto, devolução etc.) moram na Central de Ajuda. A pasta `bomi/fonte` só guarda o **jeito de falar**.
- Se uma regra mudar, mude primeiro na Central de Ajuda e depois ajuste a resposta de chat correspondente.

## Como editar

1. **Mudou um fato** (ex.: novo prazo ou nova forma de pagamento):
   - edite `tools/ajuda/conteudo.py` e regenere a Central de Ajuda (como hoje);
   - depois procure o mesmo `id` em `bomi/fonte/chat_*.py` e ajuste o texto de chat.
2. **Quer mudar o tom de uma resposta:** edite só o `chat_*.py` daquele `id`. O formato é `(resposta_chat, resposta_chat_alt, [gatilhos extras])`.
3. **Nova intenção que não existe no site** (ex.: "vocês têm loja física?"): acrescente uma linha em `chat_novos.py`, com um `id` novo (`chat-61`…).
4. **Resolveu um [A DEFINIR]** (resgate de pontos D30, benefício por avaliação D16, endereço da MPOEMA D31):
   - atualize a Central de Ajuda;
   - tire o "confirmo com a equipe" da resposta de chat;
   - ajuste `system-prompt.md`, seção 3.
5. **Regenere o JSON:** `python3 bomi/fonte/gerar.py`. O script avisa se faltar resposta de chat para algum `id` da Central.
6. **Antes de publicar:** rode as 40 conversas de teste e a checagem de termos proibidos (abaixo).

### Checagem de termos proibidos

Nada sobre bastidores pode aparecer para a cliente. Rode:

```bash
grep -rniE "corte|lista do dia|janice|la belle|skyroad|awb|manifesto|compramos|comprad|atendimento@" bomi/ --include=*.json --include=*.md \
  | grep -v "README.md"
grep -rn "18h" bomi/ | grep -v "9h às 18h\|9h–18h\|9h-18h"
```

O resultado esperado é vazio. A única exceção é a palavra "corte" em contexto de cabelo, se algum dia entrar.

## Por que a Bomi diz que é uma IA

A Bomi conversa de forma natural, mas **sempre se apresenta como assistente virtual** e nunca diz que é humana. Os motivos:

- **Confiança.** A OMG vende de fora do país. A cliente já chega desconfiada (golpe, imposto, prazo). Se ela descobre depois que "a Ana" era um robô, a OMG perde exatamente o que mais precisa: credibilidade.
- **Transparência ao consumidor.** O Código de Defesa do Consumidor exige informação clara e proíbe prática enganosa (arts. 6º, III, e 37). Fingir ser pessoa é arriscado nesse sentido. As regras de uso da IA e da Meta também pedem que o usuário saiba quando fala com automação.
- **Escalação limpa.** Quando a cliente sabe que é IA, pedir "uma pessoa" fica natural, e a passagem para a equipe não vira atrito.

*(Isto não é parecer jurídico; para a política final, vale a revisão jurídica que já está sendo feita nos termos do site.)*

## Opções de canal (WhatsApp)

O número **+55 11 94588-4562** é o mesmo que a equipe usa hoje. Seja qual for a opção, é preciso decidir se o número fica **só na API** ou em **coexistência** com o app WhatsApp Business. Com coexistência, a equipe continua usando o app no celular enquanto a Bomi responde pela API. A Meta passou a permitir isso em muitos casos, mas a disponibilidade depende do provedor e do país: **confirmar antes**.

### Opção A · Direto: WhatsApp Cloud API + função no Supabase + API do Claude

**Como funciona:** a Meta entrega cada mensagem a uma Edge Function do Supabase do OMG (como a que já recebe os webhooks do Shopify). A função chama o modelo com o `system-prompt.md`, executa as ferramentas e responde pela Cloud API. Os casos "transferir" vão para uma tabela/caixa no ERP e geram aviso para a equipe.

| Prós | Contras |
|---|---|
| Controle total do texto, das regras e dos dados | É preciso construir a caixa de atendimento humano (ou usar o app em coexistência) |
| Usa o Supabase que já existe; não tem mensalidade de plataforma | Manutenção fica com a gente (logs, falhas, templates) |
| Fácil de ligar ao ERP (pedidos, feedback) | Configuração inicial na Meta é burocrática |

**O que o Tae precisa providenciar:**
- conta no Meta Business Manager, com a **verificação da empresa**: documento da MPOEMA INC ou da empresa que for dona do número, mais o site;
- um app no Meta for Developers com o produto WhatsApp, e o número registrado nele (definir coexistência ou só API);
- um token de acesso permanente (usuário de sistema) e o segredo do app, colados **direto** nos Secrets do Supabase;
- forma de pagamento na Meta (cobrança por conversa ou mensagem, conforme a tabela vigente);
- chave da API da Anthropic com cobrança configurada, também direto nos Secrets;
- modelos de mensagem (templates) aprovados, para quando a OMG precisar escrever primeiro, fora da janela de 24 h.

### Opção B · Plataforma pronta (BSP) com IA: Blip, Zenvia, Respond.io, Gupshup e similares

**Como funciona:** o provedor conecta o número à API e oferece a caixa de atendimento multiagente, o painel e, em geral, um "agente de IA" próprio ou integração com modelos externos. A base e o prompt desta pasta são carregados lá.

| Prós | Contras |
|---|---|
| Caixa de atendimento humano pronta, com fila, etiquetas e histórico | Mensalidade da plataforma, além do custo da Meta |
| Onboarding na Meta feito com ajuda do provedor; coexistência costuma ser mais simples | Menos controle sobre o comportamento da IA; algumas não aceitam ferramentas próprias |
| Equipe começa a usar rápido | Integração com o ERP depende de webhooks e API de cada provedor |

**O que o Tae precisa providenciar:**
- a mesma verificação no Meta Business;
- o contrato com o provedor;
- a confirmação de que a plataforma aceita (1) o nosso prompt e base e (2) chamadas a ferramentas externas, como `consultar_pedido` via webhook.

### Recomendação

**Começar pela Opção B** se a prioridade for ter a equipe atendendo bem já no lançamento, com pouca gente técnica. **Ir para a Opção A** se o volume crescer e o custo da plataforma pesar, ou se a integração com o ERP for essencial. A base e o prompt servem para as duas.

### Como estimar o custo (sem chutar preço)

1. **Meta:** veja a tabela oficial de preços da WhatsApp Business Platform para o Brasil (developers.facebook.com, página "Pricing").
   - Em geral, as respostas dentro da janela de 24 h após a mensagem da cliente custam pouco ou nada.
   - Mensagens iniciadas pela OMG com template são cobradas por categoria (marketing, utilidade, autenticação).
2. **Modelo de IA:** veja a página de preços da Anthropic (custo por milhão de tokens de entrada e saída). Conta aproximada:
   - **conversas por mês** × **mensagens por conversa** × **tokens por mensagem**;
   - o prompt de sistema com as entradas relevantes da base conta como entrada a cada mensagem, por isso vale buscar só as entradas relevantes, e não mandar a base inteira;
   - medir com 20 conversas reais e multiplicar.
3. **Plataforma (Opção B):** peça proposta a 2 ou 3 provedores, com o volume estimado e o número de atendentes.
4. **Supabase (Opção A):** o plano Free aguenta o começo; o Pro já está no radar para quando as vendas começarem.

## E-mail

Para o e-mail (info.br@ohmygirl.com.br), o mesmo prompt funciona. O caminho mais seguro no começo:
- a Bomi **sugere um rascunho**;
- a equipe revisa e envia.

Envio automático só depois que as 40 conversas de teste passarem.

## Antes de ligar (checklist)

- [ ] Resolver ou aceitar os [A DEFINIR]: D30 (resgate de pontos), D16 (benefício por avaliação), D31 (endereço da MPOEMA).
- [ ] Escolher o canal (A ou B) e fazer a verificação no Meta Business.
- [ ] Implementar as 4 ferramentas (`consultar_pedido` lendo do Shopify/ERP; `buscar_produto` no catálogo; `transferir_humano`; `registrar_feedback`).
- [ ] Rodar as 40 conversas de teste e a checagem de termos proibidos.
- [ ] Período de teste com a equipe acompanhando antes de abrir para todas as clientes.
