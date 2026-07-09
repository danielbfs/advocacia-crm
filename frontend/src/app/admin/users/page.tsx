"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Lawyer, User } from "@/types";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  secretary: "Comercial",
  lawyer: "Advogado",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-carimbo/10 text-carimbo-bright",
  secretary: "bg-info/15 text-info",
  lawyer: "bg-jade/15 text-jade",
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    username: "",
    full_name: "",
    password: "",
    role: "secretary" as string,
    lawyer_id: "" as string,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchUsers();
    api.get("/scheduling/lawyers?active_only=false").then(({ data }) => setLawyers(data)).catch(() => {});
  }, []);

  async function fetchUsers() {
    try {
      const { data } = await api.get("/auth/users");
      setUsers(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditingId(null);
    setForm({ username: "", full_name: "", password: "", role: "secretary", lawyer_id: "" });
    setShowForm(true);
  }

  function openEdit(user: User) {
    setEditingId(user.id);
    setForm({
      username: user.username,
      full_name: user.full_name,
      password: "",
      role: user.role,
      lawyer_id: user.lawyer_id || "",
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
      const lawyer_id = form.role === "lawyer" && form.lawyer_id ? form.lawyer_id : null;

      if (editingId) {
        const payload: Record<string, unknown> = {
          username: form.username,
          full_name: form.full_name,
          role: form.role,
          lawyer_id,
        };
        await api.patch(`/auth/users/${editingId}`, payload);
      } else {
        if (!form.password) { alert("Senha é obrigatória para novo usuário."); setSaving(false); return; }
        await api.post("/auth/users", {
          username: form.username,
          full_name: form.full_name,
          password: form.password,
          role: form.role,
          lawyer_id,
        });
      }
      cancelForm();
      fetchUsers();
    } catch {
      alert("Erro ao salvar usuário.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(user: User) {
    try { await api.patch(`/auth/users/${user.id}`, { is_active: !user.is_active }); fetchUsers(); }
    catch { /* ignore */ }
  }

  async function resetPassword(user: User) {
    if (!confirm(`Resetar a senha de "${user.full_name}" para o padrão?`)) return;
    try {
      const { data } = await api.post(`/auth/users/${user.id}/reset-password`);
      alert(data.message);
    } catch { alert("Erro ao resetar senha."); }
  }

  function lawyerName(lawyerId: string | null) {
    if (!lawyerId) return null;
    return lawyers.find((d) => d.id === lawyerId)?.full_name || null;
  }

  if (loading) return <div className="p-8 text-parchment-faint">Carregando...</div>;

  return (
    <main className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-semibold text-parchment">Usuários do Sistema</h1>
        <button
          onClick={showForm ? cancelForm : openCreate}
          className="bg-carimbo text-parchment px-4 py-2 rounded-sm text-sm font-medium hover:bg-carimbo-bright"
        >
          {showForm ? "Cancelar" : "Novo Usuário"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-ink-2 border border-line rounded-sm p-4 mb-6 space-y-3">
          <h3 className="text-sm font-semibold text-parchment-dim">
            {editingId ? "Editar Usuário" : "Novo Usuário"}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-parchment-dim mb-1">Login (username)</label>
              <input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
                className="w-full rounded-sm border border-line bg-ink-2 px-3 py-2 text-sm text-parchment focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-parchment-dim mb-1">Nome completo</label>
              <input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                required
                className="w-full rounded-sm border border-line bg-ink-2 px-3 py-2 text-sm text-parchment focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
              />
            </div>
            {!editingId && (
              <div>
                <label className="block text-xs text-parchment-dim mb-1">Senha</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required={!editingId}
                  className="w-full rounded-sm border border-line bg-ink-2 px-3 py-2 text-sm text-parchment placeholder:text-parchment-faint focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
                  placeholder="Mín. 6 caracteres"
                />
              </div>
            )}
            <div>
              <label className="block text-xs text-parchment-dim mb-1">Perfil</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value, lawyer_id: "" })}
                className="w-full rounded-sm border border-line bg-ink-2 px-3 py-2 text-sm text-parchment focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
              >
                <option value="admin">Administrador</option>
                <option value="secretary">Comercial</option>
                <option value="lawyer">Advogado</option>
              </select>
            </div>
            {form.role === "lawyer" && (
              <div className="col-span-2">
                <label className="block text-xs text-parchment-dim mb-1">Advogado vinculado</label>
                <select
                  value={form.lawyer_id}
                  onChange={(e) => setForm({ ...form, lawyer_id: e.target.value })}
                  className="w-full rounded-sm border border-line bg-ink-2 px-3 py-2 text-sm text-parchment focus:border-carimbo focus:ring-1 focus:ring-carimbo focus:outline-none"
                >
                  <option value="">— Nenhum —</option>
                  {lawyers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.full_name}{d.oab ? ` (${d.oab})` : ""}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-parchment-faint mt-1">
                  Vincule a um advogado para dar acesso ao portal do advogado.
                </p>
              </div>
            )}
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
              <th className="text-left px-4 py-3 text-parchment-dim font-medium">Login</th>
              <th className="text-left px-4 py-3 text-parchment-dim font-medium">Nome</th>
              <th className="text-left px-4 py-3 text-parchment-dim font-medium">Perfil</th>
              <th className="text-left px-4 py-3 text-parchment-dim font-medium">Advogado</th>
              <th className="text-left px-4 py-3 text-parchment-dim font-medium">Status</th>
              <th className="text-left px-4 py-3 text-parchment-dim font-medium">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-ink-3">
                <td className="px-4 py-3 font-medium text-parchment">{user.username}</td>
                <td className="px-4 py-3 text-parchment-dim">{user.full_name}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[user.role] || "bg-ink-3 text-parchment-dim"}`}>
                    {ROLE_LABELS[user.role] || user.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-parchment-dim text-xs">
                  {lawyerName(user.lawyer_id) || "—"}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${user.is_active ? "bg-jade/15 text-jade" : "bg-ink-3 text-parchment-faint"}`}>
                    {user.is_active ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-3">
                    <button onClick={() => openEdit(user)} className="text-xs text-carimbo hover:underline">Editar</button>
                    <button onClick={() => resetPassword(user)} className="text-xs text-selo hover:underline">Reset Senha</button>
                    <button onClick={() => toggleActive(user)} className="text-xs text-selo hover:underline">
                      {user.is_active ? "Desativar" : "Ativar"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
