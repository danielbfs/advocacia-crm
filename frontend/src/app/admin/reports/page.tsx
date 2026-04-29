"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

interface FunnelItem {
  status: string;
  total: number;
}

interface LeadsBySourceItem {
  channel: string;
  utm_campaign: string | null;
  total_leads: number;
  converted: number;
  conversion_rate: number;
}

interface SLAReport {
  total: number;
  within_sla: number;
  overdue: number;
  sla_rate: number;
}

interface AutomationMetrics {
  ai_total: number;
  ai_converted: number;
  ai_conversion_rate: number;
  followup_total: number;
  followup_executed: number;
  followup_execution_rate: number;
}

interface TimelineItem {
  day: string;
  new_leads: number;
  converted: number;
}

const STATUS_LABELS: Record<string, string> = {
  novo: "Novo",
  em_contato: "Em Contato",
  orcamento_enviado: "Orçamento Enviado",
  negociando: "Negociando",
  convertido: "Convertido",
  perdido: "Perdido",
};

const STATUS_COLORS: Record<string, string> = {
  novo: "bg-blue-500",
  em_contato: "bg-yellow-500",
  orcamento_enviado: "bg-purple-500",
  negociando: "bg-orange-500",
  convertido: "bg-green-500",
  perdido: "bg-gray-400",
};

const PERIODS = [
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
];

