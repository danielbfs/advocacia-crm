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

export default function PatientDetailPage() {
  return <PatientDetailView />;
}

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

  if (loading) return <div className="p-8 text-gray-400">Carregando...</div>;
  if (!patient) return <div className="p-8 text-gray-400">Paciente não encontrado.</div>;

  return (
    <main className="p-8 max-w-3xl">
      <button
        onClick={() => router.push(backPath)}
        className="text-sm text-blue-600 hover:underline mb-4 block"
      >
        &larr; Voltar para Pacientes
      </button>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{patient.full_name || "Paciente sem nome"}</h1>
          <p className="text-gray-500">{patient.phone} {patient.email ? `| ${patient.email}` : ""}</p>
          <p className="text-xs text-gray-400 mt-1">
            Canal: {patient.channel} | Cadastro: {new Date(patient.created_at).toLocaleDateString("pt-BR")}
          </p>
        </div>
        <button
          onClick={() => setEditing(!editing)}
          className="text-sm text-blue-600 hover:underline"
        >
          {editing ? "Cancelar" : "Editar"}
        </button>
      </div>

      {editing && (
        <div className="bg-white border rounded-lg p-4 mb-6 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">Editar Paciente</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nome</label>
              <input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Telefone</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">E-mail</label>
              <input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Status</label>
              <select
                value={form.crm_status}
                onChange={(e) => setForm({ ...form, crm_status: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                {STATUS_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Observações</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                rows={3}
              />
            </div>
          </div>
          <button
            onClick={saveEdit}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            Salvar
          </button>
        </div>
      )}

      {/* Appointments */}
      <div className="bg-white border rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Agendamentos</h3>
        {appointments.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhum agendamento.</p>
        ) : (
          <div className="space-y-2">
            {appointments.map((appt) => (
              <div key={appt.id} className="flex items-center justify-between border rounded-lg px-3 py-2">
                <div>
                  <span className="text-sm font-medium text-gray-900">
                    {new Date(appt.starts_at).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}
                    {" "}
                    {new Date(appt.starts_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {appt.notes && <span className="text-xs text-gray-400 ml-2">{appt.notes}</span>}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  appt.status === "scheduled" ? "bg-blue-100 text-blue-700" :
                  appt.status === "confirmed" ? "bg-green-100 text-green-700" :
                  appt.status === "cancelled" ? "bg-red-100 text-red-500" :
                  "bg-gray-100 text-gray-700"
                }`}>
                  {appt.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
