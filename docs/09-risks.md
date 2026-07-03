---
tags: [advocacia-crm, risks]
created: 2026-04-23
updated: 2026-07-02
status: alvo
---

# Riscos e Mitigações — AdvocacIA CRM

> Riscos do produto em operação. Riscos específicos do processo de transformação estão em [[10-transformation-plan]] §7.

## Tabela de Riscos

| # | Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|---|
| 1 | **IA dar aconselhamento jurídico ou prometer resultado** (violação Código de Ética/Provimento 205-2021 OAB) | Média | Crítico | Regras rígidas no system prompt + testes adversariais + escalate_to_human + revisão periódica de conversas |
| 2 | LGPD — dados sensíveis de leads (relatos de casos) | Alta | Crítico | Encryption at rest, audit log, política de retenção, aviso de registro na conversa, backup criptografado |
| 3 | Race condition em consultas simultâneas | Média | Alto | EXCLUDE constraint + SELECT FOR UPDATE + Redis lock de 5min no slot |
| 4 | LLM alucinar horários disponíveis | Média | Alto | Tool obrigatória — LLM nunca confirma horário sem check_availability |
| 5 | Lead urgente (flagrante, prazo fatal) tratado como lead comum | Média | Crítico | Regra de escalonamento imediato no prompt + alerta sonoro/visual na caixa compartilhada |
| 6 | Webhook de leads externos aberto na internet | Alta | Médio | API key obrigatória + rate limiting Traefik + validação Pydantic estrita |
| 7 | Lead não atribuído fica sem retorno (SLA vence) | Média | Alto | Atribuição automática round-robin + alerta ao admin |
| 8 | Token Google Calendar expirado em produção | Alta | Alto | Refresh automático + health check periódico + alerta admin |
| 9 | Custo OpenAI elevado com alto volume | Média | Médio | Modelo menor default (gpt-4o-mini), cache de sessão, suporte a Local LLM |
| 10 | Deploy automático quebrar produção | Baixa | Alto | CI bloqueante em PR + healthcheck pós-deploy + rollback automático ([[12-cicd-pipeline]]) |
| 11 | Banco Neon indisponível (dependência externa) | Baixa | Alto | Retry/backoff na conexão + monitoramento + dump diário para restauração em Postgres local |

---

## Detalhamento dos riscos críticos

### 1. IA e ética profissional (OAB)

**Cenário real:** lead pergunta "tenho direito à revisão da aposentadoria? quanto vou receber?" e a IA responde com uma análise de mérito ou estimativa de valor. Isso pode caracterizar exercício irregular, publicidade vedada e captação indevida de clientela.

**Mitigação em camadas:**
1. System prompt com proibições explícitas (ver [[06-ai-design]])
2. Bateria de testes adversariais antes de cada mudança de prompt
3. Disclaimer padrão: "essa avaliação será feita pelo advogado na consulta"
4. Botão de assumir conversa (humano) sempre visível na caixa compartilhada
5. Registro integral das conversas para auditoria

### 2. LGPD — relatos de casos

**Dados sensíveis armazenados:** nome, telefone, e-mail e o **relato do caso** (pode conter dados de saúde, processos criminais, relações familiares).

**Medidas:**
- Encryption at rest (Neon já criptografa; disk-level na VPS)
- Audit log de todo acesso a dados de leads/clientes
- Política de retenção configurável (ex.: expurgo de leads perdidos após X meses)
- Aviso na primeira interação de que a conversa é registrada
- Sigilo profissional se estende à equipe comercial (termo de confidencialidade)

### 5. Urgências jurídicas

**Cenário real:** às 2h da manhã chega "meu filho foi preso em flagrante". Um fluxo comercial padrão (qualificar, agendar consulta para daqui 3 dias) é inaceitável.

**Mitigação:**
- Prompt detecta urgência → `escalate_to_human` imediato + resposta com telefone de plantão (configurável)
- Notificação push/Telegram para o responsável de plantão
- Lead marcado com etiqueta "URGENTE" no topo do kanban

### 10. Deploy automático

**Cenário real:** merge em `main` com migration defeituosa derruba a API em produção.

**Mitigação:**
- `ci.yml` bloqueia merge sem build verde
- Healthcheck pós-deploy com 10 tentativas; falhou → rollback automático para a tag anterior
- Environment `production` pode exigir aprovação manual antes do job de deploy
- Banco Neon permite branch/restore point-in-time antes de migrations arriscadas
