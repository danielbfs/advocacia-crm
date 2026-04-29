"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

interface Patient {
  id: string;
  full_name: string | null;
  phone: string;
  email: string | null;
  channel: string;
  crm_status: string;
  created_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  new: "Novo",
  qualified: "Qualificado",
  scheduled: "Agendado",
  completed: "Atendido",
  no_show: "Não compareceu",
};

export default function PatientsPage({ basePath = "/secretary/patients" }: { basePath?: string }) {
  const router = useRouter();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchPatients();
  }, []);

  async function fetchPatients() {
    setLoading(true);
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : "";
      const { data } = await api.get(`/patients/${params}`);
      setPatients(data);
    } catch {
      setPatients([]);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    fetchPatients();
  }

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Pacientes</h1>

      <form onSubmit={handleSearch} className="flex gap-2 mb-6">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, telefone ou email..."
          className="flex-1 border rounded-lg px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          Buscar
        </button>
        {search && (
          <button
            type="button"
            onClick={() => { setSearch(""); setTimeout(fetchPatients, 0); }}
            className="text-sm text-gray-500 px-3"
          >
            Limpar
          </button>
        )}
      </form>

      {loading ? (
        <p className="text-gray-400">Carregando...</p>
      ) : patients.length === 0 ? (
        <p className="text-gray-400">Nenhum paciente encontrado.</p>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Nome</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Telefone</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Canal</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Status</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Cadastro</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {patients.map((p) => (
                <tr
                  key={p.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => router.push(`${basePath}/${p.id}`)}
                >
                  <td className="px-4 py-3 font-medium text-gray-900">{p.full_name || "—"}</td>
                  <td className="px-4 py-3 text-gray-500">{p.phone}</td>
                  <td className="px-4 py-3 text-gray-500">{p.channel}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-700">
                      {STATUS_LABELS[p.crm_status] || p.crm_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(p.created_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`${basePath}/${p.id}`);
                      }}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Detalhes
                    </button>
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
