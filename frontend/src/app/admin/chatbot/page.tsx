"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

// ── tipos ──────────────────────────────────────────────────────────────────

interface AISettings {
  type: string;
  model: string;
  use_local_llm: boolean;
  local_llm_url: string;
  local_llm_model: string;
}

interface ChatbotSettings {
  system_prompt: string;
  max_tool_calls: number;
  temperature: number;
}

interface ChatMsg {
  role: "user" | "assistant" | "error";
  content: string;
}

// ── constantes ─────────────────────────────────────────────────────────────

const OPENAI_MODELS = [
  { value: "gpt-4o",       label: "GPT-4o (mais capaz)"      },
  { value: "gpt-4o-mini",  label: "GPT-4o Mini (custo-benefício)" },
  { value: "gpt-4-turbo",  label: "GPT-4 Turbo"              },
];

const LOCAL_MODELS = [
  { value: "llama3.2", label: "Llama 3.2" },
  { value: "llama3.1", label: "Llama 3.1" },
  { value: "mistral",  label: "Mistral"   },
  { value: "gemma2",   label: "Gemma 2"   },
];

const DEFAULT_PROMPT = `Suas responsabilidades:
1. Atender pacientes com cordialidade e profissionalismo
2. Verificar disponibilidade e agendar consultas
3. Confirmar, cancelar ou remarcar consultas existentes
4. Coletar informações básicas (nome, queixa principal)
5. Responder dúvidas gerais sobre a clínica

Regras IMPORTANTES:
- NUNCA invente horários. Use SEMPRE a ferramenta check_availability para consultar disponibilidade real
- Se o paciente quiser agendar, pergunte a especialidade ou médico desejado e a data de preferência
- Ao oferecer horários, apresente no máximo 5 opções de forma clara
- Antes de confirmar um agendamento, SEMPRE pergunte ao paciente se o horário está ok
- Se o paciente fizer perguntas médicas, oriente-o a consultar o médico
- Se não conseguir resolver algo, use escalate_to_human para transferir à secretária
- Fale em português do Brasil, com tom profissional mas acolhedor
- Seja conciso — mensagens curtas e diretas são melhores em chat
- Formate datas como "segunda-feira, 28 de abril às 14:00"`;

// ── componente ─────────────────────────────────────────────────────────────

