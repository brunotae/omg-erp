# Revisão semanal da Bomi

Um chatbot melhora com as perguntas reais. Toda semana (sugestão: segunda de manhã), depois da inauguração:

1. **Juntar as conversas da semana**: chat do site e WhatsApp (tela Atendimento do ERP, quando estiver pronta), mais os e-mails de info.br@ohmygirl.com.br.
2. **Separar em quatro grupos**:
   - perguntas que a Bomi **não soube** responder ou transferiu por falta de base;
   - respostas **erradas** ou fora do tom (inclui os 👎 da equipe);
   - assuntos que **se repetem** e podiam virar resposta pronta, vídeo ou texto no site;
   - **produtos pedidos** que não temos (vira sugestão de compra).
3. **Corrigir na fonte certa**:
   - fato da loja → `tools/ajuda/conteudo.py` (Central de Ajuda) e depois o tom em `bomi/fonte/chat_*.py`;
   - conteúdo de skincare, marca ou produto → `bomi/fonte/guias/*.json`;
   - algo temporário (cupom, atraso, feriado) → tela **Avisos da Bomi** no ERP.
4. **Regerar e testar**: `python3 bomi/fonte/gerar.py`, rodar os cenários na página de teste e a checagem de termos proibidos do README.
5. **Registrar** num parágrafo o que mudou (vale para comparar semana a semana: % de conversas resolvidas sem pessoa, transferências, 👎).

Quem faz: o Claude prepara o relatório e as correções; o Tae aprova.
