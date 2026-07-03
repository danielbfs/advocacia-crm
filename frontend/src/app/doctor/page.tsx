"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface Appointment {
  id: string;
  patient_id: string;
  doctor_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  notes: string | null;
}

interface PatientLite {
  id: string;
  full_name: string | null;
  phone: string;
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  completed: "Concluído",
  cancelled: "Cancelado",
  no_show: "Não compareceu",
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: "#3b82f6",
  confirmed: "#22c55e",
  completed: "#9ca3af",
  cancelled: "#f87171",
  no_show: "#f97316",
};

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const HOUR_START = 7;
const HOUR_END = 20;
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);

function startOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(out.getDate() - out.getDay());
  return out;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

export default function DoctorCalendarPage() {
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date()));
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Record<string, PatientLite>>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Appointment | null>(null);

  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  useEffect(() => {
    if (!user?.doctor_id) return;
    fetchWeek();
  }, [weekStart, user?.doctor_id]);

  async function fetchWeek() {
    if (!user?.doctor_id) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        doctor_id: user.doctor_id,
        date_from: weekStart.toISOString(),
        date_to: weekEnd.toISOString(),
      });
      const { data } = await api.get(`/scheduling/appointments?${params}`);
      setAppointments(data);

      const ids = Array.from(new Set(data.map((a: Appointment) => a.patient_id))) as string[];
      const fetched: Record<string, PatientLite> = { ...patients };
      await Promise.all(
        ids
          .filter((id) => !fetched[id])
          .map(async (id) => {
            try {
              const { data: p } = await api.get(`/patients/${id}`);
              fetched[id] = p;
            } catch { /* ignore */ }
          })
      );
      setPatients(fetched);
    } finally {
      setLoading(false);
    }
  }

  function appointmentsForDay(day: Date): Appointment[] {
    const start = new Date(day); start.setHours(0, 0, 0, 0);
    const end = addDays(start, 1);
    return appointments
      .filter((a) => { const s = new Date(a.starts_at); return s >= start && s < end; })
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }

  function gridPos(a: Appointment) {
    const start = new Date(a.starts_at);
    const end = new Date(a.ends_at);
    const top = ((start.getHours() - HOUR_START) * 60 + start.getMinutes()) / 60 * 48;
    const height = Math.max(24, (end.getTime() - start.getTime()) / 60000 / 60 * 48);
    return { top, height };
  }

  function patientLabel(patientId: string) {
    const p = patients[patientId];
    return p ? (p.full_name || p.phone) : "...";
  }

  async function changeStatus(id: string, status: string) {
    try {
      await api.patch(`/scheduling/appointments/${id}`, { status });
      setSelected(null);
      fetchWeek();
    } catch { alert("Erro ao atualizar."); }
  }

  async function cancelAppt(id: string) {
    if (!confirm("Cancelar este agendamento?")) return;
    try {
      await api.delete(`/scheduling/appointments/${id}`);
      setSelected(null);
      fetchWeek();
    } catch { alert("Erro ao cancelar."); }
  }

  if (!user?.doctor_id) {
    return (
      <main className="p-8">
        <div className="rounded-sm border border-selo/40 bg-selo/15 p-6 text-selo">
          Seu usuário não está vinculado a nenhum médico. Contate o administrador.
        </div>
      </main>
    );
  }

  const weekLabel = `${weekStart.toLocaleDateString("pt-BR")} – ${addDays(weekStart, 6).toLocaleDateString("pt-BR")}`;

  return (
    <main className="p-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-display font-semibold text-parchment">Minha Agenda</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="border border-line bg-ink/40 px-3 py-2 rounded-sm text-sm hover:border-selo/50 hover:bg-ink-3">← Anterior</button>
          <button onClick={() => setWeekStart(startOfWeek(new Date()))} className="border border-line bg-ink/40 px-3 py-2 rounded-sm text-sm hover:border-selo/50 hover:bg-ink-3">Hoje</button>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="border border-line bg-ink/40 px-3 py-2 rounded-sm text-sm hover:border-selo/50 hover:bg-ink-3">Próxima →</button>
        </div>
      </div>

      <p className="text-sm text-parchment-dim mb-4">Semana de {weekLabel}</p>

      {loading ? (
        <p className="text-parchment-faint">Carregando...</p>
      ) : (
        <div className="bg-ink-2 border border-line rounded-sm overflow-hidden">
          <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-line">
            <div className="p-2 border-r border-line" />
            {days.map((d, i) => {
              const isToday = d.toDateString() === new Date().toDateString();
              return (
                <div key={i} className={`p-2 border-r border-line last:border-r-0 text-center text-xs ${isToday ? "bg-carimbo/10 font-semibold text-carimbo" : "text-parchment-dim"}`}>
                  <div>{DAY_LABELS[d.getDay()]}</div>
                  <div>{d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</div>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-[60px_repeat(7,1fr)]">
            <div className="border-r border-line">
              {HOURS.map((h) => (
                <div key={h} className="h-12 border-b border-line text-xs text-parchment-faint text-right pr-2 pt-1">
                  {String(h).padStart(2, "0")}:00
                </div>
              ))}
            </div>
            {days.map((day, di) => (
              <div key={di} className="border-r border-line last:border-r-0 relative" style={{ height: `${HOURS.length * 48}px` }}>
                {HOURS.map((h) => <div key={h} className="h-12 border-b border-line" />)}
                {appointmentsForDay(day).map((a) => {
                  const { top, height } = gridPos(a);
                  if (top < 0 || top > HOURS.length * 48) return null;
                  const color = STATUS_COLORS[a.status] || "#3b82f6";
                  return (
                    <button
                      key={a.id}
                      onClick={() => setSelected(a)}
                      className="absolute left-1 right-1 rounded-sm text-left p-1 text-[10px] text-white overflow-hidden hover:opacity-90"
                      style={{ top, height, backgroundColor: color }}
                    >
                      <div className="font-semibold truncate">
                        {new Date(a.starts_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} {patientLabel(a.patient_id)}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex gap-4 text-xs text-parchment-dim flex-wrap">
        {Object.entries(STATUS_LABELS).map(([k, label]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: STATUS_COLORS[k] }} />
            {label}
          </span>
        ))}
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-ink-2 border border-line rounded-sm p-6 w-full max-w-md">
            <div className="flex items-start justify-between mb-3">
              <h2 className="text-lg font-display font-semibold text-parchment">{patientLabel(selected.patient_id)}</h2>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium text-white" style={{ backgroundColor: STATUS_COLORS[selected.status] || "#6b7280" }}>
                {STATUS_LABELS[selected.status] || selected.status}
              </span>
            </div>
            <p className="text-sm text-parchment-dim mb-4">
              {new Date(selected.starts_at).toLocaleString("pt-BR")} — {new Date(selected.ends_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </p>
            {selected.notes && (
              <p className="text-sm text-parchment-dim bg-ink rounded-sm p-3 mb-4">{selected.notes}</p>
            )}
            <div className="flex flex-wrap gap-2 mb-2">
              {selected.status === "scheduled" && (
                <button onClick={() => changeStatus(selected.id, "confirmed")} className="text-xs bg-jade/15 text-jade px-3 py-1.5 rounded-sm hover:bg-jade/25">Confirmar</button>
              )}
              {(selected.status === "scheduled" || selected.status === "confirmed") && (
                <>
                  <button onClick={() => changeStatus(selected.id, "completed")} className="text-xs border border-line bg-ink/40 text-parchment px-3 py-1.5 rounded-sm hover:bg-ink-3">Concluir</button>
                  <button onClick={() => changeStatus(selected.id, "no_show")} className="text-xs bg-selo/15 text-selo px-3 py-1.5 rounded-sm hover:bg-selo/25">Não compareceu</button>
                </>
              )}
              {selected.status !== "cancelled" && (
                <button onClick={() => cancelAppt(selected.id)} className="text-xs bg-carimbo/10 text-carimbo-bright px-3 py-1.5 rounded-sm hover:bg-carimbo/20">Cancelar</button>
              )}
              <button onClick={() => setSelected(null)} className="text-xs text-parchment-dim ml-auto px-3 py-1.5">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
