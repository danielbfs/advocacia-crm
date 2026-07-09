"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

interface FollowupRule {
  id: string;
  name: string;
  trigger_event: string;
  offset_minutes: number;
  message_template: string;
  channel: string | null;
  is_active: boolean;
  created_at: string;
}

interface FollowupJob {
  id: string;
  rule_id: string;
  consultation_id: string;
  client_id: string;
  scheduled_for: string;
  status: string;
  error_message: string | null;
  executed_at: string | null;
}

const TRIGGER_EVENTS = [
  { value: "consultation_scheduled", label: "Agendamento criado" },
  { value: "consultation_confirmed", label: "Agendamento confirmado" },
  { value: "consultation_cancelled", label: "Agendamento cancelado" },
  { value: "no_show", label: "Cliente faltou" },
];

const CHANNELS = [
  { value: "", label: "Mesmo canal do cliente" },
  { value: "telegram", label: "Telegram" },
  { value: "whatsapp", label: "WhatsApp" },
];

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-selo/15 text-selo",
  sent: "bg-jade/15 text-jade",
  failed: "bg-carimbo/10 text-carimbo-bright",
  cancelled: "bg-ink-3 text-parchment-faint",
};

export default function FollowUpsPage() {
  const [rules, setRules] = useState<FollowupRule[]>([]);
  const [jobs, setJobs] = useState<FollowupJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"rules" | "jobs">("rules");

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    trigger_event: "consultation_scheduled",
    offset_minutes: -1440,
    message_template: "",
    channel: "",
    is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const templateRef = useRef<HTMLTextAreaElement>(null);

  // Jobs filter
  const [jobFilter, setJobFilter] = useState<string>("");

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [rulesRes, jobsRes] = await Promise.allSettled([
        api.get("/followup/rules"),
        api.get("/followup/jobs"),
      ]);
      if (rulesRes.status === "fulfilled") setRules(rulesRes.value.data);
      if (jobsRes.status === "fulfilled") setJobs(jobsRes.value.data);
    } finally {
      setLoading(false);
    }
  }

  async function fetchJobs(status?: string) {
    try {
      const params = status ? { status } : {};
      const { data } = await api.get("/followup/jobs", { params });
      setJobs(data);
    } catch {
      // ignore
    }
  }

  function openCreate() {
    setEditingId(null);
    setForm({
      name: "",
      trigger_event: "consultation_scheduled",
      offset_minutes: -1440,
      message_template:
        "Olá {client_name}! Lembramos que sua consulta com {lawyer_name} ({practice_area}) está marcada para {consultation_date}. Confirme sua presença respondendo esta mensagem.",
      channel: "",
      is_active: true,
    });
    setShowForm(true);
  }

  function insertVariable(variable: string) {
    const el = templateRef.current;
    if (!el) {
      setForm((f) => ({ ...f, message_template: f.message_template + variable }));
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const newVal = el.value.slice(0, start) + variable + el.value.slice(end);
    setForm((f) => ({ ...f, message_template: newVal }));
    // Restore cursor after the inserted variable
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + variable.length, start + variable.length);
    });
  }

  function openEdit(rule: FollowupRule) {
    setEditingId(rule.id);
    setForm({
      name: rule.name,
      trigger_event: rule.trigger_event,
      offset_minutes: rule.offset_minutes,
      message_template: rule.message_template,
      channel: rule.channel || "",
      is_active: rule.is_active,
    });
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        trigger_event: form.trigger_event,
        offset_minutes: form.offset_minutes,
        message_template: form.message_template,
        channel: form.channel || null,
        is_active: form.is_active,
      };
      if (editingId) {
        await api.patch(`/followup/rules/${editingId}`, payload);
      } else {
        await api.post("/followup/rules", payload);
      }
      cancelForm();
      fetchData();
    } catch {
      alert("Erro ao salvar regra de follow-up.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(rule: FollowupRule) {
    try {
      await api.patch(`/followup/rules/${rule.id}`, { is_active: !rule.is_active });
      fetchData();
    } catch {
      // ignore
    }
  }

  async function deleteRule(rule: FollowupRule) {
    if (!confirm(`Excluir regra "${rule.name}"?`)) return;
    try {
      await api.delete(`/followup/rules/${rule.id}`);
      fetchData();
    } catch {
      alert("Erro ao excluir regra.");
    }
  }

  function formatOffset(minutes: number): string {
    const abs = Math.abs(minutes);
    const direction = minutes < 0 ? "antes" : "depois";
    if (abs < 60) return `${abs} min ${direction}`;
    if (abs < 1440) return `${Math.round(abs / 60)}h ${direction}`;
    return `${Math.round(abs / 1440)}d ${direction}`;
  }

  function triggerLabel(event: string): string {
    return TRIGGER_EVENTS.find((e) => e.value === event)?.label || event;
  }

  if (loading) return <div className="p-8 text-parchment-faint">Carregando...</div>;

  return (
    <main className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-semibold text-parchment">Follow-ups</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-line">
        <button
          onClick={() => setTab("rules")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "rules"
              ? "border-carimbo text-carimbo"
              : "border-transparent text-parchment-dim hover:text-parchment"
          }`}
        >
          Regras
        </button>
        <button
          onClick={() => {
            setTab("jobs");
            fetchJobs(jobFilter || undefined);
          }}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "jobs"
              ? "border-carimbo text-carimbo"
              : "border-transparent text-parchment-dim hover:text-parchment"
          }`}
        >
          Execuções
        </button>
      </div>

      {/* Rules Tab */}
      {tab === "rules" && (
        <>
          <div className="flex justify-end mb-4">
            <button
              onClick={showForm ? cancelForm : openCreate}
              className="bg-carimbo text-parchment px-4 py-2 rounded-sm text-sm font-medium hover:bg-carimbo-bright"
            >
              {showForm ? "Cancelar" : "Nova Regra"}
            </button>
          </div>

          {showForm && (
            <form onSubmit={handleSubmit} className="bg-ink-2/30 border border-line rounded-sm p-4 mb-6 space-y-3">
              <h3 className="text-sm font-semibold text-parchment-dim">
                {editingId ? "Editar Regra" : "Nova Regra de Follow-up"}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-mono text-[10px] tracking-[0.2em] uppercase text-parchment-dim mb-1">Nome</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                    placeholder="Ex: Lembrete 24h antes"
                    className="w-full border border-line rounded-sm px-3 py-2 text-sm bg-ink text-parchment focus:border-carimbo focus:ring-1 focus:ring-carimbo"
                  />
                </div>
                <div>
                  <label className="block font-mono text-[10px] tracking-[0.2em] uppercase text-parchment-dim mb-1">Evento gatilho</label>
                  <select
                    value={form.trigger_event}
                    onChange={(e) => setForm({ ...form, trigger_event: e.target.value })}
                    className="w-full border border-line rounded-sm px-3 py-2 text-sm bg-ink text-parchment focus:border-carimbo focus:ring-1 focus:ring-carimbo"
                  >
                    {TRIGGER_EVENTS.map((te) => (
                      <option key={te.value} value={te.value}>
                        {te.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-mono text-[10px] tracking-[0.2em] uppercase text-parchment-dim mb-1">
                    Offset (minutos)
                  </label>
                  <input
                    type="number"
                    value={form.offset_minutes}
                    onChange={(e) => setForm({ ...form, offset_minutes: Number(e.target.value) })}
                    className="w-full border border-line rounded-sm px-3 py-2 text-sm bg-ink text-parchment focus:border-carimbo focus:ring-1 focus:ring-carimbo"
                  />
                  <p className="text-xs text-parchment-faint mt-1">
                    Negativo = antes do evento. Ex: -1440 = 24h antes, 60 = 1h depois
                  </p>
                </div>
                <div>
                  <label className="block font-mono text-[10px] tracking-[0.2em] uppercase text-parchment-dim mb-1">Canal de envio</label>
                  <select
                    value={form.channel}
                    onChange={(e) => setForm({ ...form, channel: e.target.value })}
                    className="w-full border border-line rounded-sm px-3 py-2 text-sm bg-ink text-parchment focus:border-carimbo focus:ring-1 focus:ring-carimbo"
                  >
                    {CHANNELS.map((ch) => (
                      <option key={ch.value} value={ch.value}>
                        {ch.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-mono text-[10px] tracking-[0.2em] uppercase text-parchment-dim">
                    Template da mensagem
                  </label>
                  <span className="text-xs text-parchment-faint">Clique numa variável para inserir no cursor</span>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {[
                    { tag: "{client_name}",    label: "Nome do cliente"     },
                    { tag: "{lawyer_name}",     label: "Nome do advogado"    },
                    { tag: "{practice_area}",       label: "Área de Atuação"    },
                    { tag: "{consultation_date}", label: "Data/hora consulta" },
                  ].map(({ tag, label }) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => insertVariable(tag)}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-info/15 hover:bg-info/25 text-info text-xs rounded-sm border border-info/30 transition-colors font-mono"
                      title={label}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
                <textarea
                  ref={templateRef}
                  value={form.message_template}
                  onChange={(e) => setForm({ ...form, message_template: e.target.value })}
                  required
                  rows={4}
                  className="w-full border border-line rounded-sm px-3 py-2 text-sm bg-ink text-parchment focus:border-carimbo focus:ring-1 focus:ring-carimbo"
                  placeholder="Ex: Olá {client_name}! Sua consulta com {lawyer_name} ({practice_area}) está marcada para {consultation_date}."
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  id="is_active"
                  className="rounded"
                />
                <label htmlFor="is_active" className="text-sm text-parchment-dim">
                  Regra ativa
                </label>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-carimbo text-parchment px-4 py-2 rounded-sm text-sm font-medium hover:bg-carimbo-bright disabled:opacity-50"
                >
                  {saving ? "Salvando..." : editingId ? "Salvar" : "Criar"}
                </button>
                <button type="button" onClick={cancelForm} className="text-sm text-parchment-dim px-4 py-2">
                  Cancelar
                </button>
              </div>
            </form>
          )}

          <div className="bg-ink-2/30 border border-line rounded-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-ink-2 border-b border-line">
                <tr>
                  <th className="text-left px-4 py-3 text-parchment-dim font-medium">Nome</th>
                  <th className="text-left px-4 py-3 text-parchment-dim font-medium">Evento</th>
                  <th className="text-left px-4 py-3 text-parchment-dim font-medium">Offset</th>
                  <th className="text-left px-4 py-3 text-parchment-dim font-medium">Canal</th>
                  <th className="text-left px-4 py-3 text-parchment-dim font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-parchment-dim font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rules.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-parchment-faint">
                      Nenhuma regra de follow-up cadastrada.
                    </td>
                  </tr>
                ) : (
                  rules.map((rule) => (
                    <tr key={rule.id} className="hover:bg-ink-3">
                      <td className="px-4 py-3 font-medium text-parchment">{rule.name}</td>
                      <td className="px-4 py-3 text-parchment-dim">{triggerLabel(rule.trigger_event)}</td>
                      <td className="px-4 py-3 text-parchment-dim">{formatOffset(rule.offset_minutes)}</td>
                      <td className="px-4 py-3 text-parchment-dim">{rule.channel || "Cliente"}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            rule.is_active
                              ? "bg-jade/15 text-jade"
                              : "bg-ink-3 text-parchment-faint"
                          }`}
                        >
                          {rule.is_active ? "Ativa" : "Inativa"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-3">
                          <button
                            onClick={() => openEdit(rule)}
                            className="text-xs text-carimbo hover:underline"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => toggleActive(rule)}
                            className="text-xs text-selo hover:underline"
                          >
                            {rule.is_active ? "Desativar" : "Ativar"}
                          </button>
                          <button
                            onClick={() => deleteRule(rule)}
                            className="text-xs text-carimbo-bright hover:underline"
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Jobs Tab */}
      {tab === "jobs" && (
        <>
          <div className="flex gap-2 mb-4">
            {["", "pending", "sent", "failed", "cancelled"].map((s) => (
              <button
                key={s}
                onClick={() => {
                  setJobFilter(s);
                  fetchJobs(s || undefined);
                }}
                className={`px-3 py-1.5 text-xs rounded-full font-medium border transition-colors ${
                  jobFilter === s
                    ? "bg-carimbo text-parchment border-carimbo"
                    : "bg-ink-2/30 text-parchment-dim border-line hover:bg-ink-3"
                }`}
              >
                {s === "" ? "Todos" : s === "pending" ? "Pendentes" : s === "sent" ? "Enviados" : s === "failed" ? "Falhas" : "Cancelados"}
              </button>
            ))}
          </div>

          <div className="bg-ink-2/30 border border-line rounded-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-ink-2 border-b border-line">
                <tr>
                  <th className="text-left px-4 py-3 text-parchment-dim font-medium">Agendado para</th>
                  <th className="text-left px-4 py-3 text-parchment-dim font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-parchment-dim font-medium">Executado em</th>
                  <th className="text-left px-4 py-3 text-parchment-dim font-medium">Erro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {jobs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-parchment-faint">
                      Nenhuma execução encontrada.
                    </td>
                  </tr>
                ) : (
                  jobs.map((job) => (
                    <tr key={job.id} className="hover:bg-ink-3">
                      <td className="px-4 py-3 text-parchment">
                        {new Date(job.scheduled_for).toLocaleString("pt-BR")}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            STATUS_COLORS[job.status] || "bg-ink-3 text-parchment-faint"
                          }`}
                        >
                          {job.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-parchment-dim">
                        {job.executed_at
                          ? new Date(job.executed_at).toLocaleString("pt-BR")
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-parchment-dim text-xs max-w-xs truncate">
                        {job.error_message || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
