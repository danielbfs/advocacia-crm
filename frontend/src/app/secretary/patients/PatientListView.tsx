"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────
interface PatientContact {
  id: string;
  channel: string;
  value: string;
  is_primary: boolean;
}

interface LeadSummary {
  id: string;
  code: string;
  full_name: string | null;
  channel: string;
  status: string;
  created_at: string;
}

interface Patient {
  id: string;
  full_name: string | null;
  phone: string;
  email: string | null;
  channel: string;
  crm_status: string;
  notes: string | null;
  created_at: string;
  contacts: PatientContact[];
  leads: LeadSummary[];
}

interface UnmatchedLead {
  lead_id: string;
  code: string;
  full_name: string | null;
  phone: string;
  email: string | null;
  channel: string;
  status: string;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  new: "Novo",
  qualified: "Qualificado",
  scheduled: "Agendado",
  completed: "Atendido",
  no_show: "Não compareceu",
};

const LEAD_STATUS_LABELS: Record<string, string> = {
  novo: "Novo",
  em_contato: "Em Contato",
  qualificado: "Qualificado",
  orcamento_enviado: "Proposta Enviada",
  negociando: "Negociando",
  convertido: "Cliente Fechado",
  perdido: "Perdido",
};

const CHANNEL_ICONS: Record<string, string> = {
  whatsapp: "💬",
  telegram: "✈️",
  email: "✉️",
  outro: "🔗",
};

const LEAD_STATUS_COLORS: Record<string, string> = {
  novo: "bg-info/15 text-info",
  em_contato: "bg-selo/15 text-selo",
  qualificado: "bg-ink-3 text-parchment-dim",
  orcamento_enviado: "bg-selo/15 text-selo",
  negociando: "bg-carimbo/10 text-carimbo",
  convertido: "bg-jade/15 text-jade",
  perdido: "bg-ink-3 text-parchment-faint",
};