export default function ReportsPage() {
  const [period, setPeriod] = useState("30d");
  const [loading, setLoading] = useState(true);
  const [funnel, setFunnel] = useState<FunnelItem[]>([]);
  const [sources, setSources] = useState<LeadsBySourceItem[]>([]);
  const [sla, setSla] = useState<SLAReport | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [automations, setAutomations] = useState<AutomationMetrics | null>(null);

  useEffect(() => {
    fetchReports();
  }, [period]);

  async function fetchReports() {
    setLoading(true);
    try {
      const [funnelRes, sourcesRes, slaRes, timelineRes, autoRes] = await Promise.allSettled([
        api.get(`/leads/reports/funnel?period=${period}`),
        api.get(`/leads/reports/by-source?period=${period}`),
        api.get(`/leads/reports/sla?period=${period}`),
        api.get(`/leads/reports/timeline?period=${period}`),
        api.get(`/leads/reports/automations?period=${period}`),
      ]);
      if (funnelRes.status === "fulfilled") setFunnel(funnelRes.value.data);
      if (sourcesRes.status === "fulfilled") setSources(sourcesRes.value.data);
      if (slaRes.status === "fulfilled") setSla(slaRes.value.data);
      if (timelineRes.status === "fulfilled") setTimeline(timelineRes.value.data);
      if (autoRes.status === "fulfilled") setAutomations(autoRes.value.data);
    } finally {
      setLoading(false);
    }
  }

  const totalLeads = funnel.reduce((sum, f) => sum + f.total, 0);
  const convertedCount = funnel.find((f) => f.status === "convertido")?.total || 0;
  const conversionRate = totalLeads > 0 ? ((convertedCount / totalLeads) * 100).toFixed(1) : "0";
  const maxFunnel = Math.max(...funnel.map((f) => f.total), 1);
  const maxTimeline = Math.max(...timeline.map((t) => t.new_leads), 1);

  return (
    <main className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Relatórios</h1>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1.5 text-xs rounded-full font-medium border transition-colors ${
                period === p.value
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-gray-400">Carregando...</div>
      ) : (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-4 gap-4">
            <SummaryCard label="Total de Leads" value={totalLeads} />
            <SummaryCard label="Convertidos" value={convertedCount} />
            <SummaryCard label="Taxa de Conversão" value={`${conversionRate}%`} />
            <SummaryCard
              label="SLA Cumprido"
              value={sla ? `${sla.sla_rate.toFixed(1)}%` : "—"}
              sub={sla ? `${sla.within_sla} de ${sla.total}` : undefined}
            />
          </div>

          {/* Funnel */}
          <div className="bg-white border rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Funil de Leads</h2>
            {funnel.length === 0 ? (
              <p className="text-sm text-gray-400">Sem dados no período.</p>
            ) : (
              <div className="space-y-3">
                {funnel.map((item) => (
                  <Link
                    key={item.status}
                    href={`/admin/leads?status=${item.status}`}
                    className="flex items-center gap-3 group hover:opacity-80 transition-all cursor-pointer"
                  >
                    <span className="w-36 text-sm text-gray-600 text-right group-hover:text-blue-600 font-medium">
                      {STATUS_LABELS[item.status] || item.status}
                    </span>
                    <div className="flex-1 bg-gray-100 rounded-full h-7 relative overflow-hidden group-hover:ring-1 group-hover:ring-blue-400">
                      <div
                        className={`h-full rounded-full ${STATUS_COLORS[item.status] || "bg-blue-500"} transition-all`}
                        style={{ width: `${(item.total / maxFunnel) * 100}%` }}
                      />
                      <span className="absolute inset-0 flex items-center pl-3 text-xs font-medium text-white mix-blend-difference">
                        {item.total}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* SLA Detail */}
          {sla && sla.total > 0 && (
            <div className="bg-white border rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">SLA de Primeiro Contato</h2>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">{sla.total}</div>
                  <div className="text-xs text-gray-500">Total</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{sla.within_sla}</div>
                  <div className="text-xs text-gray-500">Dentro do SLA</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{sla.overdue}</div>
                  <div className="text-xs text-gray-500">Vencidos</div>
                </div>
              </div>
              <div className="mt-4 bg-gray-100 rounded-full h-4 overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full"
                  style={{ width: `${sla.sla_rate}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1 text-right">{sla.sla_rate.toFixed(1)}% cumprido</p>
            </div>
          )}

          {/* Automations Performance */}
          {automations && (
            <div className="bg-white border rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Performance das Automações</h2>
              <div className="grid grid-cols-2 gap-6">
                <div className="border rounded-lg p-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Atendimentos por IA</h3>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-2xl font-bold text-gray-900">{automations.ai_total}</span>
                    <span className="text-sm text-gray-500">Leads no período</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold text-green-600">{automations.ai_converted}</span>
                    <span className="text-sm text-gray-500">Convertidos</span>
                  </div>
                  <div className="mt-3 bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${automations.ai_conversion_rate}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1 text-right">{automations.ai_conversion_rate.toFixed(1)}% de conversão</p>
                </div>
                <div className="border rounded-lg p-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Rotinas de Follow-up</h3>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-2xl font-bold text-gray-900">{automations.followup_total}</span>
                    <span className="text-sm text-gray-500">Agendados no período</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold text-blue-600">{automations.followup_executed}</span>
                    <span className="text-sm text-gray-500">Executados c/ sucesso</span>
                  </div>
                  <div className="mt-3 bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full"
                      style={{ width: `${automations.followup_execution_rate}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1 text-right">{automations.followup_execution_rate.toFixed(1)}% de execução</p>
                </div>
              </div>
            </div>
          )}

          {/* Sources */}
          <div className="bg-white border rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Leads por Origem</h2>
            {sources.length === 0 ? (
              <p className="text-sm text-gray-400">Sem dados no período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b">
                    <tr>
                      <th className="text-left py-2 text-gray-500 font-medium">Canal</th>
                      <th className="text-left py-2 text-gray-500 font-medium">Campanha</th>
                      <th className="text-right py-2 text-gray-500 font-medium">Leads</th>
                      <th className="text-right py-2 text-gray-500 font-medium">Convertidos</th>
                      <th className="text-right py-2 text-gray-500 font-medium">Conversão</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {sources.map((s, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="py-2 text-gray-900">{s.channel}</td>
                        <td className="py-2 text-gray-500">{s.utm_campaign || "—"}</td>
                        <td className="py-2 text-right text-gray-900">{s.total_leads}</td>
                        <td className="py-2 text-right text-green-600">{s.converted}</td>
                        <td className="py-2 text-right text-gray-600">{s.conversion_rate.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="bg-white border rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Leads por Dia</h2>
            {timeline.length === 0 ? (
              <p className="text-sm text-gray-400">Sem dados no período.</p>
            ) : (
              <div className="flex items-end gap-1" style={{ height: 160 }}>
                {timeline.map((t, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${t.day}: ${t.new_leads} leads, ${t.converted} convertidos`}>
                    <div className="w-full flex flex-col items-center justify-end" style={{ height: 140 }}>
                      <div
                        className="w-full bg-blue-400 rounded-t"
                        style={{ height: `${(t.new_leads / maxTimeline) * 100}%`, minHeight: t.new_leads > 0 ? 4 : 0 }}
                      />
                    </div>
                    {i % Math.max(1, Math.floor(timeline.length / 8)) === 0 && (
                      <span className="text-[9px] text-gray-400 whitespace-nowrap">
                        {new Date(t.day).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="bg-white border rounded-lg p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}
