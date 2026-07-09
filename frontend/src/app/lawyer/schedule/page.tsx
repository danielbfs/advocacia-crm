"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface ScheduleRow {
  day_of_week: number;
  start_time: string; // "HH:MM:SS" from backend
  end_time: string;
}

const DAY_NAMES = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

function toHHMM(t: string) {
  return t.slice(0, 5); // "08:00:00" → "08:00"
}

export default function LawyerSchedulePage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user?.lawyer_id) return;
    api
      .get(`/scheduling/lawyers/${user.lawyer_id}/schedule`)
      .then(({ data }) => setRows(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.lawyer_id]);

  function addRow() {
    setRows([...rows, { day_of_week: 0, start_time: "08:00", end_time: "12:00" }]);
  }

  function removeRow(idx: number) {
    setRows(rows.filter((_, i) => i !== idx));
  }

  function updateRow(idx: number, field: keyof ScheduleRow, value: string | number) {
    setRows(rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  }

  async function save() {
    if (!user?.lawyer_id) return;
    setSaving(true);
    try {
      await api.put(`/scheduling/lawyers/${user.lawyer_id}/schedule`, {
        schedules: rows.map((r) => ({
          day_of_week: Number(r.day_of_week),
          start_time: toHHMM(r.start_time),
          end_time: toHHMM(r.end_time),
        })),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      alert("Erro ao salvar horários.");
    } finally {
      setSaving(false);
    }
  }

  if (!user?.lawyer_id) {
    return (
      <main className="p-8">
        <div className="bg-selo/15 border border-line rounded-sm p-6 text-selo">
          Seu usuário não está vinculado a nenhum advogado. Contate o administrador.
        </div>
      </main>
    );
  }

  return (
    <main className="p-8 max-w-2xl">
      <h1 className="text-2xl font-display font-semibold text-parchment mb-2">Meus Horários</h1>
      <p className="text-sm text-parchment-dim mb-6">
        Configure os dias e horários em que você está disponível para consultas.
      </p>

      {saved && (
        <div className="mb-4 bg-jade/15 border border-line text-jade text-sm px-4 py-2 rounded-sm">
          Horários salvos com sucesso.
        </div>
      )}

      {loading ? (
        <p className="text-parchment-faint">Carregando...</p>
      ) : (
        <div className="bg-ink-2 border border-line rounded-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ink border-b border-line">
              <tr>
                <th className="text-left p-3 font-medium text-parchment-dim">Dia</th>
                <th className="text-left p-3 font-medium text-parchment-dim">Início</th>
                <th className="text-left p-3 font-medium text-parchment-dim">Fim</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-parchment-faint">
                    Nenhum horário configurado.
                  </td>
                </tr>
              )}
              {rows.map((row, idx) => (
                <tr key={idx}>
                  <td className="p-3">
                    <select
                      value={row.day_of_week}
                      onChange={(e) => updateRow(idx, "day_of_week", Number(e.target.value))}
                      className="border border-line bg-ink/60 rounded-sm px-2 py-1.5 text-sm w-full text-parchment focus:outline-none focus:border-carimbo focus:ring-1 focus:ring-carimbo"
                    >
                      {DAY_NAMES.map((name, d) => (
                        <option key={d} value={d}>{name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="p-3">
                    <input
                      type="time"
                      value={toHHMM(row.start_time)}
                      onChange={(e) => updateRow(idx, "start_time", e.target.value)}
                      className="border border-line bg-ink/60 rounded-sm px-2 py-1.5 text-sm w-full text-parchment focus:outline-none focus:border-carimbo focus:ring-1 focus:ring-carimbo"
                    />
                  </td>
                  <td className="p-3">
                    <input
                      type="time"
                      value={toHHMM(row.end_time)}
                      onChange={(e) => updateRow(idx, "end_time", e.target.value)}
                      className="border border-line bg-ink/60 rounded-sm px-2 py-1.5 text-sm w-full text-parchment focus:outline-none focus:border-carimbo focus:ring-1 focus:ring-carimbo"
                    />
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => removeRow(idx)}
                      className="text-carimbo-bright hover:text-carimbo text-xs px-2 py-1 rounded-sm"
                    >
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="p-3 border-t border-line flex items-center justify-between">
            <button
              onClick={addRow}
              className="text-sm text-carimbo hover:text-carimbo-bright font-medium"
            >
              + Adicionar horário
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="bg-carimbo text-parchment px-4 py-2 rounded-sm text-sm font-semibold hover:bg-carimbo-bright active:translate-y-px disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar Horários"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