// ─────────────────────────────────────────────────────────────────
// Unify Modal
// ─────────────────────────────────────────────────────────────────
function UnifyModal({
  lead,
  patients,
  onClose,
  onDone,
}: {
  lead: UnmatchedLead;
  patients: Patient[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Patient | null>(null);
  const [saving, setSaving] = useState(false);
  const [createNew, setCreateNew] = useState(false);

  const filtered = patients.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.full_name?.toLowerCase().includes(q) ||
      p.phone.includes(q) ||
      p.email?.toLowerCase().includes(q)
    );
  });

  async function handleLink() {
    if (!selected) return;
    setSaving(true);
    try {
      await api.post(`/patients/${selected.id}/link-lead`, { lead_id: lead.lead_id });
      onDone();
    } catch {
      alert("Erro ao vincular. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateNew() {
    setSaving(true);
    try {
      const clean = lead.phone.replace(/^(whatsapp:|telegram:)/, "");
      const { data: newPatient } = await api.post("/patients/", {
        full_name: lead.full_name,
        phone: clean,
        email: lead.email,
        channel: lead.channel,
      });
      await api.post(`/patients/${newPatient.id}/link-lead`, { lead_id: lead.lead_id });
      onDone();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      alert(msg || "Erro ao criar cliente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-ink-2 border border-line rounded-sm w-full max-w-lg">
        {/* Header */}
        <div className="px-6 py-4 border-b border-line flex items-center justify-between">
          <div>
            <h2 className="font-display font-semibold text-parchment text-lg">Vincular Contato a Cliente</h2>
            <p className="text-sm text-parchment-dim mt-0.5">
              {CHANNEL_ICONS[lead.channel]} {lead.full_name || lead.phone} · {lead.phone}
            </p>
          </div>
          <button onClick={onClose} className="text-parchment-faint hover:text-parchment text-2xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {!createNew ? (
            <>
              <p className="text-sm text-parchment-dim">
                Selecione um cliente existente para vincular este contato:
              </p>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, telefone ou e-mail..."
                className="w-full border border-line bg-ink/60 text-parchment placeholder:text-parchment-faint rounded-sm px-3 py-2 text-sm focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
                autoFocus
              />
              <div className="space-y-1 max-h-52 overflow-y-auto">
                {filtered.slice(0, 20).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelected(p)}
                    className={`w-full text-left px-3 py-2.5 rounded-sm text-sm transition-colors ${
                      selected?.id === p.id
                        ? "bg-info/10 border border-info/40"
                        : "hover:bg-ink-3 border border-transparent"
                    }`}
                  >
                    <div className="font-medium text-parchment">{p.full_name || "—"}</div>
                    <div className="text-xs text-parchment-faint">{p.phone} · {p.email || "sem e-mail"}</div>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="text-sm text-parchment-faint text-center py-4">Nenhum cliente encontrado.</p>
                )}
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  onClick={handleLink}
                  disabled={!selected || saving}
                  className="flex-1 bg-carimbo text-parchment py-2 rounded-sm text-sm font-semibold hover:bg-carimbo-bright disabled:opacity-40"
                >
                  {saving ? "Vinculando..." : "Vincular ao Selecionado"}
                </button>
                <button
                  onClick={() => setCreateNew(true)}
                  className="px-4 py-2 border border-line rounded-sm text-sm text-parchment-dim hover:bg-ink-3"
                >
                  Criar Novo
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-parchment-dim">
                Criar um novo perfil de cliente a partir deste contato:
              </p>
              <div className="bg-ink rounded-sm p-3 text-sm space-y-1">
                <div><span className="text-parchment-dim">Nome:</span> {lead.full_name || "—"}</div>
                <div><span className="text-parchment-dim">Telefone:</span> {lead.phone}</div>
                <div><span className="text-parchment-dim">Canal:</span> {lead.channel}</div>
                {lead.email && <div><span className="text-parchment-dim">E-mail:</span> {lead.email}</div>}
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleCreateNew}
                  disabled={saving}
                  className="flex-1 bg-jade text-parchment py-2 rounded-sm text-sm font-semibold hover:bg-jade/80 disabled:opacity-40"
                >
                  {saving ? "Criando..." : "Confirmar e Criar Cliente"}
                </button>
                <button
                  onClick={() => setCreateNew(false)}
                  className="px-4 py-2 border border-line rounded-sm text-sm text-parchment-dim hover:bg-ink-3"
                >
                  Voltar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Main View
// ─────────────────────────────────────────────────────────────────
export function PatientListView({ basePath = "/secretary/patients" }: { basePath?: string }) {
  const router = useRouter();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [unmatched, setUnmatched] = useState<UnmatchedLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [unifyTarget, setUnifyTarget] = useState<UnmatchedLead | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : "";
      const [pRes, uRes] = await Promise.all([
        api.get(`/patients/${params}`),
        api.get("/patients/unmatched"),
      ]);
      setPatients(pRes.data);
      setUnmatched(uRes.data);
    } catch {
      setPatients([]);
      setUnmatched([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { fetchAll(); }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    fetchAll();
  }

  return (
    <main className="p-6 max-w-7xl mx-auto space-y-10">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-semibold text-parchment">Clientes</h1>
          <p className="text-sm text-parchment-dim mt-0.5">Cadastros unificados de clientes</p>
        </div>
        <button
          onClick={() => router.push(`${basePath}/new`)}
          className="bg-carimbo text-parchment px-4 py-2 rounded-sm text-sm font-semibold hover:bg-carimbo-bright"
        >
          + Novo Cliente
        </button>
      </div>

      {/* ── Search ── */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, telefone ou e-mail..."
          className="flex-1 border border-line bg-ink/60 text-parchment placeholder:text-parchment-faint rounded-sm px-3 py-2 text-sm focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
        />
        <button type="submit" className="bg-carimbo text-parchment px-4 py-2 rounded-sm text-sm font-semibold hover:bg-carimbo-bright">
          Buscar
        </button>
        {search && (
          <button type="button" onClick={() => { setSearch(""); setTimeout(fetchAll, 0); }} className="text-sm text-parchment-dim px-3">
            Limpar
          </button>
        )}
      </form>

      {/* ═══════════════════════════════════════
          SECTION 1 — Pacientes cadastrados
      ═══════════════════════════════════════ */}
      <section>
        <h2 className="text-base font-semibold text-parchment mb-3">
          Clientes Cadastrados
          <span className="ml-2 text-sm font-normal text-parchment-faint">({patients.length})</span>
        </h2>

        {loading ? (
          <p className="text-parchment-faint text-sm">Carregando...</p>
        ) : patients.length === 0 ? (
          <p className="text-parchment-faint text-sm">Nenhum cliente encontrado.</p>
        ) : (
          <div className="bg-ink-2 border border-line rounded-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-ink border-b border-line">
                <tr>
                  <th className="text-left px-4 py-3 text-parchment-dim font-medium">Nome</th>
                  <th className="text-left px-4 py-3 text-parchment-dim font-medium">Contatos</th>
                  <th className="text-left px-4 py-3 text-parchment-dim font-medium">Atendimentos</th>
                  <th className="text-left px-4 py-3 text-parchment-dim font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-parchment-dim font-medium">Cadastro</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {patients.map((p) => (
                  <tr
                    key={p.id}
                    className="hover:bg-ink-3 cursor-pointer"
                    onClick={() => router.push(`${basePath}/${p.id}`)}
                  >
                    <td className="px-4 py-3 font-medium text-parchment">
                      {p.full_name || <span className="text-parchment-faint">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {p.contacts.length > 0 ? p.contacts.map((c) => (
                          <span
                            key={c.id}
                            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                              c.is_primary
                                ? "bg-info/15 text-info font-medium"
                                : "bg-ink-3 text-parchment-faint"
                            }`}
                          >
                            {CHANNEL_ICONS[c.channel] || "🔗"} {c.value}
                          </span>
                        )) : (
                          <span className="text-xs text-parchment-faint">{CHANNEL_ICONS[p.channel]} {p.phone}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {p.leads.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {p.leads.slice(0, 3).map((l) => (
                            <span
                              key={l.id}
                              className={`text-xs px-2 py-0.5 rounded-full font-medium ${LEAD_STATUS_COLORS[l.status] || "bg-ink-3 text-parchment-dim"}`}
                            >
                              {LEAD_STATUS_LABELS[l.status] || l.status}
                            </span>
                          ))}
                          {p.leads.length > 3 && (
                            <span className="text-xs text-parchment-faint">+{p.leads.length - 3}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-parchment-faint">Nenhum</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-ink-3 text-parchment-dim">
                        {STATUS_LABELS[p.crm_status] || p.crm_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-parchment-dim text-xs">
                      {new Date(p.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); router.push(`${basePath}/${p.id}`); }}
                        className="text-xs text-carimbo hover:underline"
                      >
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ═══════════════════════════════════════
          SECTION 2 — Contatos sem unificação
      ═══════════════════════════════════════ */}
      <section>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-base font-semibold text-parchment">
            Contatos Pendentes de Unificação
          </h2>
          {unmatched.length > 0 && (
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-selo text-parchment text-xs font-bold">
              {unmatched.length}
            </span>
          )}
        </div>
        <p className="text-sm text-parchment-dim mb-4">
          Leads que entraram em contato recentemente e ainda não foram vinculados a um cadastro de cliente.
        </p>

        {unmatched.length === 0 ? (
          <div className="bg-jade/10 border border-jade/40 rounded-sm p-6 text-center">
            <div className="text-2xl mb-2">✅</div>
            <p className="text-sm text-jade font-medium">Todos os contatos estão unificados!</p>
          </div>
        ) : (
          <div className="bg-ink-2 border border-line rounded-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-selo/10 border-b border-selo/30">
                <tr>
                  <th className="text-left px-4 py-3 text-selo font-medium">Contato</th>
                  <th className="text-left px-4 py-3 text-selo font-medium">Telefone</th>
                  <th className="text-left px-4 py-3 text-selo font-medium">Canal</th>
                  <th className="text-left px-4 py-3 text-selo font-medium">Status Lead</th>
                  <th className="text-left px-4 py-3 text-selo font-medium">Contato em</th>
                  <th className="text-left px-4 py-3 text-selo font-medium">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {unmatched.map((u) => (
                  <tr key={u.lead_id} className="hover:bg-selo/10">
                    <td className="px-4 py-3 font-medium text-parchment">
                      {u.full_name || <span className="text-parchment-faint">Sem nome</span>}
                      <div className="text-xs text-parchment-faint font-normal">{u.code}</div>
                    </td>
                    <td className="px-4 py-3 text-parchment-dim">{u.phone}</td>
                    <td className="px-4 py-3">
                      <span className="text-base">{CHANNEL_ICONS[u.channel] || "🔗"}</span>
                      <span className="ml-1 text-xs text-parchment-dim">{u.channel}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${LEAD_STATUS_COLORS[u.status] || "bg-ink-3 text-parchment-dim"}`}>
                        {LEAD_STATUS_LABELS[u.status] || u.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-parchment-dim text-xs">
                      {new Date(u.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setUnifyTarget(u)}
                        className="inline-flex items-center gap-1.5 text-xs bg-selo text-parchment px-3 py-1.5 rounded-sm font-medium hover:bg-selo/80 transition-colors"
                      >
                        🔗 Unificar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Unify Modal */}
      {unifyTarget && (
        <UnifyModal
          lead={unifyTarget}
          patients={patients}
          onClose={() => setUnifyTarget(null)}
          onDone={() => {
            setUnifyTarget(null);
            fetchAll();
          }}
        />
      )}
    </main>
  );
}
