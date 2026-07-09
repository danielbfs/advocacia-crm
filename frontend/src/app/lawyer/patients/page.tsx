"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface Client {
  id: string;
  full_name: string | null;
  phone: string;
  email: string | null;
  notes: string | null;
}

interface ClientEntry {
  client: Client;
  lastAppt: string;
  totalAppts: number;
}

export default function LawyerClientsPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<ClientEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!user?.lawyer_id) return;
    loadClients();
  }, [user?.lawyer_id]);

  async function loadClients() {
    if (!user?.lawyer_id) return;
    setLoading(true);
    try {
      const { data: consultations } = await api.get(
        `/scheduling/consultations?lawyer_id=${user.lawyer_id}`
      );

      const map: Record<string, { lastAppt: string; count: number }> = {};
      for (const a of consultations) {
        if (!map[a.client_id] || a.starts_at > map[a.client_id].lastAppt) {
          map[a.client_id] = {
            lastAppt: a.starts_at,
            count: (map[a.client_id]?.count ?? 0) + 1,
          };
        } else {
          map[a.client_id].count++;
        }
      }

      const clientIds = Object.keys(map);
      const fetched: ClientEntry[] = [];
      await Promise.all(
        clientIds.map(async (id) => {
          try {
            const { data: p } = await api.get(`/clients/${id}`);
            fetched.push({ client: p, lastAppt: map[id].lastAppt, totalAppts: map[id].count });
          } catch { /* ignore */ }
        })
      );

      fetched.sort((a, b) => b.lastAppt.localeCompare(a.lastAppt));
      setEntries(fetched);
    } finally {
      setLoading(false);
    }
  }

  const filtered = entries.filter((e) => {
    const q = search.toLowerCase();
    const name = (e.client.full_name || "").toLowerCase();
    return name.includes(q) || e.client.phone.includes(q);
  });

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
    <main className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-semibold text-parchment">Meus Clientes</h1>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou telefone..."
          className="border border-line bg-ink/60 rounded-sm px-3 py-2 text-sm w-64 text-parchment placeholder:text-parchment-faint focus:outline-none focus:border-carimbo focus:ring-1 focus:ring-carimbo"
        />
      </div>

      {loading ? (
        <p className="text-parchment-faint">Carregando...</p>
      ) : filtered.length === 0 ? (
        <div className="bg-ink-2 border border-line rounded-sm p-8 text-center text-parchment-faint">
          {search ? "Nenhum resultado encontrado." : "Nenhum cliente com consulta registrada."}
        </div>
      ) : (
        <div className="bg-ink-2 border border-line rounded-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ink border-b border-line">
              <tr>
                <th className="text-left p-4 font-medium text-parchment-dim">Cliente</th>
                <th className="text-left p-4 font-medium text-parchment-dim">Telefone</th>
                <th className="text-left p-4 font-medium text-parchment-dim">E-mail</th>
                <th className="text-left p-4 font-medium text-parchment-dim">Consultas</th>
                <th className="text-left p-4 font-medium text-parchment-dim">Última consulta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map(({ client, lastAppt, totalAppts }) => (
                <tr key={client.id} className="hover:bg-ink-3">
                  <td className="p-4 font-medium text-parchment">
                    {client.full_name || <span className="text-parchment-faint italic">Sem nome</span>}
                  </td>
                  <td className="p-4 text-parchment-dim">{client.phone}</td>
                  <td className="p-4 text-parchment-dim">{client.email || "—"}</td>
                  <td className="p-4 text-parchment-dim">{totalAppts}</td>
                  <td className="p-4 text-parchment-dim">
                    {new Date(lastAppt).toLocaleDateString("pt-BR")}
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
