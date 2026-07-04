"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Lead, LeadInteraction, LeadConversation, LeadOutboundMessage, LeadActivity } from "@/types";
import { useAuth } from "@/lib/auth";

const STATUS_OPTIONS = [
  { value: "novo", label: "Novo" },
  { value: "em_contato", label: "Em Contato" },
  { value: "qualificado", label: "Qualificado" },
  { value: "orcamento_enviado", label: "Proposta Enviada" },
  { value: "negociando", label: "Negociando" },
  { value: "convertido", label: "Cliente Fechado" },
  { value: "perdido", label: "Perdido" },
];

const STATUS_COLORS: Record<string, string> = {
  novo: "bg-info",
  em_contato: "bg-selo",
  qualificado: "bg-parchment-dim",
  orcamento_enviado: "bg-selo",
  negociando: "bg-carimbo",
  convertido: "bg-jade",
  perdido: "bg-parchment-faint",
};

const LOST_REASON_OPTIONS = [
  { value: "sem_resposta", label: "Sem resposta" },
  { value: "preco", label: "Preço" },
  { value: "ja_atendido", label: "Já atendido em outro lugar" },
  { value: "fora_de_perfil", label: "Fora do perfil" },
  { value: "sem_disponibilidade", label: "Sem disponibilidade" },
  { value: "mudou_de_ideia", label: "Mudou de ideia" },
  { value: "duplicado", label: "Lead duplicado" },
  { value: "outro", label: "Outro" },
];

const INTERACTION_TYPES = [
  { value: "nota", label: "Nota" },
  { value: "ligacao", label: "Ligação" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "E-mail" },
  { value: "reuniao", label: "Reunião" },
  { value: "outro", label: "Outro" },
];

const CHANNEL_LABELS: Record<string, string> = {
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  google_ads: "Google Ads",
  meta_ads: "Meta Ads",
  instagram: "Instagram",
  site: "Site",
  indicacao: "Indicação",
  outro: "Outro",
};

type Tab = "info" | "conversa" | "whatsapp" | "lembretes";

// --- AI Control helpers ---

function AiControlBadge({
  control,
}: {
  control: "ai" | "awaiting_supervisor" | "human" | null;
}) {
  if (!control)
    return (
      <span className="text-xs text-parchment-faint bg-ink-3 px-2 py-0.5 rounded-full">
        IA não iniciada
      </span>
    );
  if (control === "ai")
    return (
      <span className="text-xs text-jade bg-jade/15 px-2 py-0.5 rounded-full font-medium">
        🤖 Agente IA ativo
      </span>
    );
  if (control === "awaiting_supervisor")
    return (
      <span className="text-xs text-selo bg-selo/15 px-2 py-0.5 rounded-full font-medium">
        ⏳ Aguardando supervisor
      </span>
    );
  return (
    <span className="text-xs text-info bg-info/15 px-2 py-0.5 rounded-full font-medium">
      👤 Atendimento humano
    </span>
  );
}

// --- Conversation tab ---

