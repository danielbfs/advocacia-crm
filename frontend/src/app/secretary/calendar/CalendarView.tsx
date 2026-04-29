"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Doctor } from "@/types";

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

type ViewMode = "month" | "week" | "day";

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  completed: "Concluído",
  cancelled: "Cancelado",
  no_show: "Não compareceu",
};

const STATUS_BORDER: Record<string, string> = {
  scheduled: "#60a5fa",
  confirmed: "#4ade80",
  completed: "#d1d5db",
  cancelled: "#fca5a5",
  no_show: "#fdba74",
};

const DOCTOR_PALETTE = [
  "#7c3aed", "#0d9488", "#b45309", "#2563eb",
  "#db2777", "#4f46e5", "#047857", "#0891b2",
];

const DAY_LABELS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DAY_LABELS_FULL  = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
const MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const HOUR_START = 7;
const HOUR_END = 20;
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);

// ── Date helpers ────────────────────────────────────────────────────────────

function startOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(out.getDate() - out.getDay()); // Sunday = 0
  return out;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function sameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

function generateMonthGrid(d: Date): (Date | null)[][] {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const startDow = first.getDay(); // 0=Sun

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(new Date(d.getFullYear(), d.getMonth(), day));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// ── Component ───────────────────────────────────────────────────────────────

export function CalendarView({ basePath = "/secretary" }: { basePath?: string }) {
  const [view, setView] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorFilter, setDoctorFilter] = useState<string>("all");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Record<string, PatientLite>>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [hideCancelled, setHideCancelled] = useState(true);

  useEffect(() => {
    api.get("/scheduling/doctors?active_only=true").then(({ data }) => setDoctors(data)).catch(() => {});
  }, []);

  const doctorColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    doctors.forEach((d, i) => { map[d.id] = DOCTOR_PALETTE[i % DOCTOR_PALETTE.length]; });
    return map;
  }, [doctors]);

  const dateRange = useMemo(() => {
    if (view === "month") {
      return { from: startOfMonth(currentDate), to: endOfMonth(currentDate) };
    }
    if (view === "week") {
      const ws = startOfWeek(currentDate);
      return { from: ws, to: addDays(ws, 7) };
    }
    // day
    const d = new Date(currentDate); d.setHours(0, 0, 0, 0);
    return { from: d, to: addDays(d, 1) };
  }, [view, currentDate]);

  useEffect(() => {
    fetchAppointments(dateRange.from, dateRange.to);
  }, [dateRange, doctorFilter]);

  async function fetchAppointments(from: Date, to: Date) {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        date_from: from.toISOString(),
        date_to: to.toISOString(),
      });
      if (doctorFilter !== "all") params.set("doctor_id", doctorFilter);
      const { data } = await api.get(`/scheduling/appointments?${params}`);
      setAppointments(data);

      const ids = Array.from(new Set(data.map((a: Appointment) => a.patient_id))) as string[];
      const fetched: Record<string, PatientLite> = { ...patients };
      await Promise.all(
        ids.filter((id) => !fetched[id]).map(async (id) => {
          try { const { data: p } = await api.get(`/patients/${id}`); fetched[id] = p; }
          catch { /* ignore */ }
        })
      );
      setPatients(fetched);
    } finally {
      setLoading(false);
    }
  }

  function navigate(dir: number) {
    const d = new Date(currentDate);
    if (view === "month") d.setMonth(d.getMonth() + dir);
    else if (view === "week") d.setDate(d.getDate() + dir * 7);
    else d.setDate(d.getDate() + dir);
    setCurrentDate(d);
  }

  function goToday() { setCurrentDate(new Date()); }

  function patientLabel(pid: string) {
    const p = patients[pid];
    return p ? (p.full_name || p.phone) : "...";
  }

  function doctorLabel(did: string) {
    return doctors.find((d) => d.id === did)?.full_name || "—";
  }

  const visibleAppointments = useMemo(
    () => hideCancelled ? appointments.filter((a) => a.status !== "cancelled") : appointments,
    [appointments, hideCancelled]
  );

  function appointmentsForDay(day: Date): Appointment[] {
    const s = new Date(day); s.setHours(0, 0, 0, 0);
    const e = addDays(s, 1);
    return visibleAppointments
      .filter((a) => { const t = new Date(a.starts_at); return t >= s && t < e; })
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }

  function gridPos(a: Appointment) {
    const start = new Date(a.starts_at);
    const end = new Date(a.ends_at);
    const top = ((start.getHours() - HOUR_START) * 60 + start.getMinutes()) / 60 * 48;
    const height = Math.max(24, (end.getTime() - start.getTime()) / 60000 / 60 * 48);
    return { top, height };
  }

  async function changeStatus(id: string, status: string) {
    try { await api.patch(`/scheduling/appointments/${id}`, { status }); setSelected(null); fetchAppointments(dateRange.from, dateRange.to); }
    catch { alert("Erro ao atualizar."); }
  }

  async function cancelAppointment(id: string) {
    if (!confirm("Cancelar este agendamento?")) return;
    try { await api.delete(`/scheduling/appointments/${id}`); setSelected(null); fetchAppointments(dateRange.from, dateRange.to); }
    catch { alert("Erro ao cancelar."); }
  }

  // ── Header label ─────────────────────────────────────────────────────────
  const headerLabel = useMemo(() => {
    if (view === "month") return `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    if (view === "week") {
      const ws = startOfWeek(currentDate);
      return `${ws.toLocaleDateString("pt-BR")} – ${addDays(ws, 6).toLocaleDateString("pt-BR")}`;
    }
    return currentDate.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  }, [view, currentDate]);

  // ── Time-grid columns (week or day) ────────────────────────────────────
  const gridDays = useMemo(() => {
    if (view === "week") return Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(currentDate), i));
    return [new Date(currentDate)];
  }, [view, currentDate]);

  // ── Month grid ───────────────────────────────────────────────────────────
  const monthGrid = useMemo(() => generateMonthGrid(currentDate), [currentDate]);

  return (
    <main className="p-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Calendário</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle */}
          <div className="flex border rounded-lg overflow-hidden text-sm">
            {(["month","week","day"] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-2 ${view === v ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              >
                {v === "month" ? "Mês" : v === "week" ? "Semana" : "Dia"}
              </button>
            ))}
          </div>

          {/* Doctor filter */}
          <select value={doctorFilter} onChange={(e) => setDoctorFilter(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
            <option value="all">Todos os médicos</option>
            {doctors.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
          </select>

          {/* Navigation */}
          <button onClick={() => navigate(-1)} className="border px-3 py-2 rounded-lg text-sm hover:bg-gray-50">← Anterior</button>
          <button onClick={goToday} className="border px-3 py-2 rounded-lg text-sm hover:bg-gray-50">Hoje</button>
          <button onClick={() => navigate(1)} className="border px-3 py-2 rounded-lg text-sm hover:bg-gray-50">Próximo →</button>

          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none border rounded-lg px-3 py-2 bg-white">
            <input
              type="checkbox"
              checked={hideCancelled}
              onChange={(e) => setHideCancelled(e.target.checked)}
              className="rounded"
            />
            Ocultar cancelados
          </label>

          <Link href={`${basePath}/appointments`} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
            Novo Agendamento
          </Link>
        </div>
      </div>

      <p className="text-sm text-gray-500 mb-4">{headerLabel}</p>

      {loading ? (
        <p className="text-gray-400">Carregando...</p>
      ) : (
        <>
          {/* ── MONTH VIEW ──────────────────────────────────────────────── */}
          {view === "month" && (
            <div className="bg-white border rounded-lg overflow-hidden">
              <div className="grid grid-cols-7 border-b bg-gray-50">
                {DAY_LABELS_SHORT.map((d) => (
                  <div key={d} className="p-2 text-center text-xs font-medium text-gray-500">{d}</div>
                ))}
              </div>
              {monthGrid.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 border-b last:border-b-0">
                  {week.map((day, di) => {
                    if (!day) return <div key={di} className="min-h-[100px] border-r last:border-r-0 bg-gray-50/50" />;
                    const isToday = sameDay(day, new Date());
                    const dayAppts = appointmentsForDay(day);
                    return (
                      <div
                        key={di}
                        className={`min-h-[100px] border-r last:border-r-0 p-1.5 cursor-pointer hover:bg-blue-50/30 transition-colors ${isToday ? "bg-blue-50/40" : ""}`}
                        onClick={() => { setCurrentDate(day); setView("day"); }}
                      >
                        <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isToday ? "bg-blue-600 text-white" : "text-gray-700"}`}>
                          {day.getDate()}
                        </div>
                        <div className="space-y-0.5">
                          {dayAppts.slice(0, 3).map((a) => (
                            <button
                              key={a.id}
                              onClick={(e) => { e.stopPropagation(); setSelected(a); }}
                              className="w-full text-left text-[10px] text-white rounded px-1.5 py-0.5 truncate hover:opacity-90"
                              style={{ backgroundColor: doctorColorMap[a.doctor_id] || "#6b7280" }}
                            >
                              {new Date(a.starts_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} {patientLabel(a.patient_id)}
                            </button>
                          ))}
                          {dayAppts.length > 3 && (
                            <div className="text-[10px] text-gray-400 pl-1">+{dayAppts.length - 3} mais</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {/* ── WEEK / DAY VIEW ─────────────────────────────────────────── */}
          {(view === "week" || view === "day") && (
            <div className="bg-white border rounded-lg overflow-hidden">
              {/* Header */}
              <div className={`grid border-b ${view === "week" ? "grid-cols-[60px_repeat(7,1fr)]" : "grid-cols-[60px_1fr]"}`}>
                <div className="p-2 border-r" />
                {gridDays.map((d, i) => {
                  const isToday = sameDay(d, new Date());
                  return (
                    <div key={i} className={`p-2 border-r last:border-r-0 text-center text-xs ${isToday ? "bg-blue-50 font-semibold text-blue-700" : "text-gray-600"}`}>
                      <div>{view === "day" ? DAY_LABELS_FULL[d.getDay()] : DAY_LABELS_SHORT[d.getDay()]}</div>
                      <div>{d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</div>
                    </div>
                  );
                })}
              </div>
              {/* Body */}
              <div className={`grid ${view === "week" ? "grid-cols-[60px_repeat(7,1fr)]" : "grid-cols-[60px_1fr]"}`}>
                <div className="border-r">
                  {HOURS.map((h) => (
                    <div key={h} className="h-12 border-b text-xs text-gray-400 text-right pr-2 pt-1">
                      {String(h).padStart(2, "0")}:00
                    </div>
                  ))}
                </div>
                {gridDays.map((day, di) => {
                  const dayAppts = appointmentsForDay(day);
                  return (
                    <div key={di} className="border-r last:border-r-0 relative" style={{ height: `${HOURS.length * 48}px` }}>
                      {HOURS.map((h) => <div key={h} className="h-12 border-b" />)}
                      {dayAppts.map((a) => {
                        const { top, height } = gridPos(a);
                        if (top < 0 || top > HOURS.length * 48) return null;
                        const bgColor = doctorColorMap[a.doctor_id] || "#6b7280";
                        const borderColor = STATUS_BORDER[a.status] || "#e5e7eb";
                        return (
                          <button
                            key={a.id}
                            onClick={() => setSelected(a)}
                            className="absolute left-1 right-1 rounded text-left p-1 text-[10px] text-white shadow-sm overflow-hidden hover:opacity-90"
                            style={{ top, height, backgroundColor: bgColor, borderLeft: `3px solid ${borderColor}` }}
                            title={`${patientLabel(a.patient_id)} — ${doctorLabel(a.doctor_id)}`}
                          >
                            <div className="font-semibold truncate">
                              {new Date(a.starts_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} {patientLabel(a.patient_id)}
                            </div>
                            {view === "day" && <div className="opacity-90 truncate">{doctorLabel(a.doctor_id)}</div>}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Legends */}
      <div className="mt-4 flex flex-wrap gap-5">
        {doctors.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-gray-400 font-medium">Médicos:</span>
            {doctors.map((d) => (
              <span key={d.id} className="flex items-center gap-1.5 text-xs text-gray-600">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: doctorColorMap[d.id] }} />
                {d.full_name}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-gray-400 font-medium">Status (borda):</span>
          {Object.entries(STATUS_LABELS).map(([k, label]) => (
            <span key={k} className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="inline-block w-3 h-3 rounded-sm border-2" style={{ borderColor: STATUS_BORDER[k] || "#e5e7eb", backgroundColor: "transparent" }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{patientLabel(selected.patient_id)}</h2>
                <p className="text-sm text-gray-500">{doctorLabel(selected.doctor_id)}</p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium text-white" style={{ backgroundColor: doctorColorMap[selected.doctor_id] || "#6b7280" }}>
                {STATUS_LABELS[selected.status] || selected.status}
              </span>
            </div>
            <p className="text-sm text-gray-700 mb-4">
              {new Date(selected.starts_at).toLocaleString("pt-BR")} —{" "}
              {new Date(selected.ends_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </p>
            {selected.notes && <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 mb-4">{selected.notes}</p>}
            <div className="flex flex-wrap gap-2 mb-2">
              {selected.status === "scheduled" && (
                <button onClick={() => changeStatus(selected.id, "confirmed")} className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700">Confirmar</button>
              )}
              {(selected.status === "scheduled" || selected.status === "confirmed") && (
                <>
                  <button onClick={() => changeStatus(selected.id, "completed")} className="text-xs bg-gray-600 text-white px-3 py-1.5 rounded-lg">Concluir</button>
                  <button onClick={() => changeStatus(selected.id, "no_show")} className="text-xs bg-orange-500 text-white px-3 py-1.5 rounded-lg">Não compareceu</button>
                </>
              )}
              {selected.status !== "cancelled" && (
                <button onClick={() => cancelAppointment(selected.id)} className="text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg">Cancelar</button>
              )}
              <button onClick={() => setSelected(null)} className="text-xs text-gray-500 ml-auto px-3 py-1.5">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
