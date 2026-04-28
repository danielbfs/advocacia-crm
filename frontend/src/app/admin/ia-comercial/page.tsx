"use client";

import { useEffect, useState } from "react";
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
                Mensagem de abertura
              </label>
              <textarea
                rows={2}
                value={form.initial_message || ""}
                onChange={(e) => set("initial_message", e.target.value)}
                placeholder="Ex: Olá {nome}! Vi que você tem interesse em nossa clínica..."
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          )}

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
                onChange={(e) => set("inactivity_hours", parseInt(e.target.value) || 24)}
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
              <span className="ml-1 text-gray-400">(use {"{nome}"} para o nome do lead)</span>
            </label>
            <textarea
              rows={2}
              value={form.inactivity_followup_message || ""}
              onChange={(e) =>
                set("inactivity_followup_message", e.target.value || null)
              }
              placeholder="Ex: Olá {nome}, ficamos sem notícias. Ainda tem interesse? Posso ajudar!"
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

function PricingTable({
  items,
  onChange,
}: {
  items: PricingItem[];
  onChange: (items: PricingItem[]) => void;
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
          <input
            value={newItem.specialty}
            onChange={(e) =>
              setNewItem({ ...newItem, specialty: e.target.value })
            }
            placeholder="Especialidade"
            className="border rounded px-2 py-1.5 text-sm"
          />
          <input
            value={newItem.service}
            onChange={(e) => setNewItem({ ...newItem, service: e.target.value })}
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
  const [loading, setLoading] = useState(true);
  const [supSaving, setSupSaving] = useState(false);
  const [supSaved, setSupSaved] = useState(false);
  const [pricingSaving, setPricingSaving] = useState(false);
  const [pricingSaved, setPricingSaved] = useState(false);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    try {
      const [cfgRes, supRes, priceRes] = await Promise.allSettled([
        api.get("/leads/ai-configs"),
        api.get("/leads/ai-supervisor-config"),
        api.get("/leads/ai-pricing"),
      ]);
      if (cfgRes.status === "fulfilled") setConfigs(cfgRes.value.data);
      if (supRes.status === "fulfilled") setSupervisorConfig(supRes.value.data);
      if (priceRes.status === "fulfilled") {
        setPricingItems(priceRes.value.data.items || []);
        setPricingNotes(priceRes.value.data.notes || "");
      }
    } finally {
      setLoading(false);
    }
  }

  async function saveStatusConfig(config: LeadAgentConfig) {
    await api.put(`/leads/ai-configs/${config.status}`, config);
    setConfigs((prev) =>
      prev.map((c) => (c.status === config.status ? config : c))
    );
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
            tabela, etc.), envia a pergunta para este número via WhatsApp.
            O supervisor responde diretamente pelo celular.
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
              Formato: código do país + DDD + número, sem espaços ou traços.
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
              <option value="close_ai">
                Informar cliente e encerrar IA
              </option>
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
            Adicione todos os serviços e valores praticados.
          </p>
        </div>

        <PricingTable items={pricingItems} onChange={setPricingItems} />

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
    </main>
  );
}