function ConversaTab({
  leadId,
  conv,
  onRefresh,
}: {
  leadId: string;
  conv: LeadConversation | null;
  onRefresh: () => void;
}) {
  const [toggling, setToggling] = useState(false);

  async function toggleControl(target: "ai" | "human") {
    setToggling(true);
    try {
      await api.patch(`/leads/${leadId}/ai-conversation/control`, {
        control: target,
      });
      onRefresh();
    } catch {
      alert("Erro ao alterar controle da conversa.");
    } finally {
      setToggling(false);
    }
  }

  if (!conv) {
    return (
      <div className="bg-ink-2 border border-line rounded-sm p-6 text-center text-sm text-parchment-faint">
        Nenhuma conversa de IA iniciada para este lead ainda.
        <br />
        <span className="text-xs">
          A IA inicia automaticamente quando o lead está em um status ativo e
          envia uma mensagem.
        </span>
      </div>
    );
  }

  const pendingQueries = conv.supervisor_queries.filter(
    (q) => q.status === "pending"
  );
  const answeredQueries = conv.supervisor_queries.filter(
    (q) => q.status !== "pending"
  );

  return (
    <div className="space-y-4">
      {/* Control bar */}
      <div className="bg-ink-2 border border-line rounded-sm p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AiControlBadge control={conv.control} />
          <span className="text-xs text-parchment-faint">
            Canal: {CHANNEL_LABELS[conv.channel] || conv.channel} ·{" "}
            {conv.messages.length} mensagens
          </span>
        </div>
        <div className="flex gap-2">
          {conv.control !== "human" ? (
            <button
              onClick={() => toggleControl("human")}
              disabled={toggling}
              className="text-sm px-3 py-1.5 rounded-sm border border-carimbo text-carimbo hover:bg-carimbo/10 disabled:opacity-50"
            >
              Assumir conversa
            </button>
          ) : (
            <button
              onClick={() => toggleControl("ai")}
              disabled={toggling}
              className="text-sm px-3 py-1.5 rounded-sm border border-jade text-jade hover:bg-jade/10 disabled:opacity-50"
            >
              Devolver para IA
            </button>
          )}
        </div>
      </div>

      {/* Supervisor queries */}
      {conv.supervisor_queries.length > 0 && (
        <div className="bg-ink-2 border border-line rounded-sm p-4 space-y-3">
          <h4 className="text-sm font-semibold text-parchment-dim">
            Consultas ao Supervisor
          </h4>
          {pendingQueries.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-selo">
                ⏳ Aguardando resposta
              </p>
              {pendingQueries.map((q) => (
                <div
                  key={q.id}
                  className="bg-selo/10 border border-selo/40 rounded-sm p-3 text-sm"
                >
                  <p className="font-medium text-parchment">{q.question}</p>
                  {q.context_summary && (
                    <p className="text-xs text-parchment-dim mt-1">
                      {q.context_summary}
                    </p>
                  )}
                  <p className="text-xs text-parchment-faint mt-2">
                    Enviado{" "}
                    {new Date(q.asked_at).toLocaleString("pt-BR")}
                  </p>
                </div>
              ))}
            </div>
          )}
          {answeredQueries.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-parchment-dim">Resolvidas</p>
              {answeredQueries.map((q) => (
                <div
                  key={q.id}
                  className="border border-line rounded-sm p-3 text-sm space-y-1"
                >
                  <p className="text-parchment-dim">{q.question}</p>
                  {q.answer && (
                    <p className="text-jade font-medium">
                      ↳ {q.answer}
                    </p>
                  )}
                  <p className="text-xs text-parchment-faint">
                    {q.status === "timeout"
                      ? "⏰ Expirou sem resposta"
                      : `Respondido ${
                          q.answered_at
                            ? new Date(q.answered_at).toLocaleString("pt-BR")
                            : ""
                        }`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="bg-ink-2 border border-line rounded-sm p-4">
        <h4 className="text-sm font-semibold text-parchment-dim mb-3">
          Histórico de mensagens
        </h4>
        {conv.messages.length === 0 ? (
          <p className="text-sm text-parchment-faint">Nenhuma mensagem ainda.</p>
        ) : (
          <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
            {conv.messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${
                  msg.role === "assistant" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[75%] rounded-sm px-3 py-2 text-sm ${
                    msg.role === "assistant"
                      ? "bg-carimbo text-parchment"
                      : "bg-ink-3 text-parchment"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  <p
                    className={`text-[10px] mt-1 ${
                      msg.role === "assistant"
                        ? "text-parchment/70"
                        : "text-parchment-faint"
                    }`}
                  >
                    {new Date(msg.sent_at).toLocaleString("pt-BR")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Main page ---

export function LeadDetailView({ backPath = "/secretary" }: { backPath?: string }) {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [lead, setLead] = useState<Lead | null>(null);
  const [interactions, setInteractions] = useState<LeadInteraction[]>([]);
  const [conversation, setConversation] = useState<LeadConversation | null>(null);
  const [outboundMessages, setOutboundMessages] = useState<LeadOutboundMessage[]>([]);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("info");
  const [handlingBusy, setHandlingBusy] = useState(false);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    description: "",
    quote_value: "",
    next_followup_at: "",
  });

  // Interaction form
  const [showInteraction, setShowInteraction] = useState(false);
  const [interactionForm, setInteractionForm] = useState({
    type: "nota",
    content: "",
    next_action: "",
  });

  // Pipeline actions
  const [showLostModal, setShowLostModal] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [convertName, setConvertName] = useState("");
  const [deletingLead, setDeletingLead] = useState(false);

  useEffect(() => {
    if (id) fetchAll();
  }, [id]);

  async function fetchAll() {
    setLoading(true);
    try {
      const [leadRes, intRes, convRes, outRes, actRes] = await Promise.allSettled([
        api.get(`/leads/${id}`),
        api.get(`/leads/${id}/interactions`),
        api.get(`/leads/${id}/ai-conversation`),
        api.get(`/leads/${id}/outbound-messages`),
        api.get(`/leads/${id}/activities`),
      ]);
      if (leadRes.status === "fulfilled") {
        const l = leadRes.value.data;
        setLead(l);
        setEditForm({
          full_name: l.full_name || "",
          phone: l.phone || "",
          email: l.email || "",
          description: l.description || "",
          quote_value: l.quote_value?.toString() || "",
          next_followup_at: l.next_followup_at?.slice(0, 16) || "",
        });
        setConvertName(l.full_name || "");
      }
      if (intRes.status === "fulfilled") setInteractions(intRes.value.data);
      if (convRes.status === "fulfilled") setConversation(convRes.value.data);
      else setConversation(null);
      if (outRes.status === "fulfilled") setOutboundMessages(outRes.value.data);
      if (actRes.status === "fulfilled") setActivities(actRes.value.data);
    } finally {
      setLoading(false);
    }
  }

  async function toggleHandling(mode: "ia" | "human") {
    if (!lead) return;
    setHandlingBusy(true);
    try {
      await api.patch(`/leads/${lead.id}/ai-handling`, { mode });
      fetchAll();
    } catch {
      alert("Erro ao alterar controle de atendimento.");
    } finally {
      setHandlingBusy(false);
    }
  }

  async function fetchConversation() {
    try {
      const { data } = await api.get(`/leads/${id}/ai-conversation`);
      setConversation(data);
    } catch {
      setConversation(null);
    }
  }

  async function saveEdit() {
    if (!lead) return;
    try {
      await api.patch(`/leads/${lead.id}`, {
        full_name: editForm.full_name || null,
        phone: editForm.phone,
        email: editForm.email || null,
        description: editForm.description || null,
        quote_value: editForm.quote_value ? parseFloat(editForm.quote_value) : null,
        next_followup_at: editForm.next_followup_at || null,
      });
      setEditing(false);
      fetchAll();
    } catch {
      alert("Erro ao salvar.");
    }
  }

  async function changeStatus(newStatus: string) {
    if (!lead) return;
    if (newStatus === "perdido") { setShowLostModal(true); return; }
    if (newStatus === "convertido") { setShowConvertModal(true); return; }
    try {
      await api.post(`/leads/${lead.id}/transition`, { to_status: newStatus });
      fetchAll();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      alert(e.response?.data?.detail || "Erro ao alterar status.");
    }
  }

  async function handleContact() {
    if (!lead) return;
    try {
      await api.post(`/leads/${lead.id}/contact`, {
        notes: "Primeiro contato realizado.",
      });
      fetchAll();
    } catch {
      alert("Erro ao registrar contato.");
    }
  }

  async function handleLost() {
    if (!lead || !lostReason.trim()) return;
    try {
      await api.post(`/leads/${lead.id}/lost`, { lost_reason: lostReason });
      setShowLostModal(false);
      setLostReason("");
      fetchAll();
    } catch {
      alert("Erro ao marcar como perdido.");
    }
  }

  async function handleConvert() {
    if (!lead) return;
    try {
      await api.post(`/leads/${lead.id}/convert`, {
        patient_name: convertName || null,
      });
      setShowConvertModal(false);
      fetchAll();
    } catch {
      alert("Erro ao converter lead.");
    }
  }

  async function addInteraction() {
    if (!lead || !interactionForm.content.trim()) return;
    try {
      await api.post(`/leads/${lead.id}/interactions`, {
        type: interactionForm.type,
        content: interactionForm.content,
        next_action: interactionForm.next_action || null,
      });
      setInteractionForm({ type: "nota", content: "", next_action: "" });
      setShowInteraction(false);
      fetchAll();
    } catch {
      alert("Erro ao registrar interação.");
    }
  }

  async function handleDeleteLead() {
    if (!lead || deletingLead) return;
    const label = lead.full_name || lead.phone;
    const confirmed = window.confirm(
      `Excluir lead ${lead.code} (${label})? Esta ação é permanente e remove histórico, mensagens e lembretes.`,
    );
    if (!confirmed) return;

    setDeletingLead(true);
    try {
      await api.delete(`/leads/${lead.id}`);
      router.push(`${backPath}?deleted=${encodeURIComponent(lead.code)}`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      alert(e.response?.data?.detail || "Erro ao excluir o lead.");
    } finally {
      setDeletingLead(false);
    }
  }

  if (loading) return <div className="p-8 text-parchment-faint">Carregando...</div>;
  if (!lead) return <div className="p-8 text-parchment-faint">Lead não encontrado.</div>;

  return (
    <main className="p-8 max-w-4xl">
      {/* Back */}
      <button
        onClick={() => router.push(backPath)}
        className="text-sm text-carimbo hover:underline mb-4 block"
      >
        &larr; Voltar para Leads
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-parchment-faint bg-ink-3 px-2 py-0.5 rounded-sm">
              {lead.code}
            </span>
            {conversation && (
              <AiControlBadge control={conversation.control} />
            )}
          </div>
          <h1 className="text-2xl font-display font-semibold text-parchment">
            {lead.full_name || "Lead sem nome"}
          </h1>
          <p className="text-parchment-dim">
            {lead.phone}
            {lead.email ? ` | ${lead.email}` : ""}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className={`w-3 h-3 rounded-full ${STATUS_COLORS[lead.status]}`} />
            <span className="text-sm font-medium text-parchment-dim">
              {STATUS_OPTIONS.find((s) => s.value === lead.status)?.label}
            </span>
            <span className="text-xs text-parchment-faint ml-2">
              via {CHANNEL_LABELS[lead.channel] || lead.channel}
            </span>
            {lead.is_overdue && (
              <span className="text-xs bg-carimbo/10 text-carimbo-bright px-2 py-0.5 rounded-full font-medium ml-2">
                SLA VENCIDO
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setEditing(!editing)}
            className="text-sm text-carimbo hover:underline"
          >
            {editing ? "Cancelar Edição" : "Editar"}
          </button>
          <button
            onClick={handleDeleteLead}
            disabled={deletingLead}
            className="text-sm text-carimbo-bright hover:underline disabled:opacity-50"
            title="Excluir lead"
          >
            {deletingLead ? "Excluindo..." : "Excluir lead"}
          </button>
        </div>
      </div>

      {/* Handling control */}
      <div className="flex items-center gap-3 mb-5 p-3 bg-ink-2 border border-line rounded-sm">
        <span className="text-xs text-parchment-dim">Atendimento:</span>
        {lead.ai_active === true && (
          <>
            <span className="text-xs bg-jade/15 text-jade px-2 py-0.5 rounded-full font-medium">
              🤖 IA ativa
            </span>
            <button
              onClick={() => toggleHandling("human")}
              disabled={handlingBusy}
              className="text-xs px-3 py-1 rounded-sm border border-carimbo text-carimbo hover:bg-carimbo/10 disabled:opacity-50"
            >
              Assumir atendimento
            </button>
          </>
        )}
        {lead.ai_active === false && (
          <>
            <span className="text-xs bg-info/15 text-info px-2 py-0.5 rounded-full font-medium">
              👤 {lead.assigned_user?.full_name || "Humano"}
            </span>
            <button
              onClick={() => toggleHandling("ia")}
              disabled={handlingBusy}
              className="text-xs px-3 py-1 rounded-sm border border-jade text-jade hover:bg-jade/10 disabled:opacity-50"
            >
              Devolver para IA
            </button>
          </>
        )}
        {lead.ai_active === null && (
          <span className="text-xs text-parchment-faint">Sem IA envolvida</span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-line">
        {([
          { key: "info", label: "Informações" },
          { key: "whatsapp", label: "WhatsApp" },
          { key: "lembretes", label: "Lembretes", badge: activities.filter((a) => a.status === "pending").length },
          { key: "conversa", label: "Conversa IA" },
        ] as { key: Tab; label: string; badge?: number }[]).map(({ key, label, badge }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              tab === key
                ? "border-carimbo text-carimbo"
                : "border-transparent text-parchment-dim hover:text-parchment"
            }`}
          >
            {label}
            {badge !== undefined && badge > 0 && (
              <span className="text-[10px] bg-selo/15 text-selo px-1.5 py-0.5 rounded-full font-medium">
                {badge}
              </span>
            )}
            {key === "conversa" && conversation?.control === "awaiting_supervisor" && (
              <span className="w-2 h-2 rounded-full bg-selo inline-block" />
            )}
          </button>
        ))}
      </div>

      {/* Tab: Informações */}
      {tab === "info" && (
        <>
          {/* Pipeline */}
          <div className="bg-ink-2 border border-line rounded-sm p-4 mb-6">
            <h3 className="text-sm font-semibold text-parchment-dim mb-3">
              Pipeline
            </h3>
            <div className="flex gap-2 flex-wrap">
              {STATUS_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => changeStatus(value)}
                  disabled={lead.status === value}
                  className={`text-xs px-3 py-1.5 rounded-sm border transition-colors ${
                    lead.status === value
                      ? "bg-carimbo text-parchment border-carimbo"
                      : "bg-ink-2 text-parchment-dim border-line hover:bg-ink-3"
                  }`}
                >
                  {label}
                </button>
              ))}
              {!lead.contacted_at && lead.status === "novo" && (
                <button
                  onClick={handleContact}
                  className="text-xs px-3 py-1.5 rounded-sm bg-jade text-parchment hover:bg-jade/80 ml-2"
                >
                  Registrar 1o Contato
                </button>
              )}
            </div>
          </div>

          {/* Edit Form */}
          {editing && (
            <div className="bg-ink-2 border border-line rounded-sm p-4 mb-6 space-y-3">
              <h3 className="text-sm font-semibold text-parchment-dim">
                Editar Dados do Lead
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-parchment-dim mb-1">Nome</label>
                  <input
                    value={editForm.full_name}
                    onChange={(e) =>
                      setEditForm({ ...editForm, full_name: e.target.value })
                    }
                    className="w-full border border-line bg-ink/60 text-parchment rounded-sm px-3 py-2 text-sm focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-parchment-dim mb-1">Telefone</label>
                  <input
                    value={editForm.phone}
                    onChange={(e) =>
                      setEditForm({ ...editForm, phone: e.target.value })
                    }
                    className="w-full border border-line bg-ink/60 text-parchment rounded-sm px-3 py-2 text-sm focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-parchment-dim mb-1">E-mail</label>
                  <input
                    value={editForm.email}
                    onChange={(e) =>
                      setEditForm({ ...editForm, email: e.target.value })
                    }
                    className="w-full border border-line bg-ink/60 text-parchment rounded-sm px-3 py-2 text-sm focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-parchment-dim mb-1">
                    Valor orçamento (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.quote_value}
                    onChange={(e) =>
                      setEditForm({ ...editForm, quote_value: e.target.value })
                    }
                    className="w-full border border-line bg-ink/60 text-parchment rounded-sm px-3 py-2 text-sm focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-parchment-dim mb-1">
                    Descrição / Queixa
                  </label>
                  <textarea
                    value={editForm.description}
                    onChange={(e) =>
                      setEditForm({ ...editForm, description: e.target.value })
                    }
                    className="w-full border border-line bg-ink/60 text-parchment rounded-sm px-3 py-2 text-sm focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
                    rows={2}
                  />
                </div>
                <div>
                  <label className="block text-xs text-parchment-dim mb-1">
                    Próximo follow-up
                  </label>
                  <input
                    type="datetime-local"
                    value={editForm.next_followup_at}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        next_followup_at: e.target.value,
                      })
                    }
                    className="w-full border border-line bg-ink/60 text-parchment rounded-sm px-3 py-2 text-sm focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
                  />
                </div>
              </div>
              <button
                onClick={saveEdit}
                className="bg-carimbo text-parchment px-4 py-2 rounded-sm text-sm font-semibold hover:bg-carimbo-bright"
              >
                Salvar
              </button>
            </div>
          )}

          {/* Info Cards */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <InfoCard
              label="SLA Deadline"
              value={
                lead.sla_deadline
                  ? new Date(lead.sla_deadline).toLocaleString("pt-BR")
                  : "—"
              }
            />
            <InfoCard
              label="Primeiro Contato"
              value={
                lead.contacted_at
                  ? new Date(lead.contacted_at).toLocaleString("pt-BR")
                  : "Não contatado"
              }
            />
            <InfoCard label="UTM Source" value={lead.utm_source || "—"} />
            <InfoCard label="UTM Campaign" value={lead.utm_campaign || "—"} />
            <InfoCard
              label="Criado em"
              value={new Date(lead.created_at).toLocaleString("pt-BR")}
            />
            <InfoCard
              label="Valor Orçamento"
              value={
                lead.quote_value ? `R$ ${lead.quote_value.toFixed(2)}` : "—"
              }
            />
          </div>

          {/* Interactions */}
          <div className="bg-ink-2 border border-line rounded-sm p-4 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-parchment-dim">Interações</h3>
              <button
                onClick={() => setShowInteraction(!showInteraction)}
                className="text-sm text-carimbo hover:underline"
              >
                {showInteraction ? "Cancelar" : "+ Nova interação"}
              </button>
            </div>

            {showInteraction && (
              <div className="border border-line rounded-sm p-3 mb-4 space-y-2 bg-ink">
                <div className="flex gap-2">
                  <select
                    value={interactionForm.type}
                    onChange={(e) =>
                      setInteractionForm({
                        ...interactionForm,
                        type: e.target.value,
                      })
                    }
                    className="border border-line bg-ink/60 text-parchment rounded-sm px-2 py-1.5 text-sm focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
                  >
                    {INTERACTION_TYPES.map(({ value, label }) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <textarea
                  value={interactionForm.content}
                  onChange={(e) =>
                    setInteractionForm({
                      ...interactionForm,
                      content: e.target.value,
                    })
                  }
                  placeholder="Descreva o contato..."
                  className="w-full border border-line bg-ink/60 text-parchment placeholder:text-parchment-faint rounded-sm px-3 py-2 text-sm focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
                  rows={2}
                />
                <input
                  value={interactionForm.next_action}
                  onChange={(e) =>
                    setInteractionForm({
                      ...interactionForm,
                      next_action: e.target.value,
                    })
                  }
                  placeholder="Próxima ação (opcional)"
                  className="w-full border border-line bg-ink/60 text-parchment placeholder:text-parchment-faint rounded-sm px-3 py-2 text-sm focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
                />
                <button
                  onClick={addInteraction}
                  className="bg-carimbo text-parchment px-3 py-1.5 rounded-sm text-sm font-semibold hover:bg-carimbo-bright"
                >
                  Registrar
                </button>
              </div>
            )}

            {interactions.length === 0 ? (
              <p className="text-sm text-parchment-faint">
                Nenhuma interação registrada.
              </p>
            ) : (
              <div className="space-y-3">
                {interactions.map((int) => (
                  <div key={int.id} className="border-l-2 border-selo/40 pl-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-carimbo uppercase">
                        {INTERACTION_TYPES.find((t) => t.value === int.type)
                          ?.label || int.type}
                      </span>
                      <span className="text-xs text-parchment-faint">
                        {new Date(int.interacted_at).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <p className="text-sm text-parchment-dim">{int.content}</p>
                    {int.next_action && (
                      <p className="text-xs text-parchment-dim mt-1">
                        Próxima ação: {int.next_action}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Tab: WhatsApp */}
      {tab === "whatsapp" && (
        <WhatsAppTab
          leadId={lead.id}
          messages={outboundMessages}
          onSent={fetchAll}
        />
      )}

      {/* Tab: Lembretes */}
      {tab === "lembretes" && (
        <LembretesTab
          leadId={lead.id}
          activities={activities}
          currentUserId={user?.id ?? null}
          onChanged={fetchAll}
        />
      )}

      {/* Tab: Conversa da IA */}
      {tab === "conversa" && (
        <ConversaTab
          leadId={lead.id}
          conv={conversation}
          onRefresh={fetchConversation}
        />
      )}

      {/* Modals */}
      {showLostModal && (
        <Modal onClose={() => setShowLostModal(false)} title="Marcar como Perdido">
          <label className="block text-xs font-medium text-parchment-dim mb-1">
            Motivo da perda *
          </label>
          <select
            value={lostReason}
            onChange={(e) => setLostReason(e.target.value)}
            className="w-full border border-line bg-ink/60 text-parchment rounded-sm px-3 py-2 text-sm mb-3 focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
          >
            <option value="">Selecione um motivo...</option>
            {LOST_REASON_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowLostModal(false)}
              className="text-sm text-parchment-dim px-4 py-2"
            >
              Cancelar
            </button>
            <button
              onClick={handleLost}
              disabled={!lostReason}
              className="bg-carimbo-bright text-parchment px-4 py-2 rounded-sm text-sm font-semibold hover:bg-carimbo disabled:opacity-50"
            >
              Confirmar Perda
            </button>
          </div>
        </Modal>
      )}

      {showConvertModal && (
        <Modal
          onClose={() => setShowConvertModal(false)}
          title="Converter em Cliente"
        >
          <p className="text-sm text-parchment-dim mb-3">
            O lead será convertido em cliente.
          </p>
          <div className="mb-3">
            <label className="block text-xs text-parchment-dim mb-1">
              Nome do cliente
            </label>
            <input
              value={convertName}
              onChange={(e) => setConvertName(e.target.value)}
              className="w-full border border-line bg-ink/60 text-parchment rounded-sm px-3 py-2 text-sm focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowConvertModal(false)}
              className="text-sm text-parchment-dim px-4 py-2"
            >
              Cancelar
            </button>
            <button
              onClick={handleConvert}
              className="bg-jade text-parchment px-4 py-2 rounded-sm text-sm font-semibold hover:bg-jade/80"
            >
              Converter
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}

// --- WhatsApp Tab ---

function WhatsAppTab({
  leadId,
  messages,
  onSent,
}: {
  leadId: string;
  messages: LeadOutboundMessage[];
  onSent: () => void;
}) {
  const [msg, setMsg] = useState("");
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduledFor, setScheduledFor] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    if (!msg.trim()) return;
    setSending(true);
    try {
      await api.post(`/leads/${leadId}/send-whatsapp`, {
        message: msg,
        scheduled_for: scheduleMode && scheduledFor ? scheduledFor : null,
      });
      setMsg("");
      setScheduledFor("");
      setScheduleMode(false);
      onSent();
    } catch {
      alert("Erro ao enviar mensagem.");
    } finally {
      setSending(false);
    }
  }

  async function cancel(msgId: string) {
    if (!confirm("Cancelar mensagem agendada?")) return;
    try {
      await api.delete(`/leads/${leadId}/outbound-messages/${msgId}`);
      onSent();
    } catch {
      alert("Erro ao cancelar.");
    }
  }

  const statusLabel: Record<string, string> = {
    pending: "Agendada",
    sent: "Enviada",
    failed: "Falhou",
    cancelled: "Cancelada",
  };
  const statusColor: Record<string, string> = {
    pending: "bg-selo/15 text-selo",
    sent: "bg-jade/15 text-jade",
    failed: "bg-carimbo/10 text-carimbo-bright",
    cancelled: "bg-ink-3 text-parchment-faint",
  };

  return (
    <div className="space-y-4">
      {/* Send form */}
      <div className="bg-ink-2 border border-line rounded-sm p-4 space-y-3">
        <h4 className="text-sm font-semibold text-parchment-dim">Nova mensagem WhatsApp</h4>
        <textarea
          rows={3}
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder="Digite a mensagem..."
          className="w-full border border-line bg-ink/60 text-parchment placeholder:text-parchment-faint rounded-sm px-3 py-2 text-sm focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
        />
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-parchment-dim cursor-pointer">
            <input
              type="radio"
              checked={!scheduleMode}
              onChange={() => setScheduleMode(false)}
            />
            Enviar agora
          </label>
          <label className="flex items-center gap-2 text-sm text-parchment-dim cursor-pointer">
            <input
              type="radio"
              checked={scheduleMode}
              onChange={() => setScheduleMode(true)}
            />
            Agendar para:
          </label>
          {scheduleMode && (
            <input
              type="datetime-local"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
              className="border border-line bg-ink/60 text-parchment rounded-sm px-2 py-1 text-sm focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
            />
          )}
        </div>
        <button
          onClick={send}
          disabled={sending || !msg.trim() || (scheduleMode && !scheduledFor)}
          className="bg-jade text-parchment px-4 py-2 rounded-sm text-sm font-semibold hover:bg-jade/80 disabled:opacity-50"
        >
          {sending ? "Enviando..." : scheduleMode ? "Agendar" : "Enviar agora"}
        </button>
      </div>

      {/* History */}
      {messages.length > 0 && (
        <div className="bg-ink-2 border border-line rounded-sm p-4">
          <h4 className="text-sm font-semibold text-parchment-dim mb-3">Histórico</h4>
          <div className="space-y-2">
            {messages.map((m) => (
              <div key={m.id} className="border border-line rounded-sm p-3 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[m.status]}`}>
                    {statusLabel[m.status]}
                  </span>
                  <span className="text-xs text-parchment-faint">
                    {m.scheduled_for
                      ? `Agendada: ${new Date(m.scheduled_for).toLocaleString("pt-BR")}`
                      : m.sent_at
                      ? new Date(m.sent_at).toLocaleString("pt-BR")
                      : new Date(m.created_at).toLocaleString("pt-BR")}
                  </span>
                </div>
                <p className="text-parchment-dim whitespace-pre-wrap">{m.message}</p>
                {m.error && <p className="text-xs text-carimbo-bright mt-1">{m.error}</p>}
                {m.status === "pending" && (
                  <button
                    onClick={() => cancel(m.id)}
                    className="text-xs text-carimbo-bright hover:text-carimbo mt-1"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Lembretes Tab ---

function LembretesTab({
  leadId,
  activities,
  currentUserId,
  onChanged,
}: {
  leadId: string;
  activities: LeadActivity[];
  currentUserId: string | null;
  onChanged: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", due_at: "" });
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await api.post(`/leads/${leadId}/activities`, {
        title: form.title,
        description: form.description || null,
        due_at: form.due_at || null,
      });
      setForm({ title: "", description: "", due_at: "" });
      setShowForm(false);
      onChanged();
    } catch {
      alert("Erro ao criar lembrete.");
    } finally {
      setSaving(false);
    }
  }

  async function complete(actId: string) {
    try {
      await api.patch(`/leads/${leadId}/activities/${actId}`, { status: "done" });
      onChanged();
    } catch {
      alert("Erro ao concluir.");
    }
  }

  async function cancel(actId: string) {
    try {
      await api.patch(`/leads/${leadId}/activities/${actId}`, { status: "cancelled" });
      onChanged();
    } catch {
      alert("Erro ao cancelar.");
    }
  }

  const pending = activities.filter((a) => a.status === "pending");
  const done = activities.filter((a) => a.status !== "pending");

  function isOverdue(due_at: string | null) {
    if (!due_at) return false;
    return new Date(due_at) < new Date();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-parchment-dim">
          Lembretes / Atividades
        </h4>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-sm text-carimbo hover:underline"
        >
          {showForm ? "Cancelar" : "+ Novo lembrete"}
        </button>
      </div>

      {showForm && (
        <div className="bg-ink-2 border border-line rounded-sm p-4 space-y-3">
          <div>
            <label className="block text-xs text-parchment-dim mb-1">Título *</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Ex: Ligar para confirmar interesse"
              className="w-full border border-line bg-ink/60 text-parchment placeholder:text-parchment-faint rounded-sm px-3 py-2 text-sm focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-parchment-dim mb-1">Descrição (opcional)</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full border border-line bg-ink/60 text-parchment rounded-sm px-3 py-2 text-sm focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-parchment-dim mb-1">Vencimento (opcional)</label>
            <input
              type="datetime-local"
              value={form.due_at}
              onChange={(e) => setForm({ ...form, due_at: e.target.value })}
              className="border border-line bg-ink/60 text-parchment rounded-sm px-3 py-2 text-sm focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
            />
          </div>
          <button
            onClick={create}
            disabled={saving || !form.title.trim()}
            className="bg-carimbo text-parchment px-4 py-2 rounded-sm text-sm font-semibold hover:bg-carimbo-bright disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Criar lembrete"}
          </button>
        </div>
      )}

      {/* Pending */}
      {pending.length === 0 && !showForm ? (
        <div className="bg-ink-2 border border-line rounded-sm p-6 text-center text-sm text-parchment-faint">
          Nenhum lembrete pendente.
        </div>
      ) : (
        <div className="space-y-2">
          {pending.map((a) => (
            <div
              key={a.id}
              className={`bg-ink-2 border border-line rounded-sm p-3 flex items-start gap-3 ${
                isOverdue(a.due_at) ? "border-selo/40 bg-selo/10" : ""
              }`}
            >
              <button
                onClick={() => complete(a.id)}
                className="mt-0.5 w-5 h-5 rounded-sm border-2 border-line hover:border-jade flex-shrink-0 transition-colors"
                title="Marcar como concluído"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-parchment">{a.title}</p>
                {a.description && (
                  <p className="text-xs text-parchment-dim mt-0.5">{a.description}</p>
                )}
                {a.due_at && (
                  <p className={`text-xs mt-1 font-medium ${isOverdue(a.due_at) ? "text-selo" : "text-parchment-faint"}`}>
                    {isOverdue(a.due_at) ? "⚠️ " : ""}
                    Vence: {new Date(a.due_at).toLocaleString("pt-BR")}
                  </p>
                )}
              </div>
              <button
                onClick={() => cancel(a.id)}
                className="text-xs text-parchment-faint hover:text-carimbo-bright flex-shrink-0"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Completed */}
      {done.length > 0 && (
        <details className="bg-ink-2 border border-line rounded-sm overflow-hidden">
          <summary className="px-4 py-3 text-sm text-parchment-dim cursor-pointer hover:bg-ink-3">
            {done.length} concluído(s) / cancelado(s)
          </summary>
          <div className="border-t border-line divide-y divide-line">
            {done.map((a) => (
              <div key={a.id} className="px-4 py-2.5 flex items-center gap-3">
                <span className="text-parchment-faint text-base">
                  {a.status === "done" ? "✓" : "—"}
                </span>
                <span className="text-sm text-parchment-dim line-through">{a.title}</span>
                {a.completed_at && (
                  <span className="text-xs text-parchment-faint ml-auto">
                    {new Date(a.completed_at).toLocaleDateString("pt-BR")}
                  </span>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-ink-2 border border-line rounded-sm px-4 py-3">
      <p className="text-xs text-parchment-dim">{label}</p>
      <p className="text-sm font-medium text-parchment">{value}</p>
    </div>
  );
}

function Modal({
  onClose,
  title,
  children,
}: {
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-ink-2 border border-line rounded-sm p-6 w-full max-w-md">
        <h2 className="text-lg font-display font-semibold text-parchment mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}
