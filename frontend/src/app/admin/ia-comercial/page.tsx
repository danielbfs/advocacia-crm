"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { LeadAgentConfig, PricingItem, SupervisorConfig } from "@/types";

const PIPELINE_STATUSES = [
  { value: "novo", label: "Novo" },
  { value: "em_contato", label: "Em Contato" },
  { value: "qualificado", label: "Qualificado" },
  { value: "orcamento_enviado", label: "Orçamento Enviado" },
  { value: "negociando", label: "Negociando" },
];

const DEFAULT_AWAITING =
  "Vou verificar com nosso supervisor e retorno em breve! ✅";

// ----- Schedule types -----
const DAYS_OF_WEEK = [
  { key: "mon", label: "Seg" },
  { key: "tue", label: "Ter" },
  { key: "wed", label: "Qua" },
  { key: "thu", label: "Qui" },
  { key: "fri", label: "Sex" },
  { key: "sat", label: "Sáb" },
  { key: "sun", label: "Dom" },
];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
type AllowedSlots = Record<string, number[]>;

interface ScheduleConfig {
  enabled: boolean;
  timezone: string;
  allowed_slots: AllowedSlots;
  holidays: string[];
}

const DEFAULT_SCHEDULE: ScheduleConfig = {
  enabled: false,
  timezone: "America/Sao_Paulo",
  allowed_slots: {
    mon: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
    tue: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
    wed: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
    thu: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
    fri: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
    sat: [],
    sun: [],
  },
  holidays: [],
};

// ============================================================
// Toggle component
// ============================================================
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors ${
          checked ? "bg-blue-600" : "bg-gray-300"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </div>
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  );
}

