---
tags: [advocacia-crm, ai, llm]
created: 2026-04-23
updated: 2026-07-02
status: alvo
---

# IA Comercial — AdvocacIA CRM

> Estado-alvo. A mecânica (sessão Redis, function calling, adapters) é herdada; **prompts e regras de compliance são novos** — este é o coração da Fase 4 do [[10-transformation-plan]].

## Responsabilidades

1. Gerenciar sessão de conversa (histórico por lead/cliente)
2. Montar contexto para o LLM (system prompt + histórico + mensagem)
3. Executar function calling (qualificação e agenda de consultas)
4. Abstrair o provider de LLM (OpenAI ou Local)
5. **Nunca** prestar aconselhamento jurídico — apenas atendimento comercial

---

## Fluxo de Processamento

```
MessagePayload recebida
  │
  ├── ai/session.py
  │     Carrega histórico do Redis (key: session:{client_id})
  │     Se expirou (>24h): busca últimas 5 mensagens do DB
  │
  ├── ai/engine.py
  │     Monta: system_prompt + histórico + nova mensagem
  │
  ├── LLM Adapter
  │     Envia para OpenAI ou Local LLM
  │
  ├── Resposta do LLM
  │     ┌── tool_call? ──────────────────────────────────────┐
  │     │   ai/tools.py executa a tool                        │
  │     │   Adiciona resultado ao contexto                    │
  │     │   Reenvia para LLM (loop até max 3 tool calls)      │
  │     └────────────────────────────────────────────────────┘
  │     └── text: resposta final
  │
  ├── Salva mensagem + resposta
  │     → Redis (TTL 24h) + PostgreSQL
  │
  └── Retorna resposta para MessagingGateway
```

---

## Tools (Function Calling)

```python
TOOLS = [
    {
        "name": "check_availability",
        "description": "Verifica horários disponíveis para consulta com advogado",
        "parameters": {
            "type": "object",
            "properties": {
                "practice_area_id": {
                    "type": "string",
                    "description": "UUID da área de atuação desejada"
                },
                "date_from": {"type": "string", "description": "ISO 8601"},
                "date_to": {"type": "string", "description": "ISO 8601"}
            },
            "required": ["practice_area_id", "date_from", "date_to"]
        }
    },
    {
        "name": "book_consultation",
        "description": "Agenda uma consulta para o contato atual",
        "parameters": {
            "type": "object",
            "properties": {
                "lawyer_id": {"type": "string"},
                "starts_at": {"type": "string", "description": "ISO 8601"},
                "client_notes": {"type": "string", "description": "Resumo do caso relatado"}
            },
            "required": ["lawyer_id", "starts_at"]
        }
    },
    {
        "name": "cancel_consultation",
        "description": "Cancela uma consulta agendada",
        "parameters": {
            "type": "object",
            "properties": {"consultation_id": {"type": "string"}},
            "required": ["consultation_id"]
        }
    },
    {
        "name": "reschedule_consultation",
        "description": "Remarca uma consulta para outro horário",
        "parameters": {
            "type": "object",
            "properties": {
                "consultation_id": {"type": "string"},
                "new_starts_at": {"type": "string", "description": "ISO 8601"}
            },
            "required": ["consultation_id", "new_starts_at"]
        }
    },
    {
        "name": "get_client_consultations",
        "description": "Lista as consultas agendadas do contato atual",
        "parameters": {"type": "object", "properties": {}}
    },
    {
        "name": "escalate_to_human",
        "description": "Transfere a conversa para atendimento humano",
        "parameters": {
            "type": "object",
            "properties": {
                "reason": {"type": "string", "description": "Motivo da transferência"}
            },
            "required": ["reason"]
        }
    }
]
```

---

## System Prompt Base

```
Você é o atendente comercial do escritório {FIRM_NAME}.

Data e hora atual: {current_datetime} (fuso: {FIRM_TIMEZONE})

Áreas de atuação do escritório:
{practice_areas_list}

Suas responsabilidades:
1. Acolher o interessado com cordialidade e profissionalismo
2. Entender, em linhas gerais, o que a pessoa precisa (sem entrar no mérito jurídico)
3. Identificar a área de atuação adequada e coletar nome e contato
4. Verificar disponibilidade e agendar consulta com um advogado
5. Confirmar, cancelar ou remarcar consultas existentes

Regras OBRIGATÓRIAS:
- NUNCA dê aconselhamento jurídico, opinião sobre o caso, chance de êxito,
  prazos processuais ou valores de indenização. Sempre responda que essas
  questões serão avaliadas pelo advogado na consulta.
- NUNCA prometa resultado ("vamos ganhar", "você tem direito") — isso viola
  o Código de Ética da OAB.
- NÃO informe valores de honorários, salvo texto pré-aprovado nas configurações.
- NUNCA invente ou confirme horários sem usar a tool check_availability.
- Diante de urgência (prisão em flagrante, prazo fatal, medida protetiva,
  risco a pessoa): use escalate_to_human IMEDIATAMENTE.
- Trate os dados pessoais com sigilo (LGPD); informe que a conversa fica
  registrada para fins de atendimento.
- Fale em português do Brasil, tom profissional e acolhedor.
- Mensagens curtas e objetivas (máximo 3 parágrafos).
```

---

## LLM Adapters

### OpenAIAdapter
```python
class OpenAIAdapter(AbstractLLMAdapter):
    def __init__(self, model: str, api_key: str):
        self.client = AsyncOpenAI(api_key=api_key)
        self.model = model  # gpt-4o-mini padrão

    async def complete(self, messages, tools) -> LLMResponse:
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            tools=tools,
            tool_choice="auto"
        )
        return LLMResponse.from_openai(response)
```

### LocalLLMAdapter
```python
class LocalLLMAdapter(AbstractLLMAdapter):
    def __init__(self, base_url: str, model: str):
        # Compatível com qualquer endpoint OpenAI-compatible
        # Testado com: Ollama, LM Studio, vLLM
        self.client = AsyncOpenAI(base_url=base_url, api_key="local")
        self.model = model  # ex: llama3.2, mistral:7b
```

---

## Gerenciamento de Sessão

```
Redis key: session:{client_id}
TTL: 86400 segundos (24 horas)
Estrutura: JSON list de messages [{role, content}, ...]

Limite de contexto:
- Máximo 20 mensagens na sessão Redis
- Ao atingir limite: gera context_summary via LLM e trunca
- Fallback (sessão expirada): carrega últimas 5 mensagens do DB
```

## Controle humano vs. IA (por lead)

Campo `leads.ai_active`:
- `null` — sem IA envolvida (lead manual)
- `true` — IA respondendo ativamente
- `false` — humano assumiu a conversa (IA silenciada); reativável pela caixa compartilhada

---

## Configuração via Admin

O provider de LLM é configurado via wizard e salvo em `system_config`:

```json
// key: "ai_provider"
{
  "type": "openai",
  "model": "gpt-4o-mini",
  "api_key_ref": "env:OPENAI_API_KEY"
}

// ou para Local LLM
{
  "type": "local_llm",
  "base_url": "http://ollama:11434/v1",
  "model": "llama3.2"
}
```

`api_key_ref` usa o padrão `env:NOME_VAR` para nunca salvar secrets no banco.

## Testes adversariais obrigatórios (Fase 4)

Antes de ativar em produção, validar que a IA:
1. Recusa opinar sobre viabilidade do caso ("tenho chance de ganhar?")
2. Recusa estimar valores de indenização
3. Não cita honorários sem texto configurado
4. Escala para humano em cenário de urgência (flagrante/prazo fatal)
5. Não confirma horário sem `check_availability`
