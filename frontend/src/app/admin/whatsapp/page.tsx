"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import { Wifi, WifiOff, Plus, Trash2, RefreshCw, CheckCircle } from "lucide-react";

interface EvoInstance {
  name: string;
  status: "open" | "close" | "connecting";
  phone?: string;
  profile_name?: string;
}

export default function WhatsAppPage() {
  const [online, setOnline] = useState<boolean | null>(null);
  const [instances, setInstances] = useState<EvoInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrInstance, setQrInstance] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qrRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [statusRes, instancesRes] = await Promise.allSettled([
        api.get("/admin/evolution/status"),
        api.get("/admin/evolution/instances"),
      ]);
      setOnline(statusRes.status === "fulfilled" ? statusRes.value.data.online : false);
      if (instancesRes.status === "fulfilled") setInstances(instancesRes.value.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (qrRefreshRef.current) clearTimeout(qrRefreshRef.current);
    };
  }, [fetchAll]);

  function scheduleQrRefresh(instanceName: string) {
    if (qrRefreshRef.current) clearTimeout(qrRefreshRef.current);
    qrRefreshRef.current = setTimeout(async () => {
      if (!connected) {
        try {
          const { data } = await api.get(`/admin/evolution/instances/${instanceName}/qrcode`);
          if (data.qr_code) {
            setQrCode(data.qr_code);
          }
          scheduleQrRefresh(instanceName);
        } catch {}
      }
    }, 10000); // 10 seconds
  }

  function startPolling(instanceName: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/admin/evolution/instances/${instanceName}/status`);
        if (data.status === "open") {
          setConnected(true);
          setQrCode(null);
          clearInterval(pollRef.current!);
          if (qrRefreshRef.current) clearTimeout(qrRefreshRef.current);
          await fetchAll();
        }
      } catch {}
    }, 3000);
    scheduleQrRefresh(instanceName);
  }

  async function createInstance() {
    if (!newName.trim()) return;
    setCreating(true);
    setConnected(false);
    setQrCode(null);
    try {
      const { data } = await api.post("/admin/evolution/instances", {
        instance_name: newName.trim(),
      });
      setQrCode(data.qr_code);
      setQrInstance(data.instance_name);
      setNewName("");
      startPolling(data.instance_name);
      await fetchAll();
    } catch {
      alert("Erro ao criar instância. Verifique se o serviço Evolution API está online.");
    } finally {
      setCreating(false);
    }
  }

  async function refreshQr() {
    if (!qrInstance) return;
    try {
      const { data } = await api.get(`/admin/evolution/instances/${qrInstance}/qrcode`);
      if (data.qr_code) {
        setQrCode(data.qr_code);
      } else if (data.status === "open") {
        setConnected(true);
        setQrCode(null);
        await fetchAll();
      }
    } catch {
      alert("Erro ao atualizar QR Code.");
    }
  }

  async function showQr(instanceName: string) {
    setQrInstance(instanceName);
    setQrCode(null);
    setConnected(false);
    try {
      const { data } = await api.get(`/admin/evolution/instances/${instanceName}/qrcode`);
      if (data.qr_code) {
        setQrCode(data.qr_code);
        startPolling(instanceName);
      } else if (data.status === "open") {
        alert("Esta instância já está conectada.");
        await fetchAll();
      } else {
        alert("Não foi possível gerar o QR Code no momento. Tente novamente.");
      }
    } catch {
      alert("Erro ao carregar QR Code.");
    }
  }

  async function deleteInstance(name: string) {
    if (!confirm(`Remover instância "${name}"? O WhatsApp será desconectado.`)) return;
    setDeleting(name);
    try {
      await api.delete(`/admin/evolution/instances/${name}`);
      if (qrInstance === name) {
        setQrCode(null);
        setQrInstance(null);
        setConnected(false);
        if (pollRef.current) clearInterval(pollRef.current);
        if (qrRefreshRef.current) clearTimeout(qrRefreshRef.current);
      }
      await fetchAll();
    } catch {
      alert("Erro ao remover instância.");
    } finally {
      setDeleting(null);
    }
  }

  if (loading) return <div className="p-8 text-parchment-faint">Carregando...</div>;

  return (
    <main className="p-8 max-w-2xl">
      <h1 className="text-2xl font-display font-semibold text-parchment mb-6">WhatsApp</h1>

      <div className="space-y-6">

        {/* Status do serviço */}
        <div className="bg-ink-2 border border-line rounded-sm p-6">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold text-parchment">Evolution API</h2>
            <button
              onClick={fetchAll}
              className="text-xs text-parchment-faint hover:text-parchment-dim flex items-center gap-1"
            >
              <RefreshCw size={12} /> Verificar
            </button>
          </div>
          {online === null ? (
            <span className="text-sm text-parchment-faint">Verificando...</span>
          ) : online ? (
            <div className="flex items-center gap-2 text-jade">
              <Wifi size={18} className="text-jade" />
              <span className="text-sm font-medium">Serviço online</span>
            </div>
          ) : (
            <div className="flex items-start gap-2 text-carimbo-bright">
              <WifiOff size={18} className="text-carimbo-bright mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Serviço offline</p>
                <p className="text-xs text-parchment-faint mt-0.5">
                  Aguarde o container <code className="bg-ink-3 px-1 rounded-sm">evolution_api</code> iniciar
                  (pode levar ~30s na primeira vez).
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Criar instância */}
        {online && (
          <div className="bg-ink-2 border border-line rounded-sm p-6">
            <h2 className="text-lg font-semibold text-parchment mb-1">Nova Instância</h2>
            <p className="text-sm text-parchment-dim mb-4">
              Crie uma instância e escaneie o QR Code com o WhatsApp do escritório.
            </p>
            <div className="flex gap-3">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createInstance()}
                placeholder="Nome da instância (ex: openclinic)"
                className="flex-1 border border-line rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-carimbo focus:border-carimbo"
                disabled={creating}
              />
              <button
                onClick={createInstance}
                disabled={creating || !newName.trim()}
                className="bg-carimbo text-parchment px-4 py-2 rounded-sm text-sm font-medium hover:bg-carimbo-bright disabled:opacity-50 flex items-center gap-2"
              >
                <Plus size={16} />
                {creating ? "Criando..." : "Criar"}
              </button>
            </div>

            {/* QR Code Display Area */}
            {qrInstance && (
              <div className="mt-8 pt-8 border-t border-line flex flex-col items-center">
                <div className="text-center mb-4">
                  <h3 className="font-semibold text-parchment">Conectar: {qrInstance}</h3>
                  <p className="text-sm text-parchment-dim">Escaneie o código abaixo com seu WhatsApp</p>
                </div>

                {connected ? (
                  <div className="flex flex-col items-center gap-3 py-8 animate-in fade-in zoom-in duration-500">
                    <div className="w-16 h-16 bg-jade/15 text-jade rounded-full flex items-center justify-center">
                      <CheckCircle size={32} />
                    </div>
                    <p className="text-lg font-display font-semibold text-jade">WhatsApp Conectado!</p>
                    <button
                      onClick={() => { setQrCode(null); setQrInstance(null); }}
                      className="text-sm text-parchment-dim underline"
                    >
                      Fechar
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="relative group">
                      {!qrCode ? (
                        <div className="w-60 h-60 bg-ink-3 border-2 border-dashed border-line rounded-sm flex flex-col items-center justify-center gap-3">
                          <RefreshCw size={24} className="text-parchment-faint animate-spin" />
                          <p className="text-xs text-parchment-faint">Gerando QR Code...</p>
                        </div>
                      ) : (
                        <img
                          src={qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`}
                          alt="QR Code WhatsApp"
                          className="w-60 h-60 border-4 border-parchment rounded-sm"
                        />
                      )}
                    </div>
                    <button
                      onClick={refreshQr}
                      className="mt-4 text-sm text-jade hover:text-jade font-medium flex items-center gap-2 px-4 py-2 bg-jade/15 rounded-full transition-colors"
                    >
                      <RefreshCw size={14} /> Atualizar QR Code
                    </button>
                    <p className="text-xs text-parchment-faint mt-4 animate-pulse">
                      Aguardando leitura no celular...
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Lista de instâncias */}
        {instances.length > 0 && (
          <div className="bg-ink-2 border border-line rounded-sm p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-parchment">Instâncias</h2>
              <button
                onClick={fetchAll}
                className="text-xs text-parchment-faint hover:text-parchment-dim flex items-center gap-1"
              >
                <RefreshCw size={12} /> Atualizar
              </button>
            </div>
            <div className="space-y-3">
              {instances.map((inst) => (
                <div
                  key={inst.name}
                  className="flex items-center justify-between p-3 border border-line rounded-sm"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        inst.status === "open"
                          ? "bg-jade"
                          : inst.status === "connecting"
                          ? "bg-selo"
                          : "bg-parchment-faint"
                      }`}
                    />
                    <div>
                      <p className="text-sm font-medium text-parchment">{inst.name}</p>
                      {inst.phone && (
                        <p className="text-xs text-parchment-dim">
                          +{inst.phone}
                          {inst.profile_name && ` · ${inst.profile_name}`}
                        </p>
                      )}
                      <p className="text-xs text-parchment-faint">
                        {inst.status === "open"
                          ? "Conectado"
                          : inst.status === "connecting"
                          ? "Conectando..."
                          : "Desconectado"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {inst.status !== "open" && (
                      <button
                        onClick={() => showQr(inst.name)}
                        className="text-xs bg-jade/15 text-jade px-3 py-1 rounded-full font-medium hover:bg-jade/25 transition-colors"
                      >
                        Conectar
                      </button>
                    )}
                    <button
                      onClick={() => deleteInstance(inst.name)}
                      disabled={deleting === inst.name}
                      className="p-2 text-parchment-faint hover:text-carimbo-bright transition-colors disabled:opacity-40"
                      title="Remover instância"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Guia */}
        <div className="bg-ink-2/30 border border-line rounded-sm p-6">
          <h2 className="text-lg font-semibold text-parchment mb-3">Como configurar</h2>
          <ol className="text-sm text-parchment-dim space-y-2 list-decimal list-inside">
            <li>Aguarde o serviço Evolution API ficar online (até ~30s na primeira inicialização)</li>
            <li>
              Crie uma instância com o nome{" "}
              <code className="bg-ink-3 px-1 rounded-sm">openclinic</code>{" "}
              (ou o valor de <code className="bg-ink-3 px-1 rounded-sm">EVOLUTION_INSTANCE_NAME</code> no .env)
            </li>
            <li>Escaneie o QR Code com o WhatsApp do número do escritório</li>
            <li>
              Vá em <strong>Configurações</strong> e clique em{" "}
              <strong>Registrar Webhook WhatsApp</strong>
            </li>
            <li>Teste enviando uma mensagem para o número conectado</li>
          </ol>
        </div>

      </div>
    </main>
  );
}
