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

export default function DoctorsPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: "",
    crm: "",
    specialty_id: "",
    slot_duration_minutes: 30,
  });
  const [saving, setSaving] = useState(false);

  // Schedule modal
  const [scheduleDoctor, setScheduleDoctor] = useState<Doctor | null>(null);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [savingSchedule, setSavingSchedule] = useState(false);

  // Blocks modal
  const [blocksDoctor, setBlocksDoctor] = useState<Doctor | null>(null);
  const [blocks, setBlocks] = useState<{ id: string; starts_at: string; ends_at: string; reason: string | null }[]>([]);
  const [blockForm, setBlockForm] = useState({ starts_at: "", ends_at: "", reason: "" });
  const [savingBlock, setSavingBlock] = useState(false);

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

  function openCreate() {
    setEditingId(null);
    setForm({ full_name: "", crm: "", specialty_id: "", slot_duration_minutes: 30 });
    setShowForm(true);
  }

  function openEdit(doc: Doctor) {
    setEditingId(doc.id);
    setForm({
      full_name: doc.full_name,
      crm: doc.crm || "",
      specialty_id: doc.specialty_id || "",
      slot_duration_minutes: doc.slot_duration_minutes,
    });
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        full_name: form.full_name,
        crm: form.crm || null,
        specialty_id: form.specialty_id || null,
        slot_duration_minutes: form.slot_duration_minutes,
      };
      if (editingId) {
        await api.patch(`/scheduling/doctors/${editingId}`, payload);
      } else {
        await api.post("/scheduling/doctors", payload);
      }
      cancelForm();
      fetchData();
    } catch {
      alert("Erro ao salvar médico.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(doc: Doctor) {
    try {
      await api.patch(`/scheduling/doctors/${doc.id}`, { is_active: !doc.is_active });
      fetchData();
    } catch {
      // ignore
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

  function addScheduleRow() {
    setScheduleItems([...scheduleItems, { day_of_week: 0, start_time: "08:00", end_time: "12:00" }]);
  }

  function removeScheduleRow(idx: number) {
    setScheduleItems(scheduleItems.filter((_, i) => i !== idx));
  }

  function updateScheduleRow(idx: number, field: keyof ScheduleItem, value: string | number) {
    const updated = [...scheduleItems];
    if (field === "day_of_week") {
      updated[idx] = { ...updated[idx], day_of_week: value as number };
    } else {
      updated[idx] = { ...updated[idx], [field]: value as string };
    }
    setScheduleItems(updated);
  }

  async function saveSchedule() {
    if (!scheduleDoctor) return;
    setSavingSchedule(true);
    try {
      await api.put(`/scheduling/doctors/${scheduleDoctor.id}/schedule`, {
        schedules: scheduleItems,
      });
      setScheduleDoctor(null);
    } catch {
      alert("Erro ao salvar horários.");
    } finally {
      setSavingSchedule(false);
    }
  }

  async function openBlocks(doc: Doctor) {
    setBlocksDoctor(doc);
    setBlockForm({ starts_at: "", ends_at: "", reason: "" });
    try {
      const { data } = await api.get(`/scheduling/blocks?doctor_id=${doc.id}`);
      setBlocks(data);
    } catch {
      setBlocks([]);
    }
  }

  async function addBlock() {
    if (!blocksDoctor || !blockForm.starts_at || !blockForm.ends_at) return;
    setSavingBlock(true);
    try {
      await api.post("/scheduling/blocks", {
        doctor_id: blocksDoctor.id,
        starts_at: blockForm.starts_at,
        ends_at: blockForm.ends_at,
        reason: blockForm.reason || null,
      });
      setBlockForm({ starts_at: "", ends_at: "", reason: "" });
      const { data } = await api.get(`/scheduling/blocks?doctor_id=${blocksDoctor.id}`);
      setBlocks(data);
    } catch {
      alert("Erro ao criar bloqueio.");
    } finally {
      setSavingBlock(false);
    }
  }

  async function removeBlock(blockId: string) {
    if (!blocksDoctor) return;
    try {
      await api.delete(`/scheduling/blocks/${blockId}`);
      setBlocks(blocks.filter((b) => b.id !== blockId));
    } catch {
      alert("Erro ao remover bloqueio.");
    }
  }

  const specName = (id: string | null) => (id ? specialties.find((s) => s.id === id)?.name : null) || "—";

  if (loading) return <div className="p-8 text-parchment-faint">Carregando...</div>;

  return (
    <main className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-semibold text-parchment">Médicos</h1>
        <button
          onClick={showForm ? cancelForm : openCreate}
          className="bg-carimbo text-parchment px-4 py-2 rounded-sm text-sm font-medium hover:bg-carimbo-bright"
        >
          {showForm ? "Cancelar" : "Novo Médico"}
        </button>
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-ink-2/30 border border-line rounded-sm p-4 mb-6 space-y-3">
          <h3 className="text-sm font-semibold text-parchment-dim">
            {editingId ? "Editar Médico" : "Novo Médico"}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-mono text-[10px] tracking-[0.2em] uppercase text-parchment-dim mb-1">Nome completo</label>
              <input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                required
                className="w-full border border-line rounded-sm px-3 py-2 text-sm bg-ink text-parchment focus:border-carimbo focus:ring-1 focus:ring-carimbo"
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] tracking-[0.2em] uppercase text-parchment-dim mb-1">CRM</label>
              <input
                value={form.crm}
                onChange={(e) => setForm({ ...form, crm: e.target.value })}
                className="w-full border border-line rounded-sm px-3 py-2 text-sm bg-ink text-parchment focus:border-carimbo focus:ring-1 focus:ring-carimbo"
                placeholder="Opcional"
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] tracking-[0.2em] uppercase text-parchment-dim mb-1">Especialidade</label>
              <select
                value={form.specialty_id}
                onChange={(e) => setForm({ ...form, specialty_id: e.target.value })}
                className="w-full border border-line rounded-sm px-3 py-2 text-sm bg-ink text-parchment focus:border-carimbo focus:ring-1 focus:ring-carimbo"
              >
                <option value="">Sem especialidade</option>
                {specialties.filter((s) => s.is_active).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-mono text-[10px] tracking-[0.2em] uppercase text-parchment-dim mb-1">Duração do slot (min)</label>
              <input
                type="number"
                value={form.slot_duration_minutes}
                onChange={(e) => setForm({ ...form, slot_duration_minutes: Number(e.target.value) })}
                min={10}
                max={120}
                className="w-full border border-line rounded-sm px-3 py-2 text-sm bg-ink text-parchment focus:border-carimbo focus:ring-1 focus:ring-carimbo"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-carimbo text-parchment px-4 py-2 rounded-sm text-sm font-medium hover:bg-carimbo-bright disabled:opacity-50"
            >
              {saving ? "Salvando..." : editingId ? "Salvar" : "Criar"}
            </button>
            <button type="button" onClick={cancelForm} className="text-sm text-parchment-dim px-4 py-2">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Schedule Modal */}
      {scheduleDoctor && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-ink-2 rounded-sm p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto border border-line">
            <h2 className="text-lg font-display font-semibold text-parchment mb-1">
              Horários — {scheduleDoctor.full_name}
            </h2>
            <p className="text-sm text-parchment-dim mb-4">Configure os horários de atendimento recorrentes.</p>

            {scheduleItems.length === 0 ? (
              <p className="text-sm text-parchment-faint mb-4">Nenhum horário cadastrado.</p>
            ) : (
              <div className="space-y-2 mb-4">
                {scheduleItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      value={item.day_of_week}
                      onChange={(e) => updateScheduleRow(idx, "day_of_week", Number(e.target.value))}
                      className="border border-line rounded-sm px-2 py-1.5 text-sm flex-1 bg-ink text-parchment focus:border-carimbo focus:ring-1 focus:ring-carimbo"
                    >
                      {DAYS.map((d, i) => (
                        <option key={i} value={i}>{d}</option>
                      ))}
                    </select>
                    <input
                      type="time"
                      value={item.start_time}
                      onChange={(e) => updateScheduleRow(idx, "start_time", e.target.value)}
                      className="border border-line rounded-sm px-2 py-1.5 text-sm bg-ink text-parchment focus:border-carimbo focus:ring-1 focus:ring-carimbo"
                    />
                    <span className="text-parchment-faint">—</span>
                    <input
                      type="time"
                      value={item.end_time}
                      onChange={(e) => updateScheduleRow(idx, "end_time", e.target.value)}
                      className="border border-line rounded-sm px-2 py-1.5 text-sm bg-ink text-parchment focus:border-carimbo focus:ring-1 focus:ring-carimbo"
                    />
                    <button
                      onClick={() => removeScheduleRow(idx)}
                      className="text-carimbo-bright hover:text-carimbo text-sm px-1"
                    >
                      X
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button onClick={addScheduleRow} className="text-sm text-carimbo hover:underline mb-4 block">
              + Adicionar horário
            </button>

            <div className="flex gap-2 justify-end border-t border-line pt-4">
              <button
                onClick={() => setScheduleDoctor(null)}
                className="text-sm text-parchment-dim px-4 py-2"
              >
                Cancelar
              </button>
              <button
                onClick={saveSchedule}
                disabled={savingSchedule}
                className="bg-carimbo text-parchment px-4 py-2 rounded-sm text-sm font-medium hover:bg-carimbo-bright disabled:opacity-50"
              >
                {savingSchedule ? "Salvando..." : "Salvar Horários"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Blocks Modal */}
      {blocksDoctor && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-ink-2 rounded-sm p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto border border-line">
            <h2 className="text-lg font-display font-semibold text-parchment mb-1">
              Bloqueios — {blocksDoctor.full_name}
            </h2>
            <p className="text-sm text-parchment-dim mb-4">
              Férias, reuniões, feriados ou qualquer período em que o médico não atende.
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
                    <button
                      onClick={() => removeBlock(block.id)}
                      className="text-carimbo-bright hover:text-carimbo text-sm px-2"
                    >
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add block form */}
            <div className="border-t border-line pt-4 mb-4">
              <h3 className="text-sm font-semibold text-parchment-dim mb-2">Novo Bloqueio</h3>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <label className="block text-xs text-parchment-dim mb-1">Início</label>
                  <input
                    type="datetime-local"
                    value={blockForm.starts_at}
                    onChange={(e) => setBlockForm({ ...blockForm, starts_at: e.target.value })}
                    className="w-full border border-line rounded-sm px-2 py-1.5 text-sm bg-ink text-parchment focus:border-carimbo focus:ring-1 focus:ring-carimbo"
                  />
                </div>
                <div>
                  <label className="block text-xs text-parchment-dim mb-1">Fim</label>
                  <input
                    type="datetime-local"
                    value={blockForm.ends_at}
                    onChange={(e) => setBlockForm({ ...blockForm, ends_at: e.target.value })}
                    className="w-full border border-line rounded-sm px-2 py-1.5 text-sm bg-ink text-parchment focus:border-carimbo focus:ring-1 focus:ring-carimbo"
                  />
                </div>
              </div>
              <input
                value={blockForm.reason}
                onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })}
                placeholder="Motivo (opcional)"
                className="w-full border border-line rounded-sm px-2 py-1.5 text-sm bg-ink text-parchment mb-2 focus:border-carimbo focus:ring-1 focus:ring-carimbo"
              />
              <button
                onClick={addBlock}
                disabled={savingBlock || !blockForm.starts_at || !blockForm.ends_at}
                className="bg-carimbo text-parchment px-3 py-1.5 rounded-sm text-sm font-medium hover:bg-carimbo-bright disabled:opacity-50"
              >
                {savingBlock ? "Salvando..." : "Adicionar Bloqueio"}
              </button>
            </div>

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
      <div className="bg-ink-2/30 border border-line rounded-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ink-2 border-b border-line">
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
                        doc.is_active ? "bg-jade/15 text-jade" : "bg-ink-3 text-parchment-faint"
                      }`}
                    >
                      {doc.is_active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      <button onClick={() => openEdit(doc)} className="text-xs text-carimbo hover:underline">
                        Editar
                      </button>
                      <button onClick={() => openSchedule(doc)} className="text-xs text-info hover:underline">
                        Horários
                      </button>
                      <button onClick={() => openBlocks(doc)} className="text-xs text-carimbo-bright hover:underline">
                        Bloqueios
                      </button>
                      <button onClick={() => toggleActive(doc)} className="text-xs text-selo hover:underline">
                        {doc.is_active ? "Desativar" : "Ativar"}
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
