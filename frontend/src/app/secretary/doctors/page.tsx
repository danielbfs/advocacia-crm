"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Doctor, Specialty } from "@/types";

const DAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

interface ScheduleItem {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export default function SecretaryDoctorsPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [loading, setLoading] = useState(true);

  // Schedule modal
  const [scheduleDoctor, setScheduleDoctor] = useState<Doctor | null>(null);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);

  // Blocks modal
  const [blocksDoctor, setBlocksDoctor] = useState<Doctor | null>(null);
  const [blocks, setBlocks] = useState<{ id: string; starts_at: string; ends_at: string; reason: string | null }[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [docsRes, specsRes] = await Promise.allSettled([
        api.get("/scheduling/doctors"),
        api.get("/specialties/"),
      ]);
      if (docsRes.status === "fulfilled") setDoctors(docsRes.value.data);
      if (specsRes.status === "fulfilled") setSpecialties(specsRes.value.data);
    } finally {
      setLoading(false);
    }
  }

  async function openSchedule(doc: Doctor) {
    setScheduleDoctor(doc);
    try {
      const { data } = await api.get(`/scheduling/doctors/${doc.id}/schedule`);
      setScheduleItems(
        data.map((s: { day_of_week: number; start_time: string; end_time: string }) => ({
          day_of_week: s.day_of_week,
          start_time: s.start_time.slice(0, 5),
          end_time: s.end_time.slice(0, 5),
        }))
      );
    } catch {
      setScheduleItems([]);
    }
  }

  async function openBlocks(doc: Doctor) {
    setBlocksDoctor(doc);
    try {
      const { data } = await api.get(`/scheduling/blocks?doctor_id=${doc.id}`);
      setBlocks(data);
    } catch {
      setBlocks([]);
    }
  }

  const specName = (id: string | null) => (id ? specialties.find((s) => s.id === id)?.name : null) || "—";

  if (loading) return <div className="p-8 text-parchment-faint">Carregando...</div>;

  return (
    <main className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-semibold text-parchment">Médicos</h1>
      </div>

      {/* Schedule Modal */}
      {scheduleDoctor && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-ink-2 rounded-sm p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-parchment mb-1">
              Horários — {scheduleDoctor.full_name}
            </h2>
            <p className="text-sm text-parchment-dim mb-4">Horários de atendimento recorrentes.</p>

            {scheduleItems.length === 0 ? (
              <p className="text-sm text-parchment-faint mb-4">Nenhum horário cadastrado.</p>
            ) : (
              <div className="space-y-2 mb-4">
                {scheduleItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="border border-line rounded-sm px-2 py-1.5 text-sm flex-1 bg-ink-3">
                      {DAYS[item.day_of_week]}
                    </span>
                    <span className="border border-line rounded-sm px-2 py-1.5 text-sm bg-ink-3">
                      {item.start_time}
                    </span>
                    <span className="text-parchment-faint">—</span>
                    <span className="border border-line rounded-sm px-2 py-1.5 text-sm bg-ink-3">
                      {item.end_time}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 justify-end border-t border-line pt-4">
              <button
                onClick={() => setScheduleDoctor(null)}
                className="text-sm text-parchment-dim px-4 py-2"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Blocks Modal */}
      {blocksDoctor && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-ink-2 rounded-sm p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-parchment mb-1">
              Bloqueios — {blocksDoctor.full_name}
            </h2>
            <p className="text-sm text-parchment-dim mb-4">
              Períodos em que o médico não atende.
            </p>

            {/* Existing blocks */}
            {blocks.length === 0 ? (
              <p className="text-sm text-parchment-faint mb-4">Nenhum bloqueio cadastrado.</p>
            ) : (
              <div className="space-y-2 mb-4">
                {blocks.map((block) => (
                  <div key={block.id} className="flex items-center justify-between bg-ink-3 rounded-sm px-3 py-2">
                    <div>
                      <div className="text-sm text-parchment">
                        {new Date(block.starts_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        {" — "}
                        {new Date(block.ends_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </div>
                      {block.reason && (
                        <div className="text-xs text-parchment-dim">{block.reason}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end border-t border-line pt-4">
              <button
                onClick={() => setBlocksDoctor(null)}
                className="text-sm text-parchment-dim px-4 py-2"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Doctors Table */}
      <div className="bg-ink-2 border border-line rounded-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ink-3 border-b border-line">
            <tr>
              <th className="text-left px-4 py-3 text-parchment-dim font-medium">Nome</th>
              <th className="text-left px-4 py-3 text-parchment-dim font-medium">CRM</th>
              <th className="text-left px-4 py-3 text-parchment-dim font-medium">Especialidade</th>
              <th className="text-left px-4 py-3 text-parchment-dim font-medium">Slot</th>
              <th className="text-left px-4 py-3 text-parchment-dim font-medium">Status</th>
              <th className="text-left px-4 py-3 text-parchment-dim font-medium">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {doctors.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-parchment-faint">
                  Nenhum médico cadastrado.
                </td>
              </tr>
            ) : (
              doctors.map((doc) => (
                <tr key={doc.id} className="hover:bg-ink-3">
                  <td className="px-4 py-3 font-medium text-parchment">{doc.full_name}</td>
                  <td className="px-4 py-3 text-parchment-dim">{doc.crm || "—"}</td>
                  <td className="px-4 py-3 text-parchment-dim">{specName(doc.specialty_id)}</td>
                  <td className="px-4 py-3 text-parchment-dim">{doc.slot_duration_minutes} min</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        doc.is_active ? "bg-jade/15 text-jade" : "bg-ink-3 text-parchment-dim"
                      }`}
                    >
                      {doc.is_active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      <button onClick={() => openSchedule(doc)} className="text-xs text-selo hover:underline">
                        Horários
                      </button>
                      <button onClick={() => openBlocks(doc)} className="text-xs text-carimbo-bright hover:underline">
                        Bloqueios
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
