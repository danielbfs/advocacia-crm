"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";

interface Patient {
  id: string;
  full_name: string | null;
  phone: string;
  email: string | null;
  channel: string;
  channel_id: string | null;
  crm_status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface Appointment {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  source: string | null;
  notes: string | null;
}

const STATUS_OPTIONS = [
  { value: "new", label: "Novo" },
  { value: "qualified", label: "Qualificado" },
  { value: "scheduled", label: "Agendado" },
  { value: "completed", label: "Atendido" },
  { value: "no_show", label: "Não compareceu" },
];

export function PatientDetailView({ backPath = "/secretary/patients" }: { backPath?: string }) {
  const { id } = useParams();
  const router = useRouter();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    crm_status: "new",
    notes: "",
  });

  useEffect(() => {
    if (id) fetchPatient();
  }, [id]);

  async function fetchPatient() {
    setLoading(true);
    try {
      const [patRes, apptRes] = await Promise.allSettled([
        api.get(`/patients/${id}`),
        api.get(`/scheduling/appointments?patient_id=${id}`),
      ]);
      if (patRes.status === "fulfilled") {
        const p = patRes.value.data;
        setPatient(p);
        setForm({
          full_name: p.full_name || "",
          phone: p.phone || "",
          email: p.email || "",
          crm_status: p.crm_status || "new",
          notes: p.notes || "",
        });
      }
      if (apptRes.status === "fulfilled") {
        setAppointments(apptRes.value.data);
      }
    } finally {
      setLoading(false);
    }
  }

  async function saveEdit() {
    if (!patient) return;
    try {
      await api.patch(`/patients/${patient.id}`, {
        full_name: form.full_name || null,
        phone: form.phone,
        email: form.email || null,
        crm_status: form.crm_status,
        notes: form.notes || null,
      });
      setEditing(false);
      fetchPatient();
    } catch {
      alert("Erro ao salvar.");
    }
  }

  if (loading) return <div className="p-8 text-parchment-faint">Carregando...</div>;
  if (!patient) return <div className="p-8 text-parchment-faint">Cliente não encontrado.</div>;

  return (
    <main className="p-8 max-w-3xl">
      <button
        onClick={() => router.push(backPath)}
        className="text-sm text-carimbo hover:underline mb-4 block"
      >
        &larr; Voltar para Clientes
      </button>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-semibold text-parchment">{patient.full_name || "Cliente sem nome"}</h1>
          <p className="text-parchment-dim">{patient.phone} {patient.email ? `| ${patient.email}` : ""}</p>
          <p className="text-xs text-parchment-faint mt-1">
            Canal: {patient.channel} | Cadastro: {new Date(patient.created_at).toLocaleDateString("pt-BR")}
          </p>
        </div>
        <button
          onClick={() => setEditing(!editing)}
          className="text-sm text-carimbo hover:underline"
        >
          {editing ? "Cancelar" : "Editar"}
        </button>
      </div>

      {editing && (
        <div className="bg-ink-2 border border-line rounded-sm p-4 mb-6 space-y-3">
          <h3 className="text-sm font-semibold text-parchment-dim">Editar Cliente</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-parchment-dim mb-1">Nome</label>
              <input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                className="w-full border border-line bg-ink/60 text-parchment rounded-sm px-3 py-2 text-sm focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-parchment-dim mb-1">Telefone</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full border border-line bg-ink/60 text-parchment rounded-sm px-3 py-2 text-sm focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-parchment-dim mb-1">E-mail</label>
              <input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full border border-line bg-ink/60 text-parchment rounded-sm px-3 py-2 text-sm focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-parchment-dim mb-1">Status</label>
              <select
                value={form.crm_status}
                onChange={(e) => setForm({ ...form, crm_status: e.target.value })}
                className="w-full border border-line bg-ink/60 text-parchment rounded-sm px-3 py-2 text-sm focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
              >
                {STATUS_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-parchment-dim mb-1">Observações</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full border border-line bg-ink/60 text-parchment rounded-sm px-3 py-2 text-sm focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
                rows={3}
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

      {/* Appointments */}
      <div className="bg-ink-2 border border-line rounded-sm p-4">
        <h3 className="text-sm font-semibold text-parchment-dim mb-3">Consultas</h3>
        {appointments.length === 0 ? (
          <p className="text-sm text-parchment-faint">Nenhuma consulta.</p>
        ) : (
          <div className="space-y-2">
            {appointments.map((appt) => (
              <div key={appt.id} className="flex items-center justify-between border border-line rounded-sm px-3 py-2">
                <div>
                  <span className="text-sm font-medium text-parchment">
                    {new Date(appt.starts_at).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}
                    {" "}
                    {new Date(appt.starts_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {appt.notes && <span className="text-xs text-parchment-faint ml-2">{appt.notes}</span>}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  appt.status === "scheduled" ? "bg-info/15 text-info" :
                  appt.status === "confirmed" ? "bg-jade/15 text-jade" :
                  appt.status === "cancelled" ? "bg-carimbo/10 text-carimbo-bright" :
                  "bg-ink-3 text-parchment-dim"
                }`}>
                  {appt.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Messaging History */}
      <div className="bg-ink-2 border border-line rounded-sm p-4 mt-6">
        <h3 className="text-sm font-semibold text-parchment-dim mb-3 flex items-center gap-2">
          <MessageSquare size={16} strokeWidth={1.5} />
          Histórico de Mensagens
        </h3>
        <ChatHistory patientId={patient.id} />
      </div>
    </main>
  );
}

function ChatHistory({ patientId }: { patientId: string }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMessages() {
      try {
        // First find conversation for this patient
        const convRes = await api.get<any[]>('/messaging/conversations');
        const myConv = convRes.data.find(c => c.patient_id === patientId || c.lead_id === patientId);
        
        if (myConv) {
          const msgRes = await api.get(`/messaging/conversations/${myConv.id}/messages`);
          setMessages(msgRes.data);
        }
      } catch (error) {
        console.error('Failed to fetch messages', error);
      } finally {
        setLoading(false);
      }
    }
    fetchMessages();
  }, [patientId]);

  if (loading) return <div className="text-xs text-parchment-faint">Carregando mensagens...</div>;
  if (messages.length === 0) return <p className="text-sm text-parchment-faint">Nenhuma conversa registrada.</p>;

  return (
    <div className="space-y-3 max-h-96 overflow-y-auto p-2 bg-ink rounded-sm">
      {messages.map((m) => (
        <div
          key={m.id}
          className={`p-2 rounded-sm text-xs max-w-[80%] ${
            m.role === 'user' ? 'bg-ink-2 self-start border border-line' : 'bg-jade/10 self-end ml-auto border border-jade/30'
          }`}
        >
          <p className="whitespace-pre-wrap text-parchment">{m.content}</p>
          <span className="text-[9px] text-parchment-faint mt-1 block text-right">
            {new Date(m.sent_at).toLocaleString("pt-BR")}
          </span>
        </div>
      ))}
    </div>
  );
}

import { MessageSquare } from "lucide-react";
