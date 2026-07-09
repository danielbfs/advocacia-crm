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
    } else {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, user, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink">
      <div className="text-parchment-faint">Carregando...</div>
    </div>
  );
}
