"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ToastMessage } from "@/components/toast-message";
import type {
  Lawyer,
  Lead,
  LeadStatus,
  PipelineConfig,
  PipelineStageMetric,
  User,
} from "@/types";

type ViewMode = "kanban" | "list";

const STATUS_COLORS: Record<string, string> = {
  novo: "bg-info",
  em_contato: "bg-selo",
  qualificado: "bg-parchment-dim",
  proposta_enviada: "bg-selo",
  negociando: "bg-carimbo",
  convertido: "bg-jade",
  perdido: "bg-parchment-faint",
};

const STATUS_BORDER: Record<string, string> = {
  novo: "border-info/30",
  em_contato: "border-selo/30",
  qualificado: "border-parchment-dim/30",
  proposta_enviada: "border-selo/30",
  negociando: "border-carimbo/30",
  convertido: "border-jade/30",
  perdido: "border-line",
};

const STATUS_BG_LIGHT: Record<string, string> = {
  novo: "bg-info/10",
  em_contato: "bg-selo/10",
  qualificado: "bg-ink-2/30",
  proposta_enviada: "bg-selo/10",
  negociando: "bg-carimbo/10",
  convertido: "bg-jade/10",
  perdido: "bg-ink-2/30",
};

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

const CHANNEL_OPTIONS = Object.entries(CHANNEL_LABELS).map(([v, l]) => ({
  value: v,
  label: l,
}));

const PERIODS = [
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
  { value: "all", label: "Tudo" },
];

