"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { User, Specialty, Doctor, Lead, PipelineStageMetric } from "@/types";

interface DashboardData {
  users: User[];
  specialties: Specialty[];
  doctors: Doctor[];
  leads: Lead[];
  sla: { total: number; within_sla: number; overdue: number; sla_rate: number } | null;
  pipeline: PipelineStageMetric[];
}

export default function AdminPage() {
  const [data, setData] = useState<DashboardData>({
    users: [], specialties: [], doctors: [], leads: [], sla: null, pipeline: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAll() {
      try {
        const [usersRes, specsRes, docsRes, leadsRes, slaRes, pipeRes] = await Promise.allSettled([
          api.get("/auth/users"),
          api.get("/specialties/"),
          api.get("/scheduling/doctors"),
          api.get("/leads/"),
          api.get("/leads/reports/sla?period=30d"),
          api.get("/leads/reports/pipeline?period=30d"),
        ]);

        setData({
          users: usersRes.status === "fulfilled" ? usersRes.value.data : [],
          specialties: specsRes.status === "fulfilled" ? specsRes.value.data : [],
          doctors: docsRes.status === "fulfilled" ? docsRes.value.data : [],
          leads: leadsRes.status === "fulfilled" ? leadsRes.value.data : [],
          sla: slaRes.status === "fulfilled" ? slaRes.value.data : null,
          pipeline: pipeRes.status === "fulfilled" ? pipeRes.value.data : [],
        });
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  if (loading) {
    return <div className="p-8 text-gray-400">Carregando painel...</div>;
  }

  const overdueLeads = data.leads.filter((l) => l.is_overdue);
  const newLeads = data.leads.filter((l) => l.status === "novo");

  const totalConverted = data.pipeline.find((p) => p.status === "convertido")?.total || 0;
  const totalPipeline = data.pipeline.reduce((acc, p) => acc + p.total, 0);
  const conversionRate = totalPipeline > 0 ? ((totalConverted / totalPipeline) * 100).toFixed(1) : "0";

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Painel Administrativo</h1>

      {/* Cards resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card title="Usuários" value={data.users.length} subtitle={`${data.users.filter(u => u.is_active).length} ativos`} href="/admin/users" />
        <Card title="Especialidades" value={data.specialties.length} href="/admin/specialties" />
        <Card title="Médicos" value={data.doctors.length} subtitle={`${data.doctors.filter(d => d.is_active).length} ativos`} href="/admin/doctors" />
        <Card title="Leads" value={data.leads.length} subtitle={`${newLeads.length} novos`} href="/admin/leads" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* SLA */}
        {data.sla && (
          <div className="bg-white border rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">SLA de Leads (30 dias)</h2>
            <div className="grid grid-cols-2 gap-4">
              <Stat label="Total" value={data.sla.total} />
              <Stat label="Taxa SLA" value={`${data.sla.sla_rate}%`} color={data.sla.sla_rate >= 80 ? "text-green-600" : "text-red-600"} />
              <Stat label="Dentro do SLA" value={data.sla.within_sla} color="text-green-600" />
              <Stat label="Vencidos" value={data.sla.overdue} color="text-red-600" />
            </div>
          </div>
        )}

        {/* Funil de Vendas */}
        {data.pipeline.length > 0 && (
          <div className="bg-white border rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Performance do Funil (30 dias)</h2>
            <div className="grid grid-cols-2 gap-4">
              <Stat label="Total Recebido" value={totalPipeline} />
              <Stat label="Taxa de Conversão" value={`${conversionRate}%`} color="text-blue-600" />
              <Stat label="Novos (Não Tratados)" value={data.pipeline.find(p => p.status === "novo")?.total || 0} color="text-orange-500" />
              <Stat label="Convertidos" value={totalConverted} color="text-green-600" />
            </div>
          </div>
        )}
      </div>

      {/* Leads vencidos */}
      {overdueLeads.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-red-700 mb-3">
            Leads com SLA vencido ({overdueLeads.length})
          </h2>
          <div className="space-y-1">
            {overdueLeads.slice(0, 10).map((lead) => (
              <Link 
                href={`/admin/leads/${lead.id}`} 
                key={lead.id} 
                className="flex items-center justify-between text-sm hover:bg-red-100 p-2 rounded-lg transition-colors -mx-2"
              >
                <span className="text-gray-900 font-medium">{lead.full_name || lead.phone}</span>
                <span className="text-red-600 text-xs bg-red-100 px-2 py-0.5 rounded-full">{lead.channel}</span>
              </Link>
            ))}
          </div>
          {overdueLeads.length > 10 && (
            <Link href="/admin/leads?is_overdue=true" className="text-sm text-red-600 hover:underline mt-4 block">
              Ver todos os vencidos &rarr;
            </Link>
          )}
        </div>
      )}
    </main>
  );
}

function Card({ title, value, subtitle, href }: { title: string; value: number; subtitle?: string; href?: string }) {
  const content = (
    <div className={`bg-white border rounded-lg p-4 h-full ${href ? "hover:ring-2 hover:ring-blue-500 hover:shadow-md transition-all cursor-pointer" : ""}`}>
      <p className="text-sm text-gray-500">{title}</p>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
    </div>
  );

  if (href) {
    return <Link href={href} className="block">{content}</Link>;
  }
  return content;
}

function Stat({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div>
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-2xl font-bold ${color || "text-gray-900"}`}>{value}</p>
    </div>
  );
}
