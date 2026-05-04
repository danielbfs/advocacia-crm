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

  if (loading) return <div className="p-8 text-gray-400">Carregando...</div>;

  return (
    <main className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">WhatsApp</h1>

      <div className="space-y-6">

        {/* Status do serviço */}
        <div className="bg-white border rounded-lg p-6">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Evolution API</h2>
            <button
              onClick={fetchAll}
              className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
            >
              <RefreshCw size={12} /> Verificar
            </button>
          </div>
          {online === null ? (
            <span className="text-sm text-gray-400">Verificando...</span>
          ) : online ? (
            <div className="flex items-center gap-2 text-green-700">
              <Wifi size={18} className="text-green-500" />
              <span className="text-sm font-medium">Serviço online</span>
            </div>
          ) : (
            <div className="flex items-start gap-2 text-red-600">
              <WifiOff size={18} className="text-red-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Serviço offline</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Aguarde o container <code className="bg-gray-100 px-1 rounded">evolution_api</code> iniciar
                  (pode levar ~30s na primeira vez).
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Criar instância */}
        {online && (
          <div className="bg-white border rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Nova Instância</h2>
            <p className="text-sm text-gray-500 mb-4">
              Crie uma instância e escaneie o QR Code com o WhatsApp da clínica.
            </p>
            <div className="flex gap-3">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createInstance()}
                placeholder="Nome da instância (ex: openclinic)"
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                disabled={creating}
              />
              <button
                onClick={createInstance}
                disabled={creating || !newName.trim()}
                className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
              >
                <Plus size={16} />
                {creating ? "Criando..." : "Criar"}
              </button>
            </div>

            {/* QR Code Display Area */}
            {qrInstance && (
              <div className="mt-8 pt-8 border-t flex flex-col items-center">
                <div className="text-center mb-4">
                  <h3 className="font-semibold text-gray-900">Conectar: {qrInstance}</h3>
                  <p className="text-sm text-gray-500">Escaneie o código abaixo com seu WhatsApp</p>
                </div>

                {connected ? (
                  <div className="flex flex-col items-center gap-3 py-8 animate-in fade-in zoom-in duration-500">
                    <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
                      <CheckCircle size={32} />
                    </div>
                    <p className="text-lg font-bold text-green-700">WhatsApp Conectado!</p>
                    <button
                      onClick={() => { setQrCode(null); setQrInstance(null); }}
                      className="text-sm text-gray-500 underline"
                    >
                      Fechar
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="relative group">
                      {!qrCode ? (
                        <div className="w-60 h-60 bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-3">
                          <RefreshCw size={24} className="text-gray-300 animate-spin" />
                          <p className="text-xs text-gray-400">Gerando QR Code...</p>
                        </div>
                      ) : (
                        <img
                          src={qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`}
                          alt="QR Code WhatsApp"
                          className="w-60 h-60 border-4 border-white shadow-xl rounded-xl"
                        />
                      )}
                    </div>
                    <button
                      onClick={refreshQr}
                      className="mt-4 text-sm text-green-600 hover:text-green-700 font-medium flex items-center gap-2 px-4 py-2 bg-green-50 rounded-full transition-colors"
                    >
                      <RefreshCw size={14} /> Atualizar QR Code
                    </button>
                    <p className="text-xs text-gray-400 mt-4 animate-pulse">
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
          <div className="bg-white border rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Instâncias</h2>
              <button
                onClick={fetchAll}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
              >
                <RefreshCw size={12} /> Atualizar
              </button>
            </div>
            <div className="space-y-3">
              {instances.map((inst) => (
                <div
                  key={inst.name}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        inst.status === "open"
                          ? "bg-green-500"
                          : inst.status === "connecting"
                          ? "bg-yellow-400"
                          : "bg-gray-300"
                      }`}
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{inst.name}</p>
                      {inst.phone && (
                        <p className="text-xs text-gray-500">
                          +{inst.phone}
                          {inst.profile_name && ` · ${inst.profile_name}`}
                        </p>
                      )}
                      <p className="text-xs text-gray-400">
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
                        className="text-xs bg-green-50 text-green-600 px-3 py-1 rounded-full font-medium hover:bg-green-100 transition-colors"
                      >
                        Conectar
                      </button>
                    )}
                    <button
                      onClick={() => deleteInstance(inst.name)}
                      disabled={deleting === inst.name}
                      className="p-2 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40"
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
        <div className="bg-gray-50 border rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Como configurar</h2>
          <ol className="text-sm text-gray-600 space-y-2 list-decimal list-inside">
            <li>Aguarde o serviço Evolution API ficar online (até ~30s na primeira inicialização)</li>
            <li>
              Crie uma instância com o nome{" "}
              <code className="bg-gray-200 px-1 rounded">openclinic</code>{" "}
              (ou o valor de <code className="bg-gray-200 px-1 rounded">EVOLUTION_INSTANCE_NAME</code> no .env)
            </li>
            <li>Escaneie o QR Code com o WhatsApp do número da clínica</li>
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
