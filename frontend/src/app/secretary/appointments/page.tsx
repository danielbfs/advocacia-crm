"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Doctor } from "@/types";

interface Appointment {
  id: string;
  patient_id: string;
  doctor_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  source: string | null;
  notes: string | null;
  created_at: string;
}

interface Slot {
  starts_at: string;
  ends_at: string;
  doctor_id?: string;
  doctor_name?: string;
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  completed: "Concluído",
  cancelled: "Cancelado",
  no_show: "Não compareceu",
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-info/15 text-info",
  confirmed: "bg-jade/15 text-jade",
  completed: "bg-parchment-dim/15 text-parchment-dim",
  cancelled: "bg-carimbo/10 text-carimbo-bright",
  no_show: "bg-selo/15 text-selo",
};

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [hideCancelled, setHideCancelled] = useState(true);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [createStep, setCreateStep] = useState(1); // 1=form, 2=pick slot
  const [createForm, setCreateForm] = useState({
    patient_phone: "",
    doctor_id: "",
    date: "",
    notes: "",
  });
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [saving, setSaving] = useState(false);

  // Status change
  const [changingStatus, setChangingStatus] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [apptRes, docsRes] = await Promise.allSettled([
        api.get("/scheduling/appointments"),
        api.get("/scheduling/doctors?active_only=true"),
      ]);
      if (apptRes.status === "fulfilled") setAppointments(apptRes.value.data);
      if (docsRes.status === "fulfilled") setDoctors(docsRes.value.data);
    } finally {
      setLoading(false);
    }
  }

  async function searchSlots() {
    if (!createForm.doctor_id || !createForm.date) return;
    setLoadingSlots(true);
    try {
      const dateFrom = `${createForm.date}T00:00:00Z`;
      const dateTo = `${createForm.date}T23:59:59Z`;
      const { data } = await api.get(
        `/scheduling/slots?doctor_id=${createForm.doctor_id}&date_from=${dateFrom}&date_to=${dateTo}`
      );
      setSlots(data);
      setCreateStep(2);
    } catch {
      alert("Erro ao buscar horários.");
    } finally {
      setLoadingSlots(false);
    }
  }

  async function createAppointment() {
    if (!selectedSlot || !createForm.patient_phone) return;
    setSaving(true);
    try {
      // First find or note patient by phone
      const patientsRes = await api.get(`/patients/?search=${encodeURIComponent(createForm.patient_phone)}`);
      const patients = patientsRes.data;

      let patientId: string;
      if (patients.length > 0) {
        patientId = patients[0].id;
      } else {
        // Create patient
        const newPatient = await api.post("/patients/", {
          phone: createForm.patient_phone,
          channel: "whatsapp",
        });
        patientId = newPatient.data.id;
      }

      await api.post("/scheduling/appointments", {
        patient_id: patientId,
        doctor_id: createForm.doctor_id,
        starts_at: selectedSlot.starts_at,
        ends_at: selectedSlot.ends_at,
        notes: createForm.notes || null,
        source: "secretary",
      });

      setShowCreate(false);
      setCreateStep(1);
      setCreateForm({ patient_phone: "", doctor_id: "", date: "", notes: "" });
      setSelectedSlot(null);
      setSlots([]);
      fetchData();
    } catch {
      alert("Erro ao criar agendamento.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(apptId: string, newStatus: string) {
    setChangingStatus(apptId);
    try {
      await api.patch(`/scheduling/appointments/${apptId}`, { status: newStatus });
      fetchData();
    } catch {
      alert("Erro ao alterar status.");
    } finally {
      setChangingStatus(null);
    }
  }

  async function cancelAppointment(apptId: string) {
    if (!confirm("Deseja cancelar este agendamento?")) return;
    try {
      await api.delete(`/scheduling/appointments/${apptId}`);
      fetchData();
    } catch {
      alert("Erro ao cancelar.");
    }
  }

  const doctorName = (id: string) => doctors.find((d) => d.id === id)?.full_name || "—";
  const visibleAppointments = hideCancelled
    ? appointments.filter((a) => a.status !== "cancelled")
    : appointments;

  return (
    <main className="p-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-display font-semibold text-parchment">Agendamentos</h1>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-parchment-dim cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideCancelled}
              onChange={(e) => setHideCancelled(e.target.checked)}
              className="rounded"
            />
            Ocultar cancelados
          </label>
          <button
            onClick={() => {
              setShowCreate(!showCreate);
              setCreateStep(1);
              setSlots([]);
              setSelectedSlot(null);
            }}
            className="bg-carimbo text-parchment px-4 py-2 rounded-sm text-sm font-semibold hover:bg-carimbo-bright"
          >
            {showCreate ? "Cancelar" : "Novo Agendamento"}
          </button>
        </div>
      </div>

      {/* Create Appointment Flow */}
      {showCreate && (
        <div className="bg-ink-2 border border-line rounded-sm p-4 mb-6">
          {createStep === 1 ? (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-parchment-dim">1. Selecione médico e data</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-parchment-dim mb-1">Telefone do Paciente *</label>
                  <input
                    value={createForm.patient_phone}
                    onChange={(e) => setCreateForm({ ...createForm, patient_phone: e.target.value })}
                    required
                    className="w-full border border-line rounded-sm px-3 py-2 text-sm"
                    placeholder="11999999999"
                  />
                </div>
                <div>
                  <label className="block text-xs text-parchment-dim mb-1">Médico *</label>
                  <select
                    value={createForm.doctor_id}
                    onChange={(e) => setCreateForm({ ...createForm, doctor_id: e.target.value })}
                    className="w-full border border-line rounded-sm px-3 py-2 text-sm"
                  >
                    <option value="">Selecione...</option>
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>{d.full_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-parchment-dim mb-1">Data *</label>
                  <input
                    type="date"
                    value={createForm.date}
                    onChange={(e) => setCreateForm({ ...createForm, date: e.target.value })}
                    className="w-full border border-line rounded-sm px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-parchment-dim mb-1">Observações</label>
                  <input
                    value={createForm.notes}
                    onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                    className="w-full border border-line rounded-sm px-3 py-2 text-sm"
                    placeholder="Opcional"
                  />
                </div>
              </div>
              <button
                onClick={searchSlots}
                disabled={!createForm.doctor_id || !createForm.date || !createForm.patient_phone || loadingSlots}
                className="bg-carimbo text-parchment px-4 py-2 rounded-sm text-sm font-semibold hover:bg-carimbo-bright disabled:opacity-50"
              >
                {loadingSlots ? "Buscando..." : "Ver Horários Disponíveis"}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-parchment-dim">2. Selecione o horário</h3>
                <button onClick={() => setCreateStep(1)} className="text-xs text-carimbo hover:underline">
                  &larr; Voltar
                </button>
              </div>
              {slots.length === 0 ? (
                <p className="text-sm text-parchment-faint">Nenhum horário disponível nesta data.</p>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {slots.map((slot, idx) => {
                    const time = new Date(slot.starts_at).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                    const isSelected = selectedSlot?.starts_at === slot.starts_at;
                    return (
                      <button
                        key={idx}
                        onClick={() => setSelectedSlot(slot)}
                        className={`px-3 py-2 rounded-sm border text-sm transition-colors ${
                          isSelected
                            ? "bg-carimbo text-parchment border-carimbo"
                            : "bg-ink-2 text-parchment-dim border-line hover:bg-ink-3"
                        }`}
                      >
                        {time}
                      </button>
                    );
                  })}
                </div>
              )}
              {selectedSlot && (
                <button
                  onClick={createAppointment}
                  disabled={saving}
                  className="bg-jade text-ink px-4 py-2 rounded-sm text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? "Agendando..." : "Confirmar Agendamento"}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Appointments List */}
      {loading ? (
        <p className="text-parchment-faint">Carregando...</p>
      ) : visibleAppointments.length === 0 ? (
        <p className="text-parchment-faint">
          {hideCancelled && appointments.some((a) => a.status === "cancelled")
            ? "Nenhum agendamento ativo. Desmarque \"Ocultar cancelados\" para ver todos."
            : "Nenhum agendamento encontrado."}
        </p>
      ) : (
        <div className="bg-ink-2 border border-line rounded-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ink-3 border-b border-line">
              <tr>
                <th className="text-left px-4 py-3 text-parchment-dim font-medium">Data / Hora</th>
                <th className="text-left px-4 py-3 text-parchment-dim font-medium">Médico</th>
                <th className="text-left px-4 py-3 text-parchment-dim font-medium">Status</th>
                <th className="text-left px-4 py-3 text-parchment-dim font-medium">Origem</th>
                <th className="text-left px-4 py-3 text-parchment-dim font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visibleAppointments.map((appt) => (
                <tr key={appt.id} className="hover:bg-ink-3">
                  <td className="px-4 py-3">
                    <div className="font-medium text-parchment">
                      {new Date(appt.starts_at).toLocaleDateString("pt-BR", {
                        weekday: "short",
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </div>
                    <div className="text-parchment-faint">
                      {new Date(appt.starts_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      {" — "}
                      {new Date(appt.ends_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-parchment-dim">{doctorName(appt.doctor_id)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[appt.status] || "bg-ink-3 text-parchment-dim"}`}>
                      {STATUS_LABELS[appt.status] || appt.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-parchment-dim">
                    {appt.source === "ai_chat" ? "IA" : appt.source === "secretary" ? "Secretária" : appt.source || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {appt.status === "scheduled" && (
                        <>
                          <button
                            onClick={() => updateStatus(appt.id, "confirmed")}
                            disabled={changingStatus === appt.id}
                            className="text-xs text-jade hover:underline"
                          >
                            Confirmar
                          </button>
                          <button
                            onClick={() => cancelAppointment(appt.id)}
                            className="text-xs text-carimbo-bright hover:underline"
                          >
                            Cancelar
                          </button>
                        </>
                      )}
                      {appt.status === "confirmed" && (
                        <>
                          <button
                            onClick={() => updateStatus(appt.id, "completed")}
                            disabled={changingStatus === appt.id}
                            className="text-xs text-carimbo hover:underline"
                          >
                            Concluir
                          </button>
                          <button
                            onClick={() => updateStatus(appt.id, "no_show")}
                            disabled={changingStatus === appt.id}
                            className="text-xs text-selo hover:underline"
                          >
                            No-show
                          </button>
                          <button
                            onClick={() => cancelAppointment(appt.id)}
                            className="text-xs text-carimbo-bright hover:underline"
                          >
                            Cancelar
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
