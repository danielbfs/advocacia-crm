"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { User, Specialty, Doctor, Lead, PipelineStageMetric } from "@/types";
import { Users, Activity, Stethoscope, Users as LeadsIcon, AlertCircle, TrendingUp, CheckCircle, Clock } from "lucide-react";

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
    <main className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Painel Administrativo</h1>
          <p className="text-gray-500 mt-1">Resumo geral das métricas da clínica</p>
        </div>
      </div>

      {/* Cards resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card title="Usuários" value={data.users.length} subtitle={`${data.users.filter(u => u.is_active).length} ativos`} href="/admin/users" icon={<Users className="text-primary-500" size={24} />} />
        <Card title="Especialidades" value={data.specialties.length} href="/admin/specialties" icon={<Activity className="text-accent-500" size={24} />} />
        <Card title="Médicos" value={data.doctors.length} subtitle={`${data.doctors.filter(d => d.is_active).length} ativos`} href="/admin/doctors" icon={<Stethoscope className="text-purple-500" size={24} />} />
        <Card title="Leads" value={data.leads.length} subtitle={`${newLeads.length} novos`} href="/admin/leads" icon={<LeadsIcon className="text-orange-500" size={24} />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Lado Esquerdo Maior */}
        <div className="lg:col-span-8 space-y-8">
          {/* Funil de Vendas */}
          {data.pipeline.length > 0 && (
            <div className="bg-white rounded-2xl p-6 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-gray-100">
              <div className="flex items-center gap-2 mb-6">
                <div className="p-2 bg-blue-50 rounded-lg"><TrendingUp className="text-primary-600" size={20} /></div>
                <h2 className="text-lg font-bold text-gray-900">Performance do Funil (30 dias)</h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                <Stat label="Total Recebido" value={totalPipeline} />
                <Stat label="Conversão" value={`${conversionRate}%`} color="text-primary-600" />
                <Stat label="Novos" value={data.pipeline.find(p => p.status === "novo")?.total || 0} color="text-orange-500" />
                <Stat label="Convertidos" value={totalConverted} color="text-accent-600" />
              </div>
            </div>
          )}

          {/* Leads vencidos */}
          {overdueLeads.length > 0 && (
            <div className="bg-white rounded-2xl p-6 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-red-100">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-red-50 rounded-lg"><AlertCircle className="text-red-500" size={20} /></div>
                  <h2 className="text-lg font-bold text-gray-900">Atenção Imediata</h2>
                </div>
                <span className="bg-red-100 text-red-700 py-1 px-3 rounded-full text-xs font-bold">{overdueLeads.length} Vencidos</span>
              </div>
              
              <div className="space-y-2 mt-4">
                {overdueLeads.slice(0, 5).map((lead) => (
                  <Link 
                    href={`/admin/leads/${lead.id}`} 
                    key={lead.id} 
                    className="flex items-center justify-between text-sm hover:bg-gray-50 p-3 rounded-xl transition-colors border border-gray-50"
                  >
                    <span className="text-gray-900 font-medium">{lead.full_name || lead.phone}</span>
                    <span className="text-gray-500 text-xs bg-gray-100 px-3 py-1 rounded-full">{lead.channel}</span>
                  </Link>
                ))}
              </div>
              {overdueLeads.length > 5 && (
                <Link href="/admin/leads?is_overdue=true" className="text-sm text-primary-600 font-medium hover:text-primary-700 mt-4 inline-block">
                  Ver todos os vencidos &rarr;
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Lado Direito Menor */}
        <div className="lg:col-span-4 space-y-8">
          {/* SLA */}
          {data.sla && (
            <div className="bg-white rounded-2xl p-6 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-gray-100 h-full">
              <div className="flex items-center gap-2 mb-6">
                <div className="p-2 bg-green-50 rounded-lg"><Clock className="text-accent-600" size={20} /></div>
                <h2 className="text-lg font-bold text-gray-900">SLA de Atendimento</h2>
              </div>
              
              <div className="flex items-center justify-center py-6">
                <div className="relative">
                  <svg className="w-32 h-32 transform -rotate-90">
                    <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-gray-100" />
                    <circle 
                      cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="12" fill="transparent" 
                      className={data.sla.sla_rate >= 80 ? "text-accent-500" : "text-red-500"} 
                      strokeDasharray={351.858} 
                      strokeDashoffset={351.858 - (351.858 * data.sla.sla_rate) / 100}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold text-gray-900">{data.sla.sla_rate.toFixed(0)}%</span>
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div className="text-center p-3 bg-gray-50 rounded-xl">
                  <p className="text-xs text-gray-500 mb-1">No prazo</p>
                  <p className="font-bold text-accent-600">{data.sla.within_sla}</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-xl">
                  <p className="text-xs text-gray-500 mb-1">Vencidos</p>
                  <p className="font-bold text-red-500">{data.sla.overdue}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function Card({ title, value, subtitle, href, icon }: { title: string; value: number; subtitle?: string; href?: string; icon?: React.ReactNode }) {
  const content = (
    <div className={`bg-white rounded-2xl p-6 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-gray-100 h-full flex flex-col ${href ? "hover:border-primary-200 hover:shadow-md transition-all cursor-pointer group" : ""}`}>
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-xl bg-gray-50 ${href ? 'group-hover:bg-primary-50 transition-colors' : ''}`}>
          {icon}
        </div>
      </div>
      <div>
        <p className="text-3xl font-bold text-gray-900 mb-1">{value}</p>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        {subtitle && <p className="text-xs text-gray-400 mt-2">{subtitle}</p>}
      </div>
    </div>
  );

  if (href) {
    return <Link href={href} className="block">{content}</Link>;
  }
  return content;
}

function Stat({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="flex flex-col">
      <p className="text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold ${color || "text-gray-900"}`}>{value}</p>
    </div>
  );
}
