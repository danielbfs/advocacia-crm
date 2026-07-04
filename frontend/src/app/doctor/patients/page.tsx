"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface Patient {
  id: string;
  full_name: string | null;
  phone: string;
  email: string | null;
  notes: string | null;
}

interface PatientEntry {
  patient: Patient;
  lastAppt: string;
  totalAppts: number;
}

export default function DoctorPatientsPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<PatientEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!user?.doctor_id) return;
    loadPatients();
  }, [user?.doctor_id]);

  async function loadPatients() {
    if (!user?.doctor_id) return;
    setLoading(true);
    try {
      const { data: appointments } = await api.get(
        `/scheduling/appointments?doctor_id=${user.doctor_id}`
      );

      const map: Record<string, { lastAppt: string; count: number }> = {};
      for (const a of appointments) {
        if (!map[a.patient_id] || a.starts_at > map[a.patient_id].lastAppt) {
          map[a.patient_id] = {
            lastAppt: a.starts_at,
            count: (map[a.patient_id]?.count ?? 0) + 1,
          };
        } else {
          map[a.patient_id].count++;
        }
      }

      const patientIds = Object.keys(map);
      const fetched: PatientEntry[] = [];
      await Promise.all(
        patientIds.map(async (id) => {
          try {
            const { data: p } = await api.get(`/patients/${id}`);
            fetched.push({ patient: p, lastAppt: map[id].lastAppt, totalAppts: map[id].count });
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
    const name = (e.patient.full_name || "").toLowerCase();
    return name.includes(q) || e.patient.phone.includes(q);
  });

  if (!user?.doctor_id) {
    return (
      <main className="p-8">
        <div className="bg-selo/15 border border-line rounded-sm p-6 text-selo">
          Seu usuário não está vinculado a nenhum médico. Contate o administrador.
        </div>
      </main>
    );
  }

  return (
    <main className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-semibold text-parchment">Meus Pacientes</h1>
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
          {search ? "Nenhum resultado encontrado." : "Nenhum paciente com consulta registrada."}
        </div>
      ) : (
        <div className="bg-ink-2 border border-line rounded-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ink border-b border-line">
              <tr>
                <th className="text-left p-4 font-medium text-parchment-dim">Paciente</th>
                <th className="text-left p-4 font-medium text-parchment-dim">Telefone</th>
                <th className="text-left p-4 font-medium text-parchment-dim">E-mail</th>
                <th className="text-left p-4 font-medium text-parchment-dim">Consultas</th>
                <th className="text-left p-4 font-medium text-parchment-dim">Última consulta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map(({ patient, lastAppt, totalAppts }) => (
                <tr key={patient.id} className="hover:bg-ink-3">
                  <td className="p-4 font-medium text-parchment">
                    {patient.full_name || <span className="text-parchment-faint italic">Sem nome</span>}
                  </td>
                  <td className="p-4 text-parchment-dim">{patient.phone}</td>
                  <td className="p-4 text-parchment-dim">{patient.email || "—"}</td>
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
