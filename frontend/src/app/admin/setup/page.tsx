"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface SetupStatus {
  telegram_configured: boolean;
  openai_configured: boolean;
  local_llm_configured: boolean;
  whatsapp_configured: boolean;
  domain: string;
}

interface ClinicSettings {
  name: string;
  timezone: string;
  phone: string;
  address: string;
  logo_url: string;
}

interface SLASettings {
  hours: number;
}

const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Fortaleza",
  "America/Manaus",
  "America/Rio_Branco",
  "America/Bahia",
  "America/Belem",
  "America/Cuiaba",
  "America/Recife",
];

export default function SetupPage() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [webhookResult, setWebhookResult] = useState<string | null>(null);
  const [settingWebhook, setSettingWebhook] = useState(false);
  const [whatsappWebhookResult, setWhatsappWebhookResult] = useState<string | null>(null);
  const [settingWhatsappWebhook, setSettingWhatsappWebhook] = useState(false);

  const [clinic, setClinic] = useState<ClinicSettings>({
    name: "",
    timezone: "America/Sao_Paulo",
    phone: "",
    address: "",
    logo_url: "",
  });
  const [sla, setSla] = useState<SLASettings>({ hours: 2 });

  const [savingClinic, setSavingClinic] = useState(false);
  const [savingSla, setSavingSla] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    try {
      const [statusRes, settingsRes] = await Promise.allSettled([
        api.get("/admin/setup/status"),
        api.get("/admin/settings"),
      ]);
      if (statusRes.status === "fulfilled") setStatus(statusRes.value.data);
      if (settingsRes.status === "fulfilled") {
        const s = settingsRes.value.data;
        setClinic(s.clinic);
        setSla(s.sla);
      }
    } finally {
      setLoading(false);
    }
  }

  function showSaved(msg: string) {
    setSavedMsg(msg);
    setTimeout(() => setSavedMsg(null), 3000);
  }

  async function saveClinic() {
    setSavingClinic(true);
    try {
      await api.patch("/admin/settings/clinic", clinic);
      showSaved("Dados da clínica salvos.");
    } catch {
      alert("Erro ao salvar.");
    } finally {
      setSavingClinic(false);
    }
  }

  async function saveSla() {
    setSavingSla(true);
    try {
      await api.patch("/admin/settings/sla", sla);
      showSaved("SLA atualizado.");
    } catch {
      alert("Erro ao salvar.");
    } finally {
      setSavingSla(false);
    }
  }

  async function setupWhatsAppWebhook() {
    setSettingWhatsappWebhook(true);
    setWhatsappWebhookResult(null);
    try {
      const { data } = await api.post("/admin/setup/whatsapp-webhook");
      if (data.success) {
        setWhatsappWebhookResult(`Webhook registrado: ${data.webhook_url}`);
      } else {
        setWhatsappWebhookResult("Falha ao registrar webhook. Verifique as variáveis EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE_NAME.");
      }
    } catch {
      setWhatsappWebhookResult("Erro ao conectar com o servidor.");
    } finally {
      setSettingWhatsappWebhook(false);
    }
  }

  async function setupTelegramWebhook() {
    setSettingWebhook(true);
    setWebhookResult(null);
    try {
      const { data } = await api.post("/admin/setup/telegram-webhook");
      if (data.success) {
        setWebhookResult(`Webhook registrado: ${data.webhook_url}`);
      } else {
        setWebhookResult("Falha ao registrar webhook. Verifique o TELEGRAM_BOT_TOKEN.");
      }
    } catch {
      setWebhookResult("Erro ao conectar com o servidor.");
    } finally {
      setSettingWebhook(false);
    }
  }

  if (loading) return <div className="p-8 text-parchment-faint">Carregando...</div>;

  return (
    <main className="p-8 max-w-2xl">
      <h1 className="text-2xl font-display font-semibold text-parchment mb-6">Configurações</h1>

      {savedMsg && (
        <div className="mb-4 bg-jade/15 border border-jade/40 text-jade text-sm px-4 py-2 rounded-sm">
          {savedMsg}
        </div>
      )}

      <div className="space-y-6">
        {/* Clinic Info */}
        <div className="bg-ink-2 border border-line rounded-sm p-6">
          <h2 className="text-lg font-semibold text-parchment mb-4">Dados da Clínica</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-parchment-dim mb-1">
                Nome da Clínica
              </label>
              <input
                value={clinic.name}
                onChange={(e) => setClinic({ ...clinic, name: e.target.value })}
                className="w-full border border-line rounded-sm px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-parchment-dim mb-1">Fuso horário</label>
              <select
                value={clinic.timezone}
                onChange={(e) => setClinic({ ...clinic, timezone: e.target.value })}
                className="w-full border border-line rounded-sm px-3 py-2 text-sm"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-parchment-dim mb-1">Telefone</label>
              <input
                value={clinic.phone}
                onChange={(e) => setClinic({ ...clinic, phone: e.target.value })}
                placeholder="(11) 99999-9999"
                className="w-full border border-line rounded-sm px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-parchment-dim mb-1">Endereço</label>
              <input
                value={clinic.address}
                onChange={(e) => setClinic({ ...clinic, address: e.target.value })}
                className="w-full border border-line rounded-sm px-3 py-2 text-sm"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-parchment-dim mb-1">
                Logo da Clínica (URL da imagem)
              </label>
              <input
                value={clinic.logo_url}
                onChange={(e) => setClinic({ ...clinic, logo_url: e.target.value })}
                placeholder="https://exemplo.com/logo.png"
                className="w-full border border-line rounded-sm px-3 py-2 text-sm"
              />
              {clinic.logo_url && (
                <img
                  src={clinic.logo_url}
                  alt="Preview"
                  className="mt-2 h-10 w-auto object-contain rounded-sm"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                />
              )}
              <p className="mt-1 text-xs text-parchment-faint">
                Aparece no cabeçalho de todas as telas. Recomendado: fundo transparente, altura 32–48 px.
              </p>
            </div>
          </div>
          <button
            onClick={saveClinic}
            disabled={savingClinic}
            className="mt-4 bg-carimbo text-parchment px-4 py-2 rounded-sm text-sm font-medium hover:bg-carimbo-bright disabled:opacity-50"
          >
            {savingClinic ? "Salvando..." : "Salvar Dados da Clínica"}
          </button>
        </div>

        {/* SLA */}
        <div className="bg-ink-2 border border-line rounded-sm p-6">
          <h2 className="text-lg font-semibold text-parchment mb-2">SLA de Leads</h2>
          <p className="text-sm text-parchment-dim mb-4">
            Tempo máximo para a equipe realizar o primeiro contato com um novo lead.
          </p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={sla.hours}
              onChange={(e) => setSla({ hours: Number(e.target.value) })}
              min={1}
              max={72}
              className="w-24 border border-line rounded-sm px-3 py-2 text-sm"
            />
            <span className="text-sm text-parchment-dim">horas</span>
            <button
              onClick={saveSla}
              disabled={savingSla}
              className="ml-4 bg-carimbo text-parchment px-4 py-2 rounded-sm text-sm font-medium hover:bg-carimbo-bright disabled:opacity-50"
            >
              {savingSla ? "Salvando..." : "Salvar SLA"}
            </button>
          </div>
        </div>

        {/* Integration Status */}
        <div className="bg-ink-2 border border-line rounded-sm p-6">
          <h2 className="text-lg font-semibold text-parchment mb-4">Status das Integrações</h2>
          <p className="text-sm text-parchment-dim mb-4">
            Essas integrações são configuradas via variáveis de ambiente no <code className="bg-ink-3 px-1 rounded-sm">.env</code>.
            Para alterar, edite o arquivo e reinicie os containers.
          </p>
          <div className="space-y-3">
            <StatusRow label="Domínio" value={status?.domain || "—"} ok={!!status?.domain} />
            <StatusRow
              label="Telegram Bot Token"
              value={status?.telegram_configured ? "Configurado (.env)" : "Não configurado"}
              ok={!!status?.telegram_configured}
            />
            <StatusRow
              label="OpenAI API Key"
              value={status?.openai_configured ? "Configurado (.env)" : "Não configurado"}
              ok={!!status?.openai_configured}
            />
            <StatusRow
              label="LLM Local (Ollama)"
              value={status?.local_llm_configured ? "Configurado (.env)" : "Não configurado"}
              ok={!!status?.local_llm_configured}
            />
            <StatusRow
              label="WhatsApp (Evolution API)"
              value={status?.whatsapp_configured ? "Configurado (.env)" : "Não configurado"}
              ok={!!status?.whatsapp_configured}
            />
          </div>
          <p className="text-xs text-parchment-faint mt-3">
            O modelo de IA e o provedor podem ser escolhidos na aba "Chatbot / IA".
          </p>
        </div>

        {/* WhatsApp Webhook */}
        {status?.whatsapp_configured && (
          <div className="bg-ink-2 border border-line rounded-sm p-6">
            <h2 className="text-lg font-semibold text-parchment mb-2">WhatsApp Webhook (Evolution API)</h2>
            <p className="text-sm text-parchment-dim mb-4">
              Registre o webhook para que a instância do WhatsApp receba mensagens dos pacientes.
              Esse registro precisa ser feito apenas uma vez (ou ao trocar de domínio/instância).
            </p>
            <button
              onClick={setupWhatsAppWebhook}
              disabled={settingWhatsappWebhook}
              className="bg-carimbo text-parchment px-4 py-2 rounded-sm text-sm font-medium hover:bg-carimbo-bright disabled:opacity-50"
            >
              {settingWhatsappWebhook ? "Registrando..." : "Registrar Webhook WhatsApp"}
            </button>
            {whatsappWebhookResult && (
              <p className="mt-3 text-sm text-parchment-dim">{whatsappWebhookResult}</p>
            )}
          </div>
        )}

        {/* Telegram Webhook */}
        {status?.telegram_configured && (
          <div className="bg-ink-2 border border-line rounded-sm p-6">
            <h2 className="text-lg font-semibold text-parchment mb-2">Telegram Webhook</h2>
            <p className="text-sm text-parchment-dim mb-4">
              Registre o webhook para que o bot Telegram receba mensagens dos pacientes.
              Esse registro precisa ser feito apenas uma vez (ou ao trocar de domínio).
            </p>
            <button
              onClick={setupTelegramWebhook}
              disabled={settingWebhook}
              className="bg-carimbo text-parchment px-4 py-2 rounded-sm text-sm font-medium hover:bg-carimbo-bright disabled:opacity-50"
            >
              {settingWebhook ? "Registrando..." : "Registrar Webhook Telegram"}
            </button>
            {webhookResult && (
              <p className="mt-3 text-sm text-parchment-dim">{webhookResult}</p>
            )}
          </div>
        )}

        {/* Instructions */}
        <div className="bg-ink-2/30 border border-line rounded-sm p-6">
          <h2 className="text-lg font-semibold text-parchment mb-2">Guia Rápido</h2>
          <ol className="text-sm text-parchment-dim space-y-2 list-decimal list-inside">
            <li>
              Configure as variáveis de ambiente no{" "}
              <code className="bg-ink-3 px-1 rounded-sm">.env</code>{" "}
              (TELEGRAM_BOT_TOKEN, OPENAI_API_KEY)
            </li>
            <li>
              Reinicie os containers:{" "}
              <code className="bg-ink-3 px-1 rounded-sm">docker compose up -d</code>
            </li>
            <li>Preencha os dados da clínica acima e salve</li>
            <li>Vá em "Chatbot / IA" para escolher o modelo e personalizar o prompt</li>
            <li>Registre o webhook do Telegram (botão acima)</li>
            <li>Teste enviando uma mensagem para o bot no Telegram</li>
          </ol>
        </div>
      </div>
    </main>
  );
}

function StatusRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-parchment-dim">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-parchment">{value}</span>
        <span className={`w-2.5 h-2.5 rounded-full ${ok ? "bg-jade" : "bg-parchment-faint"}`} />
      </div>
    </div>
  );
}
