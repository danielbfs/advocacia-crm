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
    return <div className="p-8 text-parchment-faint">Carregando painel...</div>;
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
          <h1 className="text-3xl font-display font-semibold text-parchment tracking-tight">Painel Administrativo</h1>
          <p className="text-parchment-dim mt-1">Resumo geral das métricas do escritório</p>
        </div>
      </div>

      {/* Cards resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card title="Usuários" value={data.users.length} subtitle={`${data.users.filter(u => u.is_active).length} ativos`} href="/admin/users" icon={<Users className="text-carimbo" size={24} />} />
        <Card title="Áreas de Atuação" value={data.specialties.length} href="/admin/specialties" icon={<Activity className="text-jade" size={24} />} />
        <Card title="Advogados" value={data.doctors.length} subtitle={`${data.doctors.filter(d => d.is_active).length} ativos`} href="/admin/doctors" icon={<Stethoscope className="text-selo" size={24} />} />
        <Card title="Leads" value={data.leads.length} subtitle={`${newLeads.length} novos`} href="/admin/leads" icon={<LeadsIcon className="text-info" size={24} />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Lado Esquerdo Maior */}
        <div className="lg:col-span-8 space-y-8">
          {/* Funil de Vendas */}
          {data.pipeline.length > 0 && (
            <div className="bg-ink-2/30 rounded-sm p-6 border border-line">
              <div className="flex items-center gap-2 mb-6">
                <div className="p-2 bg-selo/10 rounded-sm"><TrendingUp className="text-selo" size={20} /></div>
                <h2 className="text-lg font-display font-semibold text-parchment">Performance do Funil (30 dias)</h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                <Stat label="Total Recebido" value={totalPipeline} />
                <Stat label="Conversão" value={`${conversionRate}%`} color="text-selo" />
                <Stat label="Novos" value={data.pipeline.find(p => p.status === "novo")?.total || 0} color="text-info" />
                <Stat label="Convertidos" value={totalConverted} color="text-jade" />
              </div>
            </div>
          )}

          {/* Leads vencidos */}
          {overdueLeads.length > 0 && (
            <div className="bg-ink-2/30 rounded-sm p-6 border border-carimbo/30">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-carimbo/10 rounded-sm"><AlertCircle className="text-carimbo-bright" size={20} /></div>
                  <h2 className="text-lg font-display font-semibold text-parchment">Atenção Imediata</h2>
                </div>
                <span className="bg-carimbo/10 text-carimbo-bright py-1 px-3 rounded-full text-xs font-bold">{overdueLeads.length} Vencidos</span>
              </div>

              <div className="space-y-2 mt-4">
                {overdueLeads.slice(0, 5).map((lead) => (
                  <Link
                    href={`/admin/leads/${lead.id}`}
                    key={lead.id}
                    className="flex items-center justify-between text-sm hover:bg-ink-3 p-3 rounded-sm transition-colors border border-line"
                  >
                    <span className="text-parchment font-medium">{lead.full_name || lead.phone}</span>
                    <span className="text-parchment-dim text-xs bg-ink-3 px-3 py-1 rounded-full">{lead.channel}</span>
                  </Link>
                ))}
              </div>
              {overdueLeads.length > 5 && (
                <Link href="/admin/leads?is_overdue=true" className="text-sm text-carimbo font-medium hover:text-carimbo-bright mt-4 inline-block">
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
            <div className="bg-ink-2/30 rounded-sm p-6 border border-line h-full">
              <div className="flex items-center gap-2 mb-6">
                <div className="p-2 bg-jade/15 rounded-sm"><Clock className="text-jade" size={20} /></div>
                <h2 className="text-lg font-display font-semibold text-parchment">SLA de Atendimento</h2>
              </div>

              <div className="flex items-center justify-center py-6">
                <div className="relative">
                  <svg className="w-32 h-32 transform -rotate-90">
                    <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-line" />
                    <circle
                      cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="12" fill="transparent"
                      className={data.sla.sla_rate >= 80 ? "text-jade" : "text-carimbo-bright"}
                      strokeDasharray={351.858}
                      strokeDashoffset={351.858 - (351.858 * data.sla.sla_rate) / 100}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold text-parchment">{data.sla.sla_rate.toFixed(0)}%</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-2">
                <div className="text-center p-3 bg-ink-3 rounded-sm">
                  <p className="text-xs text-parchment-dim mb-1">No prazo</p>
                  <p className="font-bold text-jade">{data.sla.within_sla}</p>
                </div>
                <div className="text-center p-3 bg-ink-3 rounded-sm">
                  <p className="text-xs text-parchment-dim mb-1">Vencidos</p>
                  <p className="font-bold text-carimbo-bright">{data.sla.overdue}</p>
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
    <div className={`bg-ink-2/30 rounded-sm p-6 border border-line h-full flex flex-col ${href ? "hover:border-selo/50 transition-all cursor-pointer group" : ""}`}>
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-sm bg-ink-3 ${href ? 'group-hover:bg-carimbo/10 transition-colors' : ''}`}>
          {icon}
        </div>
      </div>
      <div>
        <p className="text-3xl font-bold text-parchment mb-1">{value}</p>
        <p className="text-sm font-medium text-parchment-dim">{title}</p>
        {subtitle && <p className="text-xs text-parchment-faint mt-2">{subtitle}</p>}
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
      <p className="text-xs font-medium text-parchment-dim mb-1 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold ${color || "text-parchment"}`}>{value}</p>
    </div>
  );
}