function formatCurrency(n: number | null | undefined): string {
  if (!n) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function relativeDate(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

export function LeadsListView({ basePath = "/secretary/leads" }: { basePath?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();

  // Data
  const [config, setConfig] = useState<PipelineConfig | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [pipeline, setPipeline] = useState<PipelineStageMetric[]>([]);
  const [sla, setSla] = useState<{ total: number; within_sla: number; overdue: number; sla_rate: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const searchParams = useSearchParams();
  // View
  const [view, setView] = useState<ViewMode>(searchParams.get("status") ? "list" : "kanban");

  // Filters
  const [period, setPeriod] = useState<string>("30d");
  const [filterAssigned, setFilterAssigned] = useState<string>("all"); // all | mine | <userId> | unassigned
  const [filterChannel, setFilterChannel] = useState<string>("all");
  const [filterOverdue, setFilterOverdue] = useState<boolean>(false);
  const [search, setSearch] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>(searchParams.get("status") || "all");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");

  // Selection / bulk
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [transitionModal, setTransitionModal] = useState<{
    lead: Lead;
    target: LeadStatus;
  } | null>(null);
  const [convertModal, setConvertModal] = useState<Lead | null>(null);
  const [bulkAssignModal, setBulkAssignModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Drag state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<LeadStatus | null>(null);

  useEffect(() => {
    Promise.allSettled([
      api.get("/leads/pipeline/config"),
      api.get("/auth/users/assignable"),
    ]).then(([cfg, usrs]) => {
      if (cfg.status === "fulfilled") setConfig(cfg.value.data);
      if (usrs.status === "fulfilled") setUsers(usrs.value.data);
    });
  }, []);

  useEffect(() => {
    const deletedCode = searchParams.get("deleted");
    if (!deletedCode) return;
    setToastMessage(`Lead ${deletedCode} excluído com sucesso.`);
    router.replace(pathname);
  }, [searchParams, router, pathname]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    fetchLeads();
    fetchMetrics();
  }, [filterAssigned, filterChannel, filterStatus, filterOverdue, debouncedSearch, period, user?.id]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 2500);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  async function fetchLeads() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterChannel !== "all") params.set("channel", filterChannel);
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterOverdue) params.set("is_overdue", "true");
      if (filterAssigned === "mine" && user) params.set("assigned_to", user.id);
      else if (filterAssigned !== "all" && filterAssigned !== "unassigned")
        params.set("assigned_to", filterAssigned);
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      const { data } = await api.get(`/leads/?${params}`);
      let result: Lead[] = data;
      if (filterAssigned === "unassigned") {
        result = result.filter((l) => !l.assigned_to);
      }
      setLeads(result);
    } catch {
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchMetrics() {
    try {
      const [pipelineRes, slaRes] = await Promise.allSettled([
        api.get(`/leads/reports/pipeline?period=${period}`),
        api.get(`/leads/reports/sla?period=${period}`),
      ]);
      if (pipelineRes.status === "fulfilled") setPipeline(pipelineRes.value.data);
      if (slaRes.status === "fulfilled") setSla(slaRes.value.data);
    } catch {
      // ignore
    }
  }

  function statusLabel(s: LeadStatus): string {
    return config?.status_labels[s] || s;
  }

  function isAllowed(from: LeadStatus, to: LeadStatus): boolean {
    if (!config) return true;
    return (config.allowed_transitions[from] || []).includes(to);
  }

  function canTransition(lead: Lead, target: LeadStatus): boolean {
    if (target === "convertido") return false; // usa modal próprio
    return isAllowed(lead.status, target);
  }

  async function performTransition(
    leadId: string,
    target: LeadStatus,
    note?: string,
    lost_reason?: string,
  ) {
    try {
      await api.post(`/leads/${leadId}/transition`, {
        to_status: target,
        note: note || null,
        lost_reason: lost_reason || null,
      });
      setTransitionModal(null);
      fetchLeads();
      fetchMetrics();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      alert(e.response?.data?.detail || "Erro ao mover o lead.");
    }
  }

  async function quickAssignMe(leadId: string) {
    if (!user) return;
    try {
      await api.patch(`/leads/${leadId}/assign`, { assigned_to: user.id });
      fetchLeads();
    } catch {
      alert("Erro ao atribuir.");
    }
  }

  async function performDelete(lead: Lead) {
    if (!window.confirm(`Excluir lead ${lead.code} (${lead.full_name || lead.phone})? Esta ação é permanente.`)) return;
    try {
      await api.delete(`/leads/${lead.id}`);
      setToastMessage(`Lead ${lead.code} excluído com sucesso.`);
      fetchLeads();
      fetchMetrics();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      alert(e.response?.data?.detail || "Erro ao excluir o lead.");
    }
  }

  async function exportCsv() {
    try {
      const params = new URLSearchParams();
      if (filterChannel !== "all") params.set("channel", filterChannel);
      if (filterOverdue) params.set("is_overdue", "true");
      if (filterAssigned === "mine" && user) params.set("assigned_to", user.id);
      else if (filterAssigned !== "all" && filterAssigned !== "unassigned")
        params.set("assigned_to", filterAssigned);
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      const { data } = await api.get(`/leads/export.csv?${params}`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(new Blob([data], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Erro ao exportar.");
    }
  }

  // ==== Drag & Drop ====
  function onDragStart(e: React.DragEvent, lead: Lead) {
    setDraggingId(lead.id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", lead.id);
  }

  function onDragOver(e: React.DragEvent, status: LeadStatus) {
    if (!draggingId) return;
    e.preventDefault();
    setDragOverColumn(status);
  }

  function onDrop(e: React.DragEvent, status: LeadStatus) {
    e.preventDefault();
    setDragOverColumn(null);
    const leadId = e.dataTransfer.getData("text/plain");
    setDraggingId(null);
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.status === status) return;

    // Validate transition
    if (!isAllowed(lead.status, status)) {
      alert(
        `Transição "${statusLabel(lead.status)}" → "${statusLabel(status)}" não permitida.`,
      );
      return;
    }

    if (status === "convertido") {
      setConvertModal(lead);
      return;
    }

    // Para perdido, abre modal pedindo motivo
    // Para outros, abre modal de confirmação leve
    setTransitionModal({ lead, target: status });
  }

  function onDragEnd() {
    setDraggingId(null);
    setDragOverColumn(null);
  }

  // ==== Selection (lista) ====
  function toggleSelected(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function selectAll(visible: Lead[]) {
    if (selected.size === visible.length) setSelected(new Set());
    else setSelected(new Set(visible.map((l) => l.id)));
  }

  // ==== Derived ====
  const visibleByStatus = useMemo(() => {
    const map: Partial<Record<LeadStatus, Lead[]>> = {};
    if (!config) return map;
    for (const s of config.statuses) map[s] = [];
    for (const l of leads) {
      const arr = map[l.status as LeadStatus];
      if (arr) arr.push(l);
    }
    return map;
  }, [leads, config]);

  const totalLeads = leads.length;
  const newLeads = leads.filter((l) => l.status === "novo").length;
  const overdueCount = leads.filter((l) => l.is_overdue).length;
  const totalConverted = pipeline.find((p) => p.status === "convertido")?.total || 0;
  const totalPipeline = pipeline.reduce((s, p) => s + p.total, 0);
  const conversionRate =
    totalPipeline > 0 ? ((totalConverted / totalPipeline) * 100).toFixed(1) : "0";

  return (
    <main className="p-8">
      {toastMessage && <ToastMessage message={toastMessage} type="success" />}
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-2xl font-display font-semibold text-parchment">Pipeline de Leads</h1>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={exportCsv}
            className="border border-line bg-ink/40 px-3 py-2 rounded-sm text-sm text-parchment-dim hover:border-selo/50 hover:bg-ink-3"
            title="Exportar CSV com os filtros atuais"
          >
            Exportar CSV
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-carimbo text-parchment px-4 py-2 rounded-sm text-sm font-semibold hover:bg-carimbo-bright active:translate-y-px shadow-[0_1px_0_0_rgba(0,0,0,0.4)]"
          >
            Novo Lead
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Metric label="Total no período" value={totalPipeline} />
        <Metric label="Novos (não tratados)" value={newLeads} accent="text-carimbo" />
        <Metric
          label="SLA vencido"
          value={overdueCount}
          accent={overdueCount > 0 ? "text-carimbo-bright" : "text-parchment"}
        />
        <Metric label="Conversão" value={`${conversionRate}%`} accent="text-jade" />
      </div>

      {/* Filters */}
      <div className="bg-ink-2 border border-line rounded-sm p-3 mb-4 flex flex-wrap items-center gap-2 text-sm">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar nome, telefone ou e-mail..."
          className="border border-line bg-ink/60 text-parchment placeholder:text-parchment-faint rounded-sm px-3 py-1.5 flex-1 min-w-[200px] focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
        />
        <select
          value={filterAssigned}
          onChange={(e) => setFilterAssigned(e.target.value)}
          className="border border-line bg-ink/60 text-parchment rounded-sm px-3 py-1.5 focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
        >
          <option value="all">Todos os responsáveis</option>
          <option value="mine">Atribuídos a mim</option>
          <option value="unassigned">Sem responsável</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name}
            </option>
          ))}
        </select>
        <select
          value={filterChannel}
          onChange={(e) => setFilterChannel(e.target.value)}
          className="border border-line bg-ink/60 text-parchment rounded-sm px-3 py-1.5 focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
        >
          <option value="all">Todos canais</option>
          {CHANNEL_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="border border-line bg-ink/60 text-parchment rounded-sm px-3 py-1.5 focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
        >
          <option value="all">Todos os status</option>
          {config && config.statuses.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="border border-line bg-ink/60 text-parchment rounded-sm px-3 py-1.5 focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
          title="Período usado nos KPIs"
        >
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-parchment-dim select-none cursor-pointer">
          <input
            type="checkbox"
            checked={filterOverdue}
            onChange={(e) => setFilterOverdue(e.target.checked)}
          />
          SLA vencido
        </label>
        <div className="ml-auto flex border border-line rounded-sm overflow-hidden">
          <button
            onClick={() => setView("kanban")}
            className={`px-3 py-1.5 text-sm ${view === "kanban" ? "bg-carimbo text-parchment" : "bg-ink-2 text-parchment-dim"}`}
          >
            Kanban
          </button>
          <button
            onClick={() => setView("list")}
            className={`px-3 py-1.5 text-sm ${view === "list" ? "bg-carimbo text-parchment" : "bg-ink-2 text-parchment-dim"}`}
          >
            Lista
          </button>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="bg-info/10 border border-info/40 rounded-sm p-3 mb-4 flex items-center gap-3">
          <span className="text-sm text-parchment font-medium">
            {selected.size} selecionado(s)
          </span>
          <button
            onClick={() => setBulkAssignModal(true)}
            className="bg-carimbo text-parchment text-xs px-3 py-1.5 rounded-sm hover:bg-carimbo-bright"
          >
            Atribuir...
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs text-parchment-dim ml-auto"
          >
            Limpar
          </button>
        </div>
      )}

      {/* Body */}
      {loading ? (
        <p className="text-parchment-faint">Carregando...</p>
      ) : !config ? (
        <p className="text-parchment-faint">Aguardando configuração do pipeline...</p>
      ) : view === "kanban" ? (
        <KanbanBoard
          config={config}
          leadsByStatus={visibleByStatus}
          draggingId={draggingId}
          dragOverColumn={dragOverColumn}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onDragEnd={onDragEnd}
          onCardClick={(l) => router.push(`${basePath}/${l.id}`)}
          onAssignMe={quickAssignMe}
          onDelete={performDelete}
          currentUserId={user?.id || null}
          statusLabel={statusLabel}
        />
      ) : (
        <LeadsTable
          leads={leads}
          selected={selected}
          onToggle={toggleSelected}
          onSelectAll={() => selectAll(leads)}
          statusLabel={statusLabel}
          onClick={(l) => router.push(`${basePath}/${l.id}`)}
          onDelete={performDelete}
        />
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateLeadModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            fetchLeads();
            fetchMetrics();
          }}
        />
      )}

      {/* Transition modal */}
      {transitionModal && config && (
        <TransitionModal
          lead={transitionModal.lead}
          target={transitionModal.target}
          statusLabel={statusLabel}
          lostReasons={config.lost_reasons}
          onClose={() => setTransitionModal(null)}
          onConfirm={(note, lost_reason) =>
            performTransition(
              transitionModal.lead.id,
              transitionModal.target,
              note,
              lost_reason,
            )
          }
        />
      )}

      {/* Convert modal */}
      {convertModal && (
        <ConvertLeadModal
          lead={convertModal}
          onClose={() => setConvertModal(null)}
          onConverted={() => {
            setConvertModal(null);
            fetchLeads();
            fetchMetrics();
          }}
        />
      )}

      {/* Bulk assign modal */}
      {bulkAssignModal && (
        <BulkAssignModal
          users={users}
          selectedCount={selected.size}
          onClose={() => setBulkAssignModal(false)}
          onConfirm={async (assigned_to) => {
            try {
              await api.post("/leads/bulk/assign", {
                lead_ids: Array.from(selected),
                assigned_to,
              });
              setBulkAssignModal(false);
              setSelected(new Set());
              fetchLeads();
            } catch {
              alert("Erro ao atribuir em lote.");
            }
          }}
        />
      )}
    </main>
  );
}

