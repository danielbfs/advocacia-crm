"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function Home() {
  const { user, isLoading, isAuthenticated, loadUser } = useAuth();
  const router = useRouter();

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  useEffect(() => {
    if (isLoading) return;

    if (isAuthenticated && user) {
      if (user.must_change_password) {
        router.replace("/change-password");
      } else if (user.role === "admin") {
        router.replace("/admin");
      } else if (user.role === "lawyer") {
        router.replace("/lawyer");
      } else {
        router.replace("/secretary");
      }
    }
  }, [isLoading, isAuthenticated, user, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink">
        <div className="text-parchment-faint">Carregando...</div>
      </div>
    );
  }

  // Só mostra esta tela se NÃO estiver autenticado
  if (isAuthenticated) return null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-ink">
      <div className="text-center">
        <h1 className="text-4xl font-display font-semibold text-parchment mb-4">
          Open Clinic AI
        </h1>
        <p className="text-parchment-dim mb-8">
          Sistema open-source de gestão para clínicas
        </p>
        <a
          href="/login"
          className="inline-block bg-carimbo text-parchment px-6 py-3 rounded-sm hover:bg-carimbo-bright active:translate-y-px transition-colors"
        >
          Entrar
        </a>
      </div>
    </main>
  );
}