// ============================================================
// Weekly grid (drag-to-paint)
// ============================================================
function WeeklyGrid({
  slots,
  onChange,
}: {
  slots: AllowedSlots;
  onChange: (s: AllowedSlots) => void;
}) {
  const paintingRef = useRef(false);
  const paintValueRef = useRef(true);

  function isOn(day: string, hour: number) {
    return (slots[day] || []).includes(hour);
  }

  function applyCell(day: string, hour: number, value: boolean) {
    const current = slots[day] || [];
    let next: number[];
    if (value) {
      next = Array.from(new Set([...current, hour])).sort((a, b) => a - b);
    } else {
      next = current.filter((h) => h !== hour);
    }
    onChange({ ...slots, [day]: next });
  }

  function handleMouseDown(day: string, hour: number) {
    const currently = isOn(day, hour);
    paintValueRef.current = !currently;
    paintingRef.current = true;
    applyCell(day, hour, !currently);
  }

  function handleMouseEnter(day: string, hour: number) {
    if (!paintingRef.current) return;
    applyCell(day, hour, paintValueRef.current);
  }

  function handleMouseUp() {
    paintingRef.current = false;
  }

  function toggleWholeDay(day: string) {
    const allOn = HOURS.every((h) => isOn(day, h));
    onChange({ ...slots, [day]: allOn ? [] : [...HOURS] });
  }

  function toggleWholeHour(hour: number) {
    const allOn = DAYS_OF_WEEK.every(({ key }) => isOn(key, hour));
    const next = { ...slots };
    DAYS_OF_WEEK.forEach(({ key }) => {
      const current = next[key] || [];
      if (allOn) {
        next[key] = current.filter((h) => h !== hour);
      } else {
        if (!current.includes(hour)) {
          next[key] = [...current, hour].sort((a, b) => a - b);
        }
      }
    });
    onChange(next);
  }

  return (
    <div
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      className="overflow-x-auto select-none"
    >
      <table className="border-separate border-spacing-[3px]">
        <thead>
          <tr>
            {/* corner */}
            <th className="w-9" />
            {HOURS.map((h) => (
              <th
                key={h}
                onClick={() => toggleWholeHour(h)}
                title={`${h}h — clique para alternar coluna`}
                className="w-7 text-[9px] text-gray-400 font-normal text-center cursor-pointer hover:text-blue-600 pb-0.5"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAYS_OF_WEEK.map(({ key, label }) => (
            <tr key={key}>
              <td
                onClick={() => toggleWholeDay(key)}
                title="Clique para alternar o dia inteiro"
                className="text-xs font-medium text-gray-500 pr-2 cursor-pointer hover:text-blue-600 whitespace-nowrap text-right"
              >
                {label}
              </td>
              {HOURS.map((h) => (
                <td
                  key={h}
                  onMouseDown={() => handleMouseDown(key, h)}
                  onMouseEnter={() => handleMouseEnter(key, h)}
                  title={`${label} ${h}h`}
                  className={`w-7 h-6 rounded cursor-pointer transition-colors ${
                    isOn(key, h)
                      ? "bg-blue-500 hover:bg-blue-400"
                      : "bg-gray-100 hover:bg-gray-200 border border-gray-200"
                  }`}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-gray-400 mt-1.5">
        Azul = permitido · Clique ou arraste para marcar/desmarcar ·
        Clique no dia ou hora para alternar a linha/coluna inteira
      </p>
    </div>
  );
}

// ============================================================
// Holidays manager
// ============================================================
function HolidaysManager({
  holidays,
  onChange,
}: {
  holidays: string[];
  onChange: (h: string[]) => void;
}) {
  const [newDate, setNewDate] = useState("");

  function add() {
    if (!newDate || holidays.includes(newDate)) return;
    onChange([...holidays, newDate].sort());
    setNewDate("");
  }

  function remove(date: string) {
    onChange(holidays.filter((d) => d !== date));
  }

  function fmt(iso: string) {
    return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR");
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center">
        <input
          type="date"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        />
        <button
          onClick={add}
          disabled={!newDate}
          className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
        >
          + Adicionar feriado
        </button>
      </div>
      {holidays.length === 0 ? (
        <p className="text-xs text-gray-400">Nenhum feriado cadastrado.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {holidays.map((date) => (
            <span
              key={date}
              className="inline-flex items-center gap-1.5 text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-full"
            >
              {fmt(date)}
              <button
                onClick={() => remove(date)}
                className="text-gray-400 hover:text-red-500 font-bold leading-none"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Status config card (collapsible)
// ============================================================
function StatusConfigCard({
  config,
  label,
  onSave,
}: {
  config: LeadAgentConfig;
  label: string;
  onSave: (c: LeadAgentConfig) => Promise<void>;
}) {
  const [form, setForm] = useState<LeadAgentConfig>(config);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => setForm(config), [config]);

  function set<K extends keyof LeadAgentConfig>(k: K, v: LeadAgentConfig[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    setSaving(true);
    try {
      await onSave(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border rounded-xl overflow-hidden">
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-3">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              form.is_active ? "bg-green-500" : "bg-gray-300"
            }`}
          />
          <span className="font-medium text-gray-800">{label}</span>
          {form.is_active && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
              IA ativa
            </span>
          )}
        </div>
        <span className="text-gray-400 text-sm">{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div className="border-t px-5 py-4 space-y-4">
          <Toggle
            checked={form.is_active}
            onChange={(v) => set("is_active", v)}
            label="Ativar agente de IA para este status"
          />

          <Toggle
            checked={form.auto_send_on_enter}
            onChange={(v) => set("auto_send_on_enter", v)}
            label="Enviar mensagem proativa ao lead entrar neste status"
          />

          {form.auto_send_on_enter && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Instrução para a IA no primeiro contato
                <span className="ml-1 text-gray-400">(ex: apresente a clínica e pergunte sobre o interesse)</span>
              </label>
              <textarea
                rows={2}
                value={form.initial_message || ""}
                onChange={(e) => set("initial_message", e.target.value)}
                placeholder="Ex: Apresente-se como atendente da clínica, seja acolhedor e pergunte qual especialidade o cliente busca."
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
              <p className="text-[10px] text-gray-400 mt-1">
                A IA usará esta instrução para gerar uma mensagem personalizada — não é um texto fixo.
              </p>
            </div>
          )}

          <Toggle
            checked={form.convert_on_appointment ?? true}
            onChange={(v) => set("convert_on_appointment", v)}
            label="Converter lead em paciente automaticamente ao agendar consulta"
          />
          <p className="text-xs text-gray-400 -mt-2 ml-12">
            Quando ativado, a IA converte o lead para &ldquo;Convertido&rdquo; assim que agendar uma consulta na agenda.
          </p>

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Prompt customizado (deixe vazio para usar o padrão)
            </label>
            <textarea
              rows={4}
              value={form.system_prompt || ""}
              onChange={(e) => set("system_prompt", e.target.value || null)}
              placeholder="Instruções adicionais para a IA neste status..."
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono text-xs"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Follow-up após inatividade (horas)
              </label>
              <input
                type="number"
                min={1}
                value={form.inactivity_hours}
                onChange={(e) =>
                  set("inactivity_hours", parseInt(e.target.value) || 24)
                }
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Máx. follow-ups por inatividade
              </label>
              <input
                type="number"
                min={0}
                max={10}
                value={form.max_inactivity_followups}
                onChange={(e) =>
                  set("max_inactivity_followups", parseInt(e.target.value) || 2)
                }
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Marcar perdido após (horas)
              </label>
              <input
                type="number"
                min={1}
                value={form.auto_lost_after_hours}
                onChange={(e) =>
                  set("auto_lost_after_hours", parseInt(e.target.value) || 72)
                }
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Mensagem de follow-up por inatividade
              <span className="ml-1 text-gray-400">
                (use {"{nome}"} para o nome do lead)
              </span>
            </label>
            <textarea
              rows={2}
              value={form.inactivity_followup_message || ""}
              onChange={(e) =>
                set("inactivity_followup_message", e.target.value || null)
              }
              placeholder="Ex: Olá {nome}, ainda podemos ajudar?"
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <button
            onClick={save}
            disabled={saving}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Salvando..." : saved ? "✓ Salvo" : "Salvar"}
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Pricing table
// ============================================================
function PricingTable({
  items,
  onChange,
  specialties,
}: {
  items: PricingItem[];
  onChange: (items: PricingItem[]) => void;
  specialties: { id: string; name: string }[];
}) {
  const [newItem, setNewItem] = useState<PricingItem>({
    specialty: "",
    service: "",
    price: 0,
    notes: "",
  });

  function add() {
    if (!newItem.specialty || !newItem.service || newItem.price <= 0) return;
    onChange([...items, { ...newItem }]);
    setNewItem({ specialty: "", service: "", price: 0, notes: "" });
  }

  function remove(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-3">
      {items.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Especialidade</th>
                <th className="px-3 py-2 text-left">Serviço</th>
                <th className="px-3 py-2 text-right">Valor (R$)</th>
                <th className="px-3 py-2 text-left">Observação</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-3 py-2">{item.specialty}</td>
                  <td className="px-3 py-2">{item.service}</td>
                  <td className="px-3 py-2 text-right font-medium">
                    {item.price.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </td>
                  <td className="px-3 py-2 text-gray-500 text-xs">
                    {item.notes || "—"}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => remove(i)}
                      className="text-red-500 hover:text-red-700 text-xs"
                    >
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="border rounded-lg p-3 bg-gray-50">
        <p className="text-xs font-medium text-gray-600 mb-2">Adicionar item</p>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <select
            value={newItem.specialty}
            onChange={(e) =>
              setNewItem({ ...newItem, specialty: e.target.value })
            }
            className="border rounded px-2 py-1.5 text-sm"
          >
            <option value="">Selecione a Especialidade</option>
            {specialties.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            value={newItem.service}
            onChange={(e) =>
              setNewItem({ ...newItem, service: e.target.value })
            }
            placeholder="Serviço (ex: Consulta, Exame)"
            className="border rounded px-2 py-1.5 text-sm"
          />
          <input
            type="number"
            step="0.01"
            min={0}
            value={newItem.price || ""}
            onChange={(e) =>
              setNewItem({ ...newItem, price: parseFloat(e.target.value) || 0 })
            }
            placeholder="Valor (R$)"
            className="border rounded px-2 py-1.5 text-sm"
          />
          <input
            value={newItem.notes || ""}
            onChange={(e) => setNewItem({ ...newItem, notes: e.target.value })}
            placeholder="Observação (opcional)"
            className="border rounded px-2 py-1.5 text-sm"
          />
        </div>
        <button
          onClick={add}
          disabled={!newItem.specialty || !newItem.service || newItem.price <= 0}
          className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
        >
          + Adicionar
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Page
// ============================================================
export default function IaComercialPage() {
  const [configs, setConfigs] = useState<LeadAgentConfig[]>([]);
  const [supervisorConfig, setSupervisorConfig] = useState<SupervisorConfig>({
    supervisor_whatsapp: "",
    awaiting_message: DEFAULT_AWAITING,
    timeout_hours: 4,
    on_timeout: "escalate_human",
  });
  const [pricingItems, setPricingItems] = useState<PricingItem[]>([]);
  const [pricingNotes, setPricingNotes] = useState("");
  const [schedule, setSchedule] = useState<ScheduleConfig>(DEFAULT_SCHEDULE);
  const [specialties, setSpecialties] = useState<{ id: string; name: string }[]>([]);

  const [loading, setLoading] = useState(true);
  const [supSaving, setSupSaving] = useState(false);
  const [supSaved, setSupSaved] = useState(false);
  const [pricingSaving, setPricingSaving] = useState(false);
  const [pricingSaved, setPricingSaved] = useState(false);
  const [schedSaving, setSchedSaving] = useState(false);
  const [schedSaved, setSchedSaved] = useState(false);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    try {
      const [cfgRes, supRes, priceRes, schedRes, specRes] = await Promise.allSettled([
        api.get("/leads/ai-configs"),
        api.get("/leads/ai-supervisor-config"),
        api.get("/leads/ai-pricing"),
        api.get("/leads/ai-messaging-schedule"),
        api.get("/specialties/"),
      ]);
      if (cfgRes.status === "fulfilled") setConfigs(cfgRes.value.data);
      if (supRes.status === "fulfilled") setSupervisorConfig(supRes.value.data);
      if (priceRes.status === "fulfilled") {
        setPricingItems(priceRes.value.data.items || []);
        setPricingNotes(priceRes.value.data.notes || "");
      }
      if (schedRes.status === "fulfilled") setSchedule(schedRes.value.data);
      if (specRes.status === "fulfilled") setSpecialties(specRes.value.data);
    } finally {
      setLoading(false);
    }
  }

  async function saveStatusConfig(config: LeadAgentConfig) {
    try {
      console.log("Saving AI config for", config.status, config);
      await api.put(`/leads/ai-configs/${config.status}`, config);
      setConfigs((prev) => {
        const exists = prev.some((c) => c.status === config.status);
        if (exists) {
          return prev.map((c) => (c.status === config.status ? config : c));
        }
        return [...prev, config];
      });
    } catch (err: any) {
      console.error("Error saving AI config:", err);
      const msg = err.response?.data?.detail || err.message || "Erro desconhecido";
      alert(`Erro ao salvar configuração para ${config.status}: ${msg}`);
      throw err; // Re-throw to keep StatusConfigCard in 'unsaved' state
    }
  }

  async function saveSupervisor() {
    setSupSaving(true);
    try {
      await api.put("/leads/ai-supervisor-config", supervisorConfig);
      setSupSaved(true);
      setTimeout(() => setSupSaved(false), 2000);
    } catch {
      alert("Erro ao salvar configuração do supervisor.");
    } finally {
      setSupSaving(false);
    }
  }

  async function savePricing() {
    setPricingSaving(true);
    try {
      await api.put("/leads/ai-pricing", {
        items: pricingItems,
        currency: "BRL",
        notes: pricingNotes,
      });
      setPricingSaved(true);
      setTimeout(() => setPricingSaved(false), 2000);
    } catch {
      alert("Erro ao salvar tabela de preços.");
    } finally {
      setPricingSaving(false);
    }
  }

  async function saveSchedule() {
    setSchedSaving(true);
    try {
      await api.put("/leads/ai-messaging-schedule", schedule);
      setSchedSaved(true);
      setTimeout(() => setSchedSaved(false), 2000);
    } catch {
      alert("Erro ao salvar horários.");
    } finally {
      setSchedSaving(false);
    }
  }

  if (loading) return <div className="p-8 text-gray-400">Carregando...</div>;

  return (
    <main className="p-8 max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">IA Comercial</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure o agente de IA que negocia automaticamente com os leads via
          WhatsApp.
        </p>
      </div>

      {/* Instructions Banner */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-bold text-blue-900 flex items-center gap-2">
          <span className="text-lg">🤖</span> Como funciona o Atendente IA
        </h2>
        <div className="grid gap-3 text-xs text-blue-800 leading-relaxed">
          <div className="flex gap-2">
            <span className="font-bold text-blue-600 shrink-0">1.</span>
            <p><strong>Configuração por Etapa:</strong> Cada status do pipeline (Novo, Em Contato, Qualificado, etc.) pode ter seu próprio agente IA com instruções específicas. Ative o toggle para habilitar a IA naquela etapa.</p>
          </div>
          <div className="flex gap-2">
            <span className="font-bold text-blue-600 shrink-0">2.</span>
            <p><strong>Gatilho Automático:</strong> Quando um lead <strong>entra em um novo status</strong> (seja por criação ou movimentação no Kanban), a IA envia automaticamente a <em>mensagem inicial</em> configurada, se o toggle &ldquo;Enviar mensagem ao entrar neste status&rdquo; estiver ativo.</p>
          </div>
          <div className="flex gap-2">
            <span className="font-bold text-blue-600 shrink-0">3.</span>
            <p><strong>Respostas Inteligentes:</strong> Após o primeiro contato, a IA responde automaticamente as mensagens do lead usando as instruções (prompt) e a tabela de preços configurada abaixo. A IA nunca inventa preços — consulta sempre a tabela.</p>
          </div>
          <div className="flex gap-2">
            <span className="font-bold text-blue-600 shrink-0">4.</span>
            <p><strong>Follow-up de Inatividade:</strong> Se o lead parar de responder, a IA envia follow-ups automáticos (configurável por etapa) e pode marcar como perdido após o período definido.</p>
          </div>
          <div className="flex gap-2">
            <span className="font-bold text-blue-600 shrink-0">5.</span>
            <p><strong>Supervisor:</strong> Quando o lead pede desconto ou algo fora da tabela, a IA consulta o supervisor via WhatsApp e aguarda a resposta para continuar a negociação.</p>
          </div>
        </div>
        <div className="bg-white/60 rounded-lg px-3 py-2 text-[11px] text-blue-700 border border-blue-100">
          <strong>⚠️ Importante:</strong> Leads só são atendidos pela IA se tiverem canal <strong>WhatsApp</strong> ou <strong>Telegram</strong>. Leads criados manualmente com outros canais não receberão mensagens automáticas. Os horários de envio respeitam a grade configurada na seção &ldquo;Horários de Envio&rdquo; abaixo.
        </div>
      </div>

      {/* Section 1: Status Configs */}
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-3">
          Configuração por Status
        </h2>
        <div className="space-y-3">
          {PIPELINE_STATUSES.map(({ value, label }) => {
            const config =
              configs.find((c) => c.status === value) ??
              ({
                status: value,
                is_active: false,
                system_prompt: null,
                auto_send_on_enter: false,
                initial_message: null,
                inactivity_hours: 24,
                max_inactivity_followups: 2,
                inactivity_followup_message: null,
                auto_lost_after_hours: 72,
                convert_on_appointment: true,
              } as LeadAgentConfig);
            return (
              <StatusConfigCard
                key={value}
                config={config}
                label={label}
                onSave={saveStatusConfig}
              />
            );
          })}
        </div>
      </section>

      {/* Section 2: Supervisor */}
      <section className="bg-white border rounded-xl p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-700">Supervisor</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Quando a IA não conseguir resolver (desconto, serviço fora da
            tabela, etc.), envia a pergunta para este número via WhatsApp. O
            supervisor responde diretamente pelo celular.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Número do Supervisor (WhatsApp)
            </label>
            <input
              value={supervisorConfig.supervisor_whatsapp}
              onChange={(e) =>
                setSupervisorConfig({
                  ...supervisorConfig,
                  supervisor_whatsapp: e.target.value,
                })
              }
              placeholder="Ex: 5511999999999"
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
            <p className="text-[10px] text-gray-400 mt-1">
              Código do país + DDD + número, sem espaços ou traços.
            </p>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Timeout sem resposta (horas)
            </label>
            <input
              type="number"
              min={1}
              value={supervisorConfig.timeout_hours}
              onChange={(e) =>
                setSupervisorConfig({
                  ...supervisorConfig,
                  timeout_hours: parseInt(e.target.value) || 4,
                })
              }
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-xs text-gray-500 mb-1">
              Mensagem ao cliente enquanto aguarda resposta do supervisor
            </label>
            <input
              value={supervisorConfig.awaiting_message}
              onChange={(e) =>
                setSupervisorConfig({
                  ...supervisorConfig,
                  awaiting_message: e.target.value,
                })
              }
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-xs text-gray-500 mb-1">
              Ação ao atingir o timeout
            </label>
            <select
              value={supervisorConfig.on_timeout}
              onChange={(e) =>
                setSupervisorConfig({
                  ...supervisorConfig,
                  on_timeout: e.target.value as "escalate_human" | "close_ai",
                })
              }
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              <option value="escalate_human">
                Escalar para atendente humano
              </option>
              <option value="close_ai">Informar cliente e encerrar IA</option>
            </select>
          </div>
        </div>

        <button
          onClick={saveSupervisor}
          disabled={supSaving}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {supSaving ? "Salvando..." : supSaved ? "✓ Salvo" : "Salvar"}
        </button>
      </section>

      {/* Section 3: Pricing */}
      <section className="bg-white border rounded-xl p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-700">
            Tabela de Preços
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            A IA consulta esta tabela antes de informar valores ao cliente.
          </p>
        </div>

        <PricingTable 
          items={pricingItems} 
          onChange={setPricingItems} 
          specialties={specialties}
        />

        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Observação geral (exibida à IA junto com a tabela)
          </label>
          <input
            value={pricingNotes}
            onChange={(e) => setPricingNotes(e.target.value)}
            placeholder="Ex: Valores sujeitos a alteração sem aviso prévio."
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <button
          onClick={savePricing}
          disabled={pricingSaving}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {pricingSaving
            ? "Salvando..."
            : pricingSaved
            ? "✓ Salvo"
            : "Salvar Tabela"}
        </button>
      </section>

      {/* Section 4: Messaging Schedule */}
      <section className="bg-white border rounded-xl p-5 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-gray-700">
            Horários de envio
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Restrinja os horários em que a IA e as mensagens agendadas podem
            ser enviadas. Fora dos horários marcados em azul, nenhuma mensagem
            automática é disparada.
          </p>
        </div>

        <Toggle
          checked={schedule.enabled}
          onChange={(v) => setSchedule({ ...schedule, enabled: v })}
          label="Ativar restrição de horários"
        />

        {schedule.enabled && (
          <>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Fuso horário
              </label>
              <select
                value={schedule.timezone}
                onChange={(e) =>
                  setSchedule({ ...schedule, timezone: e.target.value })
                }
                className="border rounded-lg px-3 py-2 text-sm"
              >
                <option value="America/Sao_Paulo">
                  America/Sao_Paulo (Brasília)
                </option>
                <option value="America/Manaus">America/Manaus</option>
                <option value="America/Belem">America/Belem</option>
                <option value="America/Fortaleza">America/Fortaleza</option>
                <option value="America/Recife">America/Recife</option>
                <option value="America/Cuiaba">America/Cuiaba</option>
                <option value="America/Porto_Velho">America/Porto_Velho</option>
                <option value="America/Boa_Vista">America/Boa_Vista</option>
                <option value="America/Rio_Branco">America/Rio_Branco</option>
                <option value="America/Noronha">America/Noronha</option>
              </select>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-600 mb-3">
                Grade semanal — marque em azul os horários permitidos
              </p>
              <WeeklyGrid
                slots={schedule.allowed_slots}
                onChange={(slots) =>
                  setSchedule({ ...schedule, allowed_slots: slots })
                }
              />
            </div>

            <div>
              <p className="text-xs font-medium text-gray-600 mb-2">
                Feriados — nenhuma mensagem é enviada nestes dias
              </p>
              <HolidaysManager
                holidays={schedule.holidays}
                onChange={(holidays) =>
                  setSchedule({ ...schedule, holidays })
                }
              />
            </div>
          </>
        )}

        <button
          onClick={saveSchedule}
          disabled={schedSaving}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {schedSaving
            ? "Salvando..."
            : schedSaved
            ? "✓ Salvo"
            : "Salvar Horários"}
        </button>
      </section>
    </main>
  );
}
