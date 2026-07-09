"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { PracticeArea } from "@/types";

export default function PracticeAreasPage() {
  const [practiceAreas, setPracticeAreas] = useState<PracticeArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchPracticeAreas();
  }, []);

  async function fetchPracticeAreas() {
    try {
      const { data } = await api.get("/practice-areas/");
      setPracticeAreas(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditingId(null);
    setForm({ name: "", description: "" });
    setShowForm(true);
  }

  function openEdit(spec: PracticeArea) {
    setEditingId(spec.id);
    setForm({ name: spec.name, description: spec.description || "" });
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm({ name: "", description: "" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await api.patch(`/practice-areas/${editingId}`, {
          name: form.name,
          description: form.description || null,
        });
      } else {
        await api.post("/practice-areas/", {
          name: form.name,
          description: form.description || null,
        });
      }
      cancelForm();
      fetchPracticeAreas();
    } catch {
      alert("Erro ao salvar área de atuação.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(spec: PracticeArea) {
    try {
      await api.patch(`/practice-areas/${spec.id}`, { is_active: !spec.is_active });
      fetchPracticeAreas();
    } catch {
      // ignore
    }
  }

  async function handleDelete(spec: PracticeArea) {
    if (!confirm(`Deseja excluir a área de atuação "${spec.name}"?`)) return;
    try {
      await api.delete(`/practice-areas/${spec.id}`);
      fetchPracticeAreas();
    } catch {
      alert("Erro ao excluir. Pode haver advogados vinculados.");
    }
  }

  if (loading) return <div className="p-8 text-parchment-faint">Carregando...</div>;

  return (
    <main className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-semibold text-parchment">Áreas de Atuação</h1>
        <button
          onClick={showForm ? cancelForm : openCreate}
          className="bg-carimbo text-parchment px-4 py-2 rounded-sm text-sm font-medium hover:bg-carimbo-bright"
        >
          {showForm ? "Cancelar" : "Nova Área de Atuação"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-ink-2 border border-line rounded-sm p-4 mb-6 space-y-3">
          <h3 className="text-sm font-semibold text-parchment-dim">
            {editingId ? "Editar Área de Atuação" : "Nova Área de Atuação"}
          </h3>
          <div>
            <label className="block text-sm font-medium text-parchment-dim mb-1">Nome</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              className="w-full rounded-sm border border-line bg-ink-2 px-3 py-2 text-sm text-parchment focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
              placeholder="Ex: Direito Tributário"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-parchment-dim mb-1">Descrição</label>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-sm border border-line bg-ink-2 px-3 py-2 text-sm text-parchment focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
              placeholder="Opcional"
            />
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

      <div className="bg-ink-2 border border-line rounded-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ink-3 border-b border-line">
            <tr>
              <th className="text-left px-4 py-3 text-parchment-dim font-medium">Nome</th>
              <th className="text-left px-4 py-3 text-parchment-dim font-medium">Descrição</th>
              <th className="text-left px-4 py-3 text-parchment-dim font-medium">Status</th>
              <th className="text-left px-4 py-3 text-parchment-dim font-medium">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {practiceAreas.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-parchment-faint">
                  Nenhuma área de atuação cadastrada.
                </td>
              </tr>
            ) : (
              practiceAreas.map((spec) => (
                <tr key={spec.id} className="hover:bg-ink-3">
                  <td className="px-4 py-3 font-medium text-parchment">{spec.name}</td>
                  <td className="px-4 py-3 text-parchment-dim">{spec.description || "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        spec.is_active ? "bg-jade/15 text-jade" : "bg-ink-3 text-parchment-faint"
                      }`}
                    >
                      {spec.is_active ? "Ativa" : "Inativa"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      <button onClick={() => openEdit(spec)} className="text-xs text-carimbo hover:underline">
                        Editar
                      </button>
                      <button onClick={() => toggleActive(spec)} className="text-xs text-selo hover:underline">
                        {spec.is_active ? "Desativar" : "Ativar"}
                      </button>
                      <button onClick={() => handleDelete(spec)} className="text-xs text-carimbo-bright hover:underline">
                        Excluir
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