export default function ChatbotPage() {
  const [loading, setLoading]   = useState(true);
  const [ai, setAi]             = useState<AISettings>({
    type: "openai", model: "gpt-4o-mini",
    use_local_llm: false, local_llm_url: "", local_llm_model: "",
  });
  const [chatbot, setChatbot]   = useState<ChatbotSettings>({
    system_prompt: "", max_tool_calls: 3, temperature: 0.3,
  });
  const [savingAi, setSavingAi]         = useState(false);
  const [savingChatbot, setSavingChatbot] = useState(false);
  const [savedMsg, setSavedMsg]          = useState<string | null>(null);

  // chat de teste
  const [sessionId]        = useState<string>(() => crypto.randomUUID());
  const [msgs, setMsgs]    = useState<ChatMsg[]>([]);
  const [input, setInput]  = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef          = useRef<HTMLDivElement>(null);
  const inputRef           = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { fetchSettings(); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, sending]);

  async function fetchSettings() {
    try {
      const { data } = await api.get("/admin/settings");
      setAi(data.ai);
      // Pre-fill with default prompt when empty so the admin can see and edit it
      setChatbot({
        ...data.chatbot,
        system_prompt: data.chatbot.system_prompt || DEFAULT_PROMPT,
      });
    } catch { /* ignore */ } finally { setLoading(false); }
  }

  function showSaved(msg: string) {
    setSavedMsg(msg);
    setTimeout(() => setSavedMsg(null), 3000);
  }

  async function saveAi() {
    setSavingAi(true);
    try { await api.patch("/admin/settings/ai", ai); showSaved("Configuração de IA salva."); }
    catch { alert("Erro ao salvar."); } finally { setSavingAi(false); }
  }

  async function saveChatbot() {
    setSavingChatbot(true);
    try { await api.patch("/admin/settings/chatbot", chatbot); showSaved("Prompt do chatbot salvo."); }
    catch { alert("Erro ao salvar."); } finally { setSavingChatbot(false); }
  }

  // ── chat handlers ──────────────────────────────────────────────────────

  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setMsgs((prev) => [...prev, { role: "user", content: text }]);
    setSending(true);
    try {
      const { data } = await api.post("/admin/chat/test", {
        message: text,
        session_id: sessionId,
      });
      setMsgs((prev) => [...prev, { role: "assistant", content: data.response }]);
    } catch {
      setMsgs((prev) => [
        ...prev,
        { role: "error", content: "Erro ao conectar com a IA. Verifique as configurações de provedor." },
      ]);
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  async function clearChat() {
    try { await api.delete(`/admin/chat/test/${sessionId}`); } catch { /* ignore */ }
    setMsgs([]);
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  if (loading) return <div className="p-8 text-parchment-faint">Carregando...</div>;

  return (
    <main className="p-8 max-w-3xl">
      <h1 className="text-2xl font-display font-semibold text-parchment mb-6">Chatbot / Assistente IA</h1>

      {savedMsg && (
        <div className="mb-4 bg-jade/15 border border-jade/40 text-jade text-sm px-4 py-2 rounded-sm">
          {savedMsg}
        </div>
      )}

      <div className="space-y-6">

        {/* ── Provedor de IA ───────────────────────────────────── */}
        <div className="bg-ink-2 border border-line rounded-sm p-6">
          <h2 className="text-lg font-semibold text-parchment mb-2">Provedor de IA</h2>
          <p className="text-sm text-parchment-dim mb-4">
            Escolha qual serviço de IA o chatbot usará para conversar com os pacientes.
          </p>

          <div className="flex items-center gap-3 mb-4 p-3 bg-ink-3 rounded-sm">
            <input
              type="checkbox"
              checked={ai.use_local_llm}
              onChange={(e) => setAi({ ...ai, use_local_llm: e.target.checked, type: e.target.checked ? "local" : "openai" })}
              id="use_local"
              className="rounded"
            />
            <label htmlFor="use_local" className="text-sm text-parchment-dim">
              <span className="font-medium">Usar LLM Local (Ollama)</span>
              <span className="block text-xs text-parchment-dim">Requer VPS com 8+ vCPU e 16GB RAM. Sem custo de API, mas mais lento.</span>
            </label>
          </div>

          {ai.use_local_llm ? (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-parchment-dim mb-1">URL do Ollama</label>
                <input value={ai.local_llm_url} onChange={(e) => setAi({ ...ai, local_llm_url: e.target.value })}
                  placeholder="http://ollama:11434/v1" className="w-full border border-line rounded-sm px-3 py-2 text-sm" />
                <p className="text-xs text-parchment-faint mt-1">Se Ollama está no mesmo Docker Compose, use http://ollama:11434/v1</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-parchment-dim mb-1">Modelo</label>
                <select value={ai.local_llm_model} onChange={(e) => setAi({ ...ai, local_llm_model: e.target.value })}
                  className="w-full border border-line rounded-sm px-3 py-2 text-sm">
                  <option value="">Selecione...</option>
                  {LOCAL_MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <input value={ai.local_llm_model} onChange={(e) => setAi({ ...ai, local_llm_model: e.target.value })}
                  placeholder="nome-do-modelo" className="w-full border border-line rounded-sm px-3 py-2 text-sm mt-1" />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-parchment-dim mb-1">Modelo OpenAI</label>
              <select value={ai.model} onChange={(e) => setAi({ ...ai, model: e.target.value })}
                className="w-full border border-line rounded-sm px-3 py-2 text-sm">
                {OPENAI_MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <p className="text-xs text-parchment-faint mt-1">
                A API key é configurada no .env (OPENAI_API_KEY). O modelo selecionado aqui é usado pelo chatbot.
              </p>
            </div>
          )}

          <button onClick={saveAi} disabled={savingAi}
            className="mt-4 bg-carimbo text-parchment px-4 py-2 rounded-sm text-sm font-medium hover:bg-carimbo-bright disabled:opacity-50">
            {savingAi ? "Salvando..." : "Salvar Configuração de IA"}
          </button>
        </div>

        {/* ── Comportamento do chatbot ─────────────────────────── */}
        <div className="bg-ink-2 border border-line rounded-sm p-6">
          <h2 className="text-lg font-semibold text-parchment mb-2">Comportamento do Chatbot</h2>
          <p className="text-sm text-parchment-dim mb-4">
            Personalize como o assistente virtual se comporta nas conversas com pacientes.
          </p>

          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-parchment-dim">Instruções do Chatbot (System Prompt)</label>
                <button onClick={() => setChatbot({ ...chatbot, system_prompt: DEFAULT_PROMPT })}
                  className="text-xs text-carimbo hover:underline">Restaurar padrão</button>
              </div>
              <textarea value={chatbot.system_prompt} onChange={(e) => setChatbot({ ...chatbot, system_prompt: e.target.value })}
                rows={16} className="w-full border border-line rounded-sm px-3 py-2 text-sm font-mono leading-relaxed" />
              <p className="text-xs text-parchment-faint mt-1">
                Edite as instruções acima para personalizar o comportamento da IA. Clique em "Restaurar padrão" para voltar ao texto original.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-parchment-dim mb-1">Temperatura</label>
                <input type="number" value={chatbot.temperature}
                  onChange={(e) => setChatbot({ ...chatbot, temperature: Number(e.target.value) })}
                  min={0} max={1} step={0.1} className="w-full border border-line rounded-sm px-3 py-2 text-sm" />
                <p className="text-xs text-parchment-faint mt-1">0 = mais preciso, 1 = mais criativo. Recomendado: 0.3</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-parchment-dim mb-1">Max Tool Calls</label>
                <input type="number" value={chatbot.max_tool_calls}
                  onChange={(e) => setChatbot({ ...chatbot, max_tool_calls: Number(e.target.value) })}
                  min={1} max={10} className="w-full border border-line rounded-sm px-3 py-2 text-sm" />
                <p className="text-xs text-parchment-faint mt-1">Limite de ações por mensagem (agendar, verificar, etc.)</p>
              </div>
            </div>
          </div>

          <button onClick={saveChatbot} disabled={savingChatbot}
            className="mt-4 bg-carimbo text-parchment px-4 py-2 rounded-sm text-sm font-medium hover:bg-carimbo-bright disabled:opacity-50">
            {savingChatbot ? "Salvando..." : "Salvar Comportamento"}
          </button>
        </div>

        {/* ── Resumo ativo ─────────────────────────────────────── */}
        <div className="bg-ink-2/30 border border-line rounded-sm p-6">
          <h2 className="text-lg font-semibold text-parchment mb-2">Resumo Ativo</h2>
          <div className="text-sm text-parchment-dim space-y-1">
            <p><span className="font-medium">Provedor:</span> {ai.use_local_llm ? "LLM Local (Ollama)" : "OpenAI"}</p>
            <p><span className="font-medium">Modelo:</span> {ai.use_local_llm ? ai.local_llm_model || "não definido" : ai.model}</p>
            {ai.use_local_llm && <p><span className="font-medium">URL:</span> {ai.local_llm_url || "não definido"}</p>}
            <p><span className="font-medium">Temperatura:</span> {chatbot.temperature}</p>
            <p><span className="font-medium">Prompt personalizado:</span> {chatbot.system_prompt ? "Sim" : "Usando padrão"}</p>
          </div>
        </div>

        {/* ── Chat de teste ─────────────────────────────────────── */}
        <div className="bg-ink-2 border border-line rounded-sm overflow-hidden">
          {/* header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-line bg-ink-3">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-jade" />
              <span className="text-sm font-semibold text-parchment">Testar Chatbot</span>
              <span className="text-xs text-parchment-faint ml-1">— simulação em tempo real</span>
            </div>
            <button onClick={clearChat}
              className="text-xs text-parchment-faint hover:text-carimbo-bright transition-colors px-2 py-1 rounded-sm hover:bg-carimbo/10">
              Limpar conversa
            </button>
          </div>

          {/* aviso */}
          <div className="px-5 py-2 bg-selo/15 border-b border-selo/30 text-xs text-selo">
            Esta conversa usa o engine real (mesmo prompt, ferramentas e modelo configurados acima).
            Consultas de disponibilidade funcionam normalmente. Agendamentos criados aqui são registros reais.
          </div>

          {/* mensagens */}
          <div className="h-96 overflow-y-auto px-5 py-4 space-y-4 bg-ink/40">
            {msgs.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center text-parchment-faint">
                <svg className="w-10 h-10 mb-2 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                <p className="text-sm">Envie uma mensagem para testar o chatbot.</p>
                <p className="text-xs mt-1">Ex: "Quero marcar uma consulta" ou "Quais médicos vocês têm?"</p>
              </div>
            )}

            {msgs.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role !== "user" && (
                  <div className="w-7 h-7 rounded-full bg-carimbo flex items-center justify-center text-parchment text-xs font-bold mr-2 mt-0.5 shrink-0">
                    IA
                  </div>
                )}
                <div className={`
                  max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap
                  ${msg.role === "user"
                    ? "bg-carimbo text-parchment rounded-tr-sm"
                    : msg.role === "error"
                      ? "bg-carimbo/10 text-carimbo-bright border border-carimbo/40 rounded-tl-sm"
                      : "bg-ink-3 text-parchment border border-line rounded-tl-sm"
                  }
                `}>
                  {msg.content}
                </div>
              </div>
            ))}

            {/* indicador de digitando */}
            {sending && (
              <div className="flex justify-start">
                <div className="w-7 h-7 rounded-full bg-carimbo flex items-center justify-center text-parchment text-xs font-bold mr-2 mt-0.5 shrink-0">
                  IA
                </div>
                <div className="bg-ink-3 border border-line rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex gap-1 items-center">
                    <span className="w-1.5 h-1.5 bg-parchment-faint rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 bg-parchment-faint rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 bg-parchment-faint rounded-full animate-bounce" />
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* input */}
          <div className="flex items-end gap-2 px-4 py-3 border-t border-line bg-ink-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              rows={1}
              placeholder="Digite uma mensagem... (Enter para enviar, Shift+Enter para nova linha)"
              className="flex-1 resize-none border border-line rounded-sm px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-carimbo focus:border-carimbo max-h-32 overflow-y-auto"
              style={{ lineHeight: "1.5" }}
              disabled={sending}
            />
            <button
              onClick={sendMessage}
              disabled={sending || !input.trim()}
              className="shrink-0 bg-carimbo text-parchment rounded-sm w-10 h-10 flex items-center justify-center hover:bg-carimbo-bright disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>

      </div>
    </main>
  );
}
