"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { user, isAuthenticated, isLoading, loadUser, changePassword } = useAuth();
  const router = useRouter();

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 6) {
      setError("A nova senha deve ter no mínimo 6 caracteres.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("As senhas não conferem.");
      return;
    }

    setLoading(true);

    try {
      await changePassword(currentPassword, newPassword);
      const { user } = useAuth.getState();
      if (user?.role === "admin") {
        router.push("/admin");
      } else {
        router.push("/secretary");
      }
    } catch {
      setError("Senha atual incorreta.");
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink">
        <div className="text-parchment-faint">Carregando...</div>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink p-4">
      <div className="w-full max-w-sm bg-ink-2 rounded-sm border border-line p-8">
        <h1 className="text-2xl font-display font-semibold text-parchment mb-2">Alterar Senha</h1>
        <p className="text-parchment-dim text-sm mb-6">
          {user?.must_change_password
            ? "Você precisa alterar sua senha antes de continuar."
            : "Digite sua senha atual e a nova senha."}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="currentPassword" className="block font-mono text-[10px] tracking-[0.2em] uppercase text-parchment-dim mb-1">
              Senha atual
            </label>
            <input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 border border-line bg-ink/60 rounded-sm text-sm text-parchment placeholder:text-parchment-faint focus:outline-none focus:ring-1 focus:ring-carimbo focus:border-carimbo"
              required
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="newPassword" className="block font-mono text-[10px] tracking-[0.2em] uppercase text-parchment-dim mb-1">
              Nova senha
            </label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 border border-line bg-ink/60 rounded-sm text-sm text-parchment placeholder:text-parchment-faint focus:outline-none focus:ring-1 focus:ring-carimbo focus:border-carimbo"
              placeholder="Mínimo 6 caracteres"
              required
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block font-mono text-[10px] tracking-[0.2em] uppercase text-parchment-dim mb-1">
              Confirmar nova senha
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 border border-line bg-ink/60 rounded-sm text-sm text-parchment placeholder:text-parchment-faint focus:outline-none focus:ring-1 focus:ring-carimbo focus:border-carimbo"
              required
            />
          </div>

          {error && (
            <p className="text-carimbo-bright text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-carimbo text-parchment py-2 px-4 rounded-sm text-sm font-semibold hover:bg-carimbo-bright active:translate-y-px transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Alterando..." : "Alterar Senha"}
          </button>
        </form>
      </div>
    </main>
  );
}
