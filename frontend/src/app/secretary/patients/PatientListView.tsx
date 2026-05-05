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
  orcamento_enviado: "Orçamento Enviado",
  negociando: "Negociando",
  convertido: "Convertido",
  perdido: "Perdido",
};

const CHANNEL_ICONS: Record<string, string> = {
  whatsapp: "💬",
  telegram: "✈️",
  email: "✉️",
  outro: "🔗",
};

const LEAD_STATUS_COLORS: Record<string, string> = {
  novo: "bg-blue-100 text-blue-700",
  em_contato: "bg-yellow-100 text-yellow-700",
  qualificado: "bg-purple-100 text-purple-700",
  orcamento_enviado: "bg-orange-100 text-orange-700",
  negociando: "bg-indigo-100 text-indigo-700",
  convertido: "bg-green-100 text-green-700",
  perdido: "bg-red-100 text-red-700",
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
      alert(msg || "Erro ao criar paciente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-900 text-lg">Vincular Contato a Paciente</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {CHANNEL_ICONS[lead.channel]} {lead.full_name || lead.phone} · {lead.phone}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {!createNew ? (
            <>
              <p className="text-sm text-gray-600">
                Selecione um paciente existente para vincular este contato:
              </p>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, telefone ou e-mail..."
                className="w-full border rounded-lg px-3 py-2 text-sm"
                autoFocus
              />
              <div className="space-y-1 max-h-52 overflow-y-auto">
                {filtered.slice(0, 20).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelected(p)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      selected?.id === p.id
                        ? "bg-blue-50 border border-blue-300"
                        : "hover:bg-gray-50 border border-transparent"
                    }`}
                  >
                    <div className="font-medium text-gray-900">{p.full_name || "—"}</div>
                    <div className="text-xs text-gray-400">{p.phone} · {p.email || "sem e-mail"}</div>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">Nenhum paciente encontrado.</p>
                )}
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  onClick={handleLink}
                  disabled={!selected || saving}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
                >
                  {saving ? "Vinculando..." : "Vincular ao Selecionado"}
                </button>
                <button
                  onClick={() => setCreateNew(true)}
                  className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                >
                  Criar Novo
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                Criar um novo perfil de paciente a partir deste contato:
              </p>
              <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                <div><span className="text-gray-500">Nome:</span> {lead.full_name || "—"}</div>
                <div><span className="text-gray-500">Telefone:</span> {lead.phone}</div>
                <div><span className="text-gray-500">Canal:</span> {lead.channel}</div>
                {lead.email && <div><span className="text-gray-500">E-mail:</span> {lead.email}</div>}
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleCreateNew}
                  disabled={saving}
                  className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-40"
                >
                  {saving ? "Criando..." : "Confirmar e Criar Paciente"}
                </button>
                <button
                  onClick={() => setCreateNew(false)}
                  className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
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
          <h1 className="text-2xl font-bold text-gray-900">Pacientes</h1>
          <p className="text-sm text-gray-500 mt-0.5">Cadastros unificados de clientes</p>
        </div>
        <button
          onClick={() => router.push(`${basePath}/new`)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          + Novo Paciente
        </button>
      </div>

      {/* ── Search ── */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, telefone ou e-mail..."
          className="flex-1 border rounded-lg px-3 py-2 text-sm"
        />
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
          Buscar
        </button>
        {search && (
          <button type="button" onClick={() => { setSearch(""); setTimeout(fetchAll, 0); }} className="text-sm text-gray-500 px-3">
            Limpar
          </button>
        )}
      </form>

      {/* ═══════════════════════════════════════
          SECTION 1 — Pacientes cadastrados
      ═══════════════════════════════════════ */}
      <section>
        <h2 className="text-base font-semibold text-gray-800 mb-3">
          Pacientes Cadastrados
          <span className="ml-2 text-sm font-normal text-gray-400">({patients.length})</span>
        </h2>

        {loading ? (
          <p className="text-gray-400 text-sm">Carregando...</p>
        ) : patients.length === 0 ? (
          <p className="text-gray-400 text-sm">Nenhum paciente encontrado.</p>
        ) : (
          <div className="bg-white border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Nome</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Contatos</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Atendimentos</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Cadastro</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y">
                {patients.map((p) => (
                  <tr
                    key={p.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => router.push(`${basePath}/${p.id}`)}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {p.full_name || <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {p.contacts.length > 0 ? p.contacts.map((c) => (
                          <span
                            key={c.id}
                            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                              c.is_primary
                                ? "bg-blue-100 text-blue-700 font-medium"
                                : "bg-gray-100 text-gray-500"
                            }`}
                          >
                            {CHANNEL_ICONS[c.channel] || "🔗"} {c.value}
                          </span>
                        )) : (
                          <span className="text-xs text-gray-400">{CHANNEL_ICONS[p.channel]} {p.phone}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {p.leads.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {p.leads.slice(0, 3).map((l) => (
                            <span
                              key={l.id}
                              className={`text-xs px-2 py-0.5 rounded-full font-medium ${LEAD_STATUS_COLORS[l.status] || "bg-gray-100 text-gray-600"}`}
                            >
                              {LEAD_STATUS_LABELS[l.status] || l.status}
                            </span>
                          ))}
                          {p.leads.length > 3 && (
                            <span className="text-xs text-gray-400">+{p.leads.length - 3}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">Nenhum</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-700">
                        {STATUS_LABELS[p.crm_status] || p.crm_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(p.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); router.push(`${basePath}/${p.id}`); }}
                        className="text-xs text-blue-600 hover:underline"
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
          <h2 className="text-base font-semibold text-gray-800">
            Contatos Pendentes de Unificação
          </h2>
          {unmatched.length > 0 && (
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-bold">
              {unmatched.length}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Leads que entraram em contato recentemente e ainda não foram vinculados a um cadastro de paciente.
        </p>

        {unmatched.length === 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
            <div className="text-2xl mb-2">✅</div>
            <p className="text-sm text-green-700 font-medium">Todos os contatos estão unificados!</p>
          </div>
        ) : (
          <div className="bg-white border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-amber-50 border-b border-amber-100">
                <tr>
                  <th className="text-left px-4 py-3 text-amber-700 font-medium">Contato</th>
                  <th className="text-left px-4 py-3 text-amber-700 font-medium">Telefone</th>
                  <th className="text-left px-4 py-3 text-amber-700 font-medium">Canal</th>
                  <th className="text-left px-4 py-3 text-amber-700 font-medium">Status Lead</th>
                  <th className="text-left px-4 py-3 text-amber-700 font-medium">Contato em</th>
                  <th className="text-left px-4 py-3 text-amber-700 font-medium">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {unmatched.map((u) => (
                  <tr key={u.lead_id} className="hover:bg-amber-50/40">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {u.full_name || <span className="text-gray-400">Sem nome</span>}
                      <div className="text-xs text-gray-400 font-normal">{u.code}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{u.phone}</td>
                    <td className="px-4 py-3">
                      <span className="text-base">{CHANNEL_ICONS[u.channel] || "🔗"}</span>
                      <span className="ml-1 text-xs text-gray-500">{u.channel}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${LEAD_STATUS_COLORS[u.status] || "bg-gray-100 text-gray-600"}`}>
                        {LEAD_STATUS_LABELS[u.status] || u.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(u.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setUnifyTarget(u)}
                        className="inline-flex items-center gap-1.5 text-xs bg-amber-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-amber-700 transition-colors"
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
