"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type {
  Doctor,
  Lead,
  LeadStatus,
  PipelineConfig,
  PipelineStageMetric,
  User,
} from "@/types";

type ViewMode = "kanban" | "list";

const STATUS_COLORS: Record<string, string> = {
  novo: "bg-blue-500",
  em_contato: "bg-yellow-500",
  qualificado: "bg-cyan-500",
  orcamento_enviado: "bg-purple-500",
  negociando: "bg-orange-500",
  convertido: "bg-green-500",
  perdido: "bg-gray-400",
};

const STATUS_BORDER: Record<string, string> = {
  novo: "border-blue-200",
  em_contato: "border-yellow-200",
  qualificado: "border-cyan-200",
  orcamento_enviado: "border-purple-200",
  negociando: "border-orange-200",
  convertido: "border-green-200",
  perdido: "border-gray-200",
};

const STATUS_BG_LIGHT: Record<string, string> = {
  novo: "bg-blue-50",
  em_contato: "bg-yellow-50",
  qualificado: "bg-cyan-50",
  orcamento_enviado: "bg-purple-50",
  negociando: "bg-orange-50",
  convertido: "bg-green-50",
  perdido: "bg-gray-50",
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
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    fetchLeads();
    fetchMetrics();
  }, [filterAssigned, filterChannel, filterStatus, filterOverdue, debouncedSearch, period, user?.id]);

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
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-gray-900">Pipeline de Leads</h1>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={exportCsv}
            className="border px-3 py-2 rounded-lg text-sm hover:bg-gray-50"
            title="Exportar CSV com os filtros atuais"
          >
            Exportar CSV
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            Novo Lead
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Metric label="Total no período" value={totalPipeline} />
        <Metric label="Novos (não tratados)" value={newLeads} accent="text-blue-600" />
        <Metric
          label="SLA vencido"
          value={overdueCount}
          accent={overdueCount > 0 ? "text-red-600" : "text-gray-900"}
        />
        <Metric label="Conversão" value={`${conversionRate}%`} accent="text-green-600" />
      </div>

      {/* Filters */}
      <div className="bg-white border rounded-lg p-3 mb-4 flex flex-wrap items-center gap-2 text-sm">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar nome, telefone ou e-mail..."
          className="border rounded-lg px-3 py-1.5 flex-1 min-w-[200px]"
        />
        <select
          value={filterAssigned}
          onChange={(e) => setFilterAssigned(e.target.value)}
          className="border rounded-lg px-3 py-1.5"
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
          className="border rounded-lg px-3 py-1.5"
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
          className="border rounded-lg px-3 py-1.5"
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
          className="border rounded-lg px-3 py-1.5"
          title="Período usado nos KPIs"
        >
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-gray-600 select-none cursor-pointer">
          <input
            type="checkbox"
            checked={filterOverdue}
            onChange={(e) => setFilterOverdue(e.target.checked)}
          />
          SLA vencido
        </label>
        <div className="ml-auto flex border rounded-lg overflow-hidden">
          <button
            onClick={() => setView("kanban")}
            className={`px-3 py-1.5 text-sm ${view === "kanban" ? "bg-blue-600 text-white" : "bg-white text-gray-600"}`}
          >
            Kanban
          </button>
          <button
            onClick={() => setView("list")}
            className={`px-3 py-1.5 text-sm ${view === "list" ? "bg-blue-600 text-white" : "bg-white text-gray-600"}`}
          >
            Lista
          </button>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex items-center gap-3">
          <span className="text-sm text-blue-900 font-medium">
            {selected.size} selecionado(s)
          </span>
          <button
            onClick={() => setBulkAssignModal(true)}
            className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg"
          >
            Atribuir...
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs text-gray-600 ml-auto"
          >
            Limpar
          </button>
        </div>
      )}

      {/* Body */}
      {loading ? (
        <p className="text-gray-400">Carregando...</p>
      ) : !config ? (
        <p className="text-gray-400">Aguardando configuração do pipeline...</p>
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
    <div className="bg-white border rounded-lg p-3">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${accent || "text-gray-900"}`}>{value}</div>
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
              className={`w-72 shrink-0 rounded-lg border ${STATUS_BORDER[s]} ${STATUS_BG_LIGHT[s]} flex flex-col`}
              style={{ minHeight: 400 }}
              onDragOver={(e) => onDragOver(e, s)}
              onDrop={(e) => onDrop(e, s)}
            >
              <div className="px-3 py-2 border-b border-current/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${STATUS_COLORS[s]}`}
                  />
                  <span className="text-sm font-semibold text-gray-700">
                    {statusLabel(s)}
                  </span>
                </div>
                <span className="text-xs text-gray-500 bg-white border rounded-full px-2 py-0.5">
                  {items.length}
                </span>
              </div>

              <div
                className={`flex-1 p-2 space-y-2 ${
                  isOver ? "bg-white/60 ring-2 ring-blue-400 ring-inset" : ""
                }`}
              >
                {items.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">
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
                      className={`bg-white border rounded-lg p-2.5 text-sm cursor-pointer hover:shadow transition-all ${
                        draggingId === lead.id ? "opacity-50" : ""
                      } ${lead.is_overdue ? "border-red-300" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900 truncate">
                            {lead.full_name || lead.phone}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] font-mono text-gray-400">
                              {lead.code}
                            </span>
                            <span className="text-[10px] text-gray-400">·</span>
                            <span className="text-xs text-gray-500 truncate">
                              {lead.phone}
                            </span>
                          </div>
                        </div>
                        {lead.is_overdue && (
                          <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium shrink-0">
                            VENCIDO
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-xs text-gray-500 mt-1.5">
                        <span>{CHANNEL_LABELS[lead.channel] || lead.channel}</span>
                        {lead.ai_active === true && (
                          <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">
                            🤖 IA
                          </span>
                        )}
                        {lead.ai_active === false && (
                          <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">
                            👤 Humano
                          </span>
                        )}
                        {lead.quote_value && (
                          <span className="font-medium text-gray-700">
                            {formatCurrency(lead.quote_value)}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t">
                        <span className="text-gray-400">
                          {relativeDate(lead.created_at)}
                        </span>
                        {lead.assigned_user ? (
                          <span
                            className="text-gray-700 truncate max-w-[100px]"
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
                            className="text-blue-600 hover:underline"
                          >
                            Pegar
                          </button>
                        ) : null}
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
}: {
  leads: Lead[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  statusLabel: (s: LeadStatus) => string;
  onClick: (lead: Lead) => void;
}) {
  if (leads.length === 0) {
    return <p className="text-gray-400">Nenhum lead encontrado.</p>;
  }
  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="px-3 py-2 w-8">
              <input
                type="checkbox"
                checked={selected.size === leads.length && leads.length > 0}
                onChange={onSelectAll}
              />
            </th>
            <th className="text-left px-3 py-2 text-gray-500 font-medium">Lead</th>
            <th className="text-left px-3 py-2 text-gray-500 font-medium">Canal</th>
            <th className="text-left px-3 py-2 text-gray-500 font-medium">Status</th>
            <th className="text-left px-3 py-2 text-gray-500 font-medium">Atendimento</th>
            <th className="text-left px-3 py-2 text-gray-500 font-medium">Resp.</th>
            <th className="text-right px-3 py-2 text-gray-500 font-medium">Valor</th>
            <th className="text-left px-3 py-2 text-gray-500 font-medium">SLA</th>
            <th className="text-left px-3 py-2 text-gray-500 font-medium">Criado</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {leads.map((lead) => (
            <tr
              key={lead.id}
              className={`hover:bg-gray-50 cursor-pointer ${
                selected.has(lead.id) ? "bg-blue-50" : ""
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
                <div className="font-medium text-gray-900">
                  {lead.full_name || "—"}
                </div>
                <div className="text-xs text-gray-400">{lead.phone}</div>
              </td>
              <td className="px-3 py-2 text-gray-600" onClick={() => onClick(lead)}>
                {CHANNEL_LABELS[lead.channel] || lead.channel}
              </td>
              <td className="px-3 py-2" onClick={() => onClick(lead)}>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium text-white ${STATUS_COLORS[lead.status]}`}
                >
                  {statusLabel(lead.status)}
                </span>
              </td>
              <td className="px-3 py-2" onClick={() => onClick(lead)}>
                {lead.ai_active === true && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                    🤖 IA
                  </span>
                )}
                {lead.ai_active === false && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                    👤 Humano
                  </span>
                )}
                {lead.ai_active === null && (
                  <span className="text-xs text-gray-400">—</span>
                )}
              </td>
              <td className="px-3 py-2 text-gray-600" onClick={() => onClick(lead)}>
                {lead.assigned_user?.full_name || "—"}
              </td>
              <td
                className="px-3 py-2 text-right text-gray-700"
                onClick={() => onClick(lead)}
              >
                {formatCurrency(lead.quote_value)}
              </td>
              <td className="px-3 py-2" onClick={() => onClick(lead)}>
                {lead.is_overdue ? (
                  <span className="text-xs text-red-600 font-medium">VENCIDO</span>
                ) : lead.contacted_at ? (
                  <span className="text-xs text-green-600">OK</span>
                ) : (
                  <span className="text-xs text-gray-400">Aguardando</span>
                )}
              </td>
              <td
                className="px-3 py-2 text-gray-500 text-xs"
                onClick={() => onClick(lead)}
              >
                {relativeDate(lead.created_at)}
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
    quote_value: "",
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
        quote_value: form.quote_value ? Number(form.quote_value) : null,
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
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Telefone *" required>
            <input
              value={form.phone}
              required
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </Field>
          <Field label="E-mail">
            <input
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Canal">
            <select
              value={form.channel}
              onChange={(e) => setForm({ ...form, channel: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
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
              value={form.quote_value}
              onChange={(e) => setForm({ ...form, quote_value: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </Field>
        </div>
        <Field label="Descrição / Queixa">
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2 border-t">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600"
          >
            Cancelar
          </button>
          <button
            disabled={saving}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
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
      <p className="text-sm text-gray-600 mb-3">
        <strong>{lead.full_name || lead.phone}</strong> — atualmente em{" "}
        <em>{statusLabel(lead.status)}</em>.
      </p>

      {isLost && (
        <Field label="Motivo da perda *" required>
          <select
            value={lostReason}
            onChange={(e) => setLostReason(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
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
          className="w-full border rounded-lg px-3 py-2 text-sm"
          placeholder={
            isLost
              ? "Detalhes do motivo, próximos passos..."
              : "Contexto da mudança..."
          }
        />
      </Field>

      <div className="flex justify-end gap-2 pt-2 border-t">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm text-gray-600"
        >
          Cancelar
        </button>
        <button
          onClick={() => onConfirm(note, isLost ? lostReason : undefined)}
          className={`px-4 py-2 rounded-lg text-sm font-medium text-white ${
            isLost ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
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
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [createAppt, setCreateAppt] = useState(false);
  const [form, setForm] = useState({
    patient_name: lead.full_name || "",
    appointment_notes: lead.description || "",
    doctor_id: "",
    starts_at: "",
  });
  const [slots, setSlots] = useState<{ starts_at: string; ends_at: string }[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get("/scheduling/doctors?active_only=true")
      .then(({ data }) => setDoctors(data))
      .catch(() => setDoctors([]));
  }, []);

  async function loadSlots() {
    if (!form.doctor_id || !form.starts_at) return;
    setLoadingSlots(true);
    try {
      const day = form.starts_at.slice(0, 10);
      const dateFrom = `${day}T00:00:00Z`;
      const dateTo = `${day}T23:59:59Z`;
      const { data } = await api.get(
        `/scheduling/slots?doctor_id=${form.doctor_id}&date_from=${dateFrom}&date_to=${dateTo}`,
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
  }, [form.doctor_id, form.starts_at, createAppt]);

  async function submit() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        patient_name: form.patient_name || null,
        appointment_notes: form.appointment_notes || null,
      };
      if (createAppt && form.doctor_id && form.starts_at) {
        body.doctor_id = form.doctor_id;
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
    <Modal onClose={onClose} title="Converter Lead em Paciente">
      <p className="text-sm text-gray-600 mb-3">
        <strong>{lead.full_name || lead.phone}</strong> — telefone {lead.phone}
      </p>

      <Field label="Nome do paciente">
        <input
          value={form.patient_name}
          onChange={(e) => setForm({ ...form, patient_name: e.target.value })}
          className="w-full border rounded-lg px-3 py-2 text-sm"
        />
      </Field>

      <label className="flex items-center gap-2 my-3 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={createAppt}
          onChange={(e) => setCreateAppt(e.target.checked)}
        />
        <span>Criar agendamento agora</span>
      </label>

      {createAppt && (
        <div className="space-y-3 border-l-2 border-blue-200 pl-3 ml-1">
          <Field label="Médico *">
            <select
              value={form.doctor_id}
              onChange={(e) => setForm({ ...form, doctor_id: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Selecione...</option>
              {doctors.map((d) => (
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
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </Field>

          {form.doctor_id && form.starts_at.slice(0, 10) && (
            <Field label="Horário disponível *">
              {loadingSlots ? (
                <p className="text-sm text-gray-400">Buscando horários...</p>
              ) : slots.length === 0 ? (
                <p className="text-sm text-gray-400">
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
                        className={`text-xs border rounded px-2 py-1.5 ${
                          isSelected
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white hover:bg-gray-50"
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
              value={form.appointment_notes}
              onChange={(e) =>
                setForm({ ...form, appointment_notes: e.target.value })
              }
              rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </Field>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-3 border-t mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600">
          Cancelar
        </button>
        <button
          disabled={saving || (createAppt && (!form.doctor_id || !form.starts_at.includes("T") || form.starts_at.endsWith("T00:00:00")))}
          onClick={submit}
          className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
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
          className="w-full border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">— Sem responsável —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex justify-end gap-2 pt-3 border-t mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600">
          Cancelar
        </button>
        <button
          onClick={() => onConfirm(val || null)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
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
        className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-gray-900 mb-4">{title}</h2>
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
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