// ===== Subcomponents =====

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: string;
}) {
  return (
    <div className="bg-ink-2 border border-line rounded-sm p-3">
      <div className="text-xs text-parchment-dim mb-1">{label}</div>
      <div className={`text-2xl font-display font-semibold ${accent || "text-parchment"}`}>{value}</div>
    </div>
  );
}

function KanbanBoard({
  config,
  leadsByStatus,
  draggingId,
  dragOverColumn,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onCardClick,
  onAssignMe,
  onDelete,
  currentUserId,
  statusLabel,
}: {
  config: PipelineConfig;
  leadsByStatus: Partial<Record<LeadStatus, Lead[]>>;
  draggingId: string | null;
  dragOverColumn: LeadStatus | null;
  onDragStart: (e: React.DragEvent, lead: Lead) => void;
  onDragOver: (e: React.DragEvent, status: LeadStatus) => void;
  onDrop: (e: React.DragEvent, status: LeadStatus) => void;
  onDragEnd: () => void;
  onCardClick: (lead: Lead) => void;
  onAssignMe: (leadId: string) => void;
  onDelete: (lead: Lead) => void;
  currentUserId: string | null;
  statusLabel: (s: LeadStatus) => string;
}) {
  // Show pipeline_order + perdido at the end
  const columns = [...config.pipeline_order, "perdido"] as LeadStatus[];

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-3 min-w-max">
        {columns.map((s) => {
          const items = leadsByStatus[s] || [];
          const isOver = dragOverColumn === s;
          return (
            <div
              key={s}
              className={`w-72 shrink-0 rounded-sm border ${STATUS_BORDER[s]} ${STATUS_BG_LIGHT[s]} flex flex-col`}
              style={{ minHeight: 400 }}
              onDragOver={(e) => onDragOver(e, s)}
              onDrop={(e) => onDrop(e, s)}
            >
              <div className="px-3 py-2 border-b border-current/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${STATUS_COLORS[s]}`}
                  />
                  <span className="text-sm font-mono uppercase tracking-wider text-parchment-dim">
                    {statusLabel(s)}
                  </span>
                </div>
                <span className="text-xs text-parchment-dim bg-ink-2 border border-line rounded-full px-2 py-0.5">
                  {items.length}
                </span>
              </div>

              <div
                className={`flex-1 p-2 space-y-2 ${
                  isOver ? "bg-ink-3/60 ring-2 ring-carimbo ring-inset" : ""
                }`}
              >
                {items.length === 0 ? (
                  <p className="text-xs text-parchment-faint text-center py-4">
                    Arraste aqui
                  </p>
                ) : (
                  items.map((lead) => (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={(e) => onDragStart(e, lead)}
                      onDragEnd={onDragEnd}
                      onClick={() => onCardClick(lead)}
                      className={`bg-ink-2 border border-line rounded-sm p-2.5 text-sm cursor-pointer transition-all ${
                        draggingId === lead.id ? "opacity-50" : ""
                      } ${lead.is_overdue ? "border-carimbo/40" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-parchment truncate">
                            {lead.full_name || lead.phone}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] font-mono text-parchment-faint">
                              {lead.code}
                            </span>
                            <span className="text-[10px] text-parchment-faint">·</span>
                            <span className="text-xs text-parchment-dim truncate">
                              {lead.phone}
                            </span>
                          </div>
                        </div>
                        {lead.is_overdue && (
                          <span className="text-[10px] bg-carimbo/10 text-carimbo-bright px-1.5 py-0.5 rounded-full font-medium shrink-0">
                            VENCIDO
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-xs text-parchment-dim mt-1.5">
                        <span>{CHANNEL_LABELS[lead.channel] || lead.channel}</span>
                        {lead.ai_active === true && (
                          <span className="text-[10px] bg-jade/15 text-jade px-1.5 py-0.5 rounded-full font-medium">
                            🤖 IA
                          </span>
                        )}
                        {lead.ai_active === false && (
                          <span className="text-[10px] bg-info/15 text-info px-1.5 py-0.5 rounded-full font-medium">
                            👤 Humano
                          </span>
                        )}
                        {lead.proposal_value && (
                          <span className="font-medium text-selo font-mono">
                            {formatCurrency(lead.proposal_value)}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-line">
                        <span className="text-parchment-faint">
                          {relativeDate(lead.created_at)}
                        </span>
                        <div className="flex items-center gap-2">
                          {lead.assigned_user ? (
                            <span
                              className="text-parchment-dim truncate max-w-[100px]"
                              title={lead.assigned_user.full_name}
                            >
                              👤 {lead.assigned_user.full_name.split(" ")[0]}
                            </span>
                          ) : currentUserId ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onAssignMe(lead.id);
                              }}
                              className="text-carimbo hover:underline"
                            >
                              Pegar
                            </button>
                          ) : null}
                          <button
                            onClick={(e) => { e.stopPropagation(); onDelete(lead); }}
                            className="text-parchment-faint hover:text-carimbo-bright transition-colors ml-1"
                            title="Excluir lead"
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LeadsTable({
  leads,
  selected,
  onToggle,
  onSelectAll,
  statusLabel,
  onClick,
  onDelete,
}: {
  leads: Lead[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  statusLabel: (s: LeadStatus) => string;
  onClick: (lead: Lead) => void;
  onDelete: (lead: Lead) => void;
}) {
  if (leads.length === 0) {
    return <p className="text-parchment-faint">Nenhum lead encontrado.</p>;
  }
  return (
    <div className="bg-ink-2 border border-line rounded-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-ink border-b border-line">
          <tr>
            <th className="px-3 py-2 w-8">
              <input
                type="checkbox"
                checked={selected.size === leads.length && leads.length > 0}
                onChange={onSelectAll}
              />
            </th>
            <th className="text-left px-3 py-2 text-parchment-dim font-medium">Lead</th>
            <th className="text-left px-3 py-2 text-parchment-dim font-medium">Canal</th>
            <th className="text-left px-3 py-2 text-parchment-dim font-medium">Status</th>
            <th className="text-left px-3 py-2 text-parchment-dim font-medium">Atendimento</th>
            <th className="text-left px-3 py-2 text-parchment-dim font-medium">Resp.</th>
            <th className="text-right px-3 py-2 text-parchment-dim font-medium">Valor</th>
            <th className="text-left px-3 py-2 text-parchment-dim font-medium">SLA</th>
            <th className="text-left px-3 py-2 text-parchment-dim font-medium">Criado</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {leads.map((lead) => (
            <tr
              key={lead.id}
              className={`hover:bg-ink-3 cursor-pointer ${
                selected.has(lead.id) ? "bg-info/10" : ""
              }`}
            >
              <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selected.has(lead.id)}
                  onChange={() => onToggle(lead.id)}
                />
              </td>
              <td className="px-3 py-2" onClick={() => onClick(lead)}>
                <div className="font-medium text-parchment">
                  {lead.full_name || "—"}
                </div>
                <div className="text-xs text-parchment-faint">{lead.phone}</div>
              </td>
              <td className="px-3 py-2 text-parchment-dim" onClick={() => onClick(lead)}>
                {CHANNEL_LABELS[lead.channel] || lead.channel}
              </td>
              <td className="px-3 py-2" onClick={() => onClick(lead)}>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium text-parchment ${STATUS_COLORS[lead.status]}`}
                >
                  {statusLabel(lead.status)}
                </span>
              </td>
              <td className="px-3 py-2" onClick={() => onClick(lead)}>
                {lead.ai_active === true && (
                  <span className="text-xs bg-jade/15 text-jade px-2 py-0.5 rounded-full font-medium">
                    🤖 IA
                  </span>
                )}
                {lead.ai_active === false && (
                  <span className="text-xs bg-info/15 text-info px-2 py-0.5 rounded-full font-medium">
                    👤 Humano
                  </span>
                )}
                {lead.ai_active === null && (
                  <span className="text-xs text-parchment-faint">—</span>
                )}
              </td>
              <td className="px-3 py-2 text-parchment-dim" onClick={() => onClick(lead)}>
                {lead.assigned_user?.full_name || "—"}
              </td>
              <td
                className="px-3 py-2 text-right text-parchment-dim"
                onClick={() => onClick(lead)}
              >
                {formatCurrency(lead.proposal_value)}
              </td>
              <td className="px-3 py-2" onClick={() => onClick(lead)}>
                {lead.is_overdue ? (
                  <span className="text-xs text-carimbo-bright font-medium">VENCIDO</span>
                ) : lead.contacted_at ? (
                  <span className="text-xs text-jade">OK</span>
                ) : (
                  <span className="text-xs text-parchment-faint">Aguardando</span>
                )}
              </td>
              <td
                className="px-3 py-2 text-parchment-dim text-xs"
                onClick={() => onClick(lead)}
              >
                {relativeDate(lead.created_at)}
              </td>
              <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => onDelete(lead)}
                  className="text-parchment-faint hover:text-carimbo-bright transition-colors"
                  title="Excluir lead"
                >
                  🗑
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CreateLeadModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    channel: "whatsapp",
    description: "",
    proposal_value: "",
  });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/leads/", {
        full_name: form.full_name || null,
        phone: form.phone,
        email: form.email || null,
        channel: form.channel,
        description: form.description || null,
        proposal_value: form.proposal_value ? Number(form.proposal_value) : null,
      });
      onCreated();
    } catch {
      alert("Erro ao criar lead.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} title="Novo Lead">
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome">
            <input
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="w-full border border-line bg-ink/60 text-parchment rounded-sm px-3 py-2 text-sm focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
            />
          </Field>
          <Field label="Telefone *" required>
            <input
              value={form.phone}
              required
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full border border-line bg-ink/60 text-parchment rounded-sm px-3 py-2 text-sm focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
            />
          </Field>
          <Field label="E-mail">
            <input
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full border border-line bg-ink/60 text-parchment rounded-sm px-3 py-2 text-sm focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
            />
          </Field>
          <Field label="Canal">
            <select
              value={form.channel}
              onChange={(e) => setForm({ ...form, channel: e.target.value })}
              className="w-full border border-line bg-ink/60 text-parchment rounded-sm px-3 py-2 text-sm focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
            >
              {CHANNEL_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Valor estimado (R$)">
            <input
              type="number"
              step="0.01"
              value={form.proposal_value}
              onChange={(e) => setForm({ ...form, proposal_value: e.target.value })}
              className="w-full border border-line bg-ink/60 text-parchment rounded-sm px-3 py-2 text-sm focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
            />
          </Field>
        </div>
        <Field label="Descrição / Queixa">
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            className="w-full border border-line bg-ink/60 text-parchment rounded-sm px-3 py-2 text-sm focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2 border-t border-line">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-parchment-dim"
          >
            Cancelar
          </button>
          <button
            disabled={saving}
            className="bg-carimbo text-parchment px-4 py-2 rounded-sm text-sm font-semibold hover:bg-carimbo-bright disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Criar Lead"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function TransitionModal({
  lead,
  target,
  statusLabel,
  lostReasons,
  onClose,
  onConfirm,
}: {
  lead: Lead;
  target: LeadStatus;
  statusLabel: (s: LeadStatus) => string;
  lostReasons: { value: string; label: string }[];
  onClose: () => void;
  onConfirm: (note: string, lost_reason?: string) => void;
}) {
  const [note, setNote] = useState("");
  const [lostReason, setLostReason] = useState(lostReasons[0]?.value || "outro");

  const isLost = target === "perdido";

  return (
    <Modal
      onClose={onClose}
      title={`Mover para "${statusLabel(target)}"`}
    >
      <p className="text-sm text-parchment-dim mb-3">
        <strong>{lead.full_name || lead.phone}</strong> — atualmente em{" "}
        <em>{statusLabel(lead.status)}</em>.
      </p>

      {isLost && (
        <Field label="Motivo da perda *" required>
          <select
            value={lostReason}
            onChange={(e) => setLostReason(e.target.value)}
            className="w-full border border-line bg-ink/60 text-parchment rounded-sm px-3 py-2 text-sm focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
          >
            {lostReasons.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Observação (opcional)">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="w-full border border-line bg-ink/60 text-parchment rounded-sm px-3 py-2 text-sm focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
          placeholder={
            isLost
              ? "Detalhes do motivo, próximos passos..."
              : "Contexto da mudança..."
          }
        />
      </Field>

      <div className="flex justify-end gap-2 pt-2 border-t border-line">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm text-parchment-dim"
        >
          Cancelar
        </button>
        <button
          onClick={() => onConfirm(note, isLost ? lostReason : undefined)}
          className={`px-4 py-2 rounded-sm text-sm font-semibold text-parchment ${
            isLost ? "bg-carimbo-bright hover:bg-carimbo" : "bg-carimbo hover:bg-carimbo-bright"
          }`}
        >
          Confirmar
        </button>
      </div>
    </Modal>
  );
}

function ConvertLeadModal({
  lead,
  onClose,
  onConverted,
}: {
  lead: Lead;
  onClose: () => void;
  onConverted: () => void;
}) {
  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  const [createAppt, setCreateAppt] = useState(false);
  const [form, setForm] = useState({
    client_name: lead.full_name || "",
    consultation_notes: lead.description || "",
    lawyer_id: "",
    starts_at: "",
  });
  const [slots, setSlots] = useState<{ starts_at: string; ends_at: string }[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get("/scheduling/lawyers?active_only=true")
      .then(({ data }) => setLawyers(data))
      .catch(() => setLawyers([]));
  }, []);

  async function loadSlots() {
    if (!form.lawyer_id || !form.starts_at) return;
    setLoadingSlots(true);
    try {
      const day = form.starts_at.slice(0, 10);
      const dateFrom = `${day}T00:00:00Z`;
      const dateTo = `${day}T23:59:59Z`;
      const { data } = await api.get(
        `/scheduling/slots?lawyer_id=${form.lawyer_id}&date_from=${dateFrom}&date_to=${dateTo}`,
      );
      setSlots(data);
    } catch {
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }

  useEffect(() => {
    if (createAppt) loadSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.lawyer_id, form.starts_at, createAppt]);

  async function submit() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        client_name: form.client_name || null,
        consultation_notes: form.consultation_notes || null,
      };
      if (createAppt && form.lawyer_id && form.starts_at) {
        body.lawyer_id = form.lawyer_id;
        body.starts_at = form.starts_at;
      }
      await api.post(`/leads/${lead.id}/convert`, body);
      onConverted();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      alert(e.response?.data?.detail || "Erro ao converter lead.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} title="Converter Lead em Cliente">
      <p className="text-sm text-parchment-dim mb-3">
        <strong>{lead.full_name || lead.phone}</strong> — telefone {lead.phone}
      </p>

      <Field label="Nome do cliente">
        <input
          value={form.client_name}
          onChange={(e) => setForm({ ...form, client_name: e.target.value })}
          className="w-full border border-line bg-ink/60 text-parchment rounded-sm px-3 py-2 text-sm focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
        />
      </Field>

      <label className="flex items-center gap-2 my-3 text-sm cursor-pointer text-parchment-dim">
        <input
          type="checkbox"
          checked={createAppt}
          onChange={(e) => setCreateAppt(e.target.checked)}
        />
        <span>Criar consulta agora</span>
      </label>

      {createAppt && (
        <div className="space-y-3 border-l-2 border-selo/40 pl-3 ml-1">
          <Field label="Advogado *">
            <select
              value={form.lawyer_id}
              onChange={(e) => setForm({ ...form, lawyer_id: e.target.value })}
              className="w-full border border-line bg-ink/60 text-parchment rounded-sm px-3 py-2 text-sm focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
            >
              <option value="">Selecione...</option>
              {lawyers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Data *">
            <input
              type="date"
              value={form.starts_at.slice(0, 10)}
              onChange={(e) =>
                setForm({ ...form, starts_at: `${e.target.value}T00:00:00` })
              }
              className="w-full border border-line bg-ink/60 text-parchment rounded-sm px-3 py-2 text-sm focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
            />
          </Field>

          {form.lawyer_id && form.starts_at.slice(0, 10) && (
            <Field label="Horário disponível *">
              {loadingSlots ? (
                <p className="text-sm text-parchment-faint">Buscando horários...</p>
              ) : slots.length === 0 ? (
                <p className="text-sm text-parchment-faint">
                  Sem horários disponíveis nesta data.
                </p>
              ) : (
                <div className="grid grid-cols-4 gap-1.5 max-h-40 overflow-y-auto">
                  {slots.map((slot) => {
                    const isSelected = form.starts_at === slot.starts_at;
                    return (
                      <button
                        type="button"
                        key={slot.starts_at}
                        onClick={() => setForm({ ...form, starts_at: slot.starts_at })}
                        className={`text-xs border border-line rounded-sm px-2 py-1.5 ${
                          isSelected
                            ? "bg-carimbo text-parchment border-carimbo"
                            : "bg-ink-2 text-parchment-dim hover:bg-ink-3"
                        }`}
                      >
                        {new Date(slot.starts_at).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </button>
                    );
                  })}
                </div>
              )}
            </Field>
          )}

          <Field label="Observações">
            <textarea
              value={form.consultation_notes}
              onChange={(e) =>
                setForm({ ...form, consultation_notes: e.target.value })
              }
              rows={2}
              className="w-full border border-line bg-ink/60 text-parchment rounded-sm px-3 py-2 text-sm focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
            />
          </Field>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-3 border-t border-line mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm text-parchment-dim">
          Cancelar
        </button>
        <button
          disabled={saving || (createAppt && (!form.lawyer_id || !form.starts_at.includes("T") || form.starts_at.endsWith("T00:00:00")))}
          onClick={submit}
          className="bg-jade text-parchment px-4 py-2 rounded-sm text-sm font-semibold hover:bg-jade/80 disabled:opacity-50"
        >
          {saving ? "Convertendo..." : "Converter"}
        </button>
      </div>
    </Modal>
  );
}

function BulkAssignModal({
  users,
  selectedCount,
  onClose,
  onConfirm,
}: {
  users: User[];
  selectedCount: number;
  onClose: () => void;
  onConfirm: (assigned_to: string | null) => void;
}) {
  const [val, setVal] = useState<string>("");
  return (
    <Modal onClose={onClose} title={`Atribuir ${selectedCount} lead(s)`}>
      <Field label="Responsável">
        <select
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className="w-full border border-line bg-ink/60 text-parchment rounded-sm px-3 py-2 text-sm focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
        >
          <option value="">— Sem responsável —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex justify-end gap-2 pt-3 border-t border-line mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm text-parchment-dim">
          Cancelar
        </button>
        <button
          onClick={() => onConfirm(val || null)}
          className="bg-carimbo text-parchment px-4 py-2 rounded-sm text-sm font-semibold hover:bg-carimbo-bright"
        >
          Atribuir
        </button>
      </div>
    </Modal>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-ink-2 border border-line rounded-sm p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-display font-semibold text-parchment mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div className="mb-2">
      <label className="block font-mono text-[10px] tracking-[0.2em] uppercase text-parchment-dim mb-1">
        {label}
        {required && <span className="text-carimbo-bright ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
