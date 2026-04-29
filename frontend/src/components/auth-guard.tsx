"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useTier } from "@/lib/tier";
import type { UserRole } from "@/types";

interface AuthGuardProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export function AuthGuard({ children, allowedRoles }: AuthGuardProps) {
  const { user, isLoading: isAuthLoading, isAuthenticated, loadUser } = useAuth();
  const { tier, isLoading: isTierLoading, loadTier } = useTier();
  const router = useRouter();

  useEffect(() => {
    loadUser();
    loadTier();
  }, [loadUser, loadTier]);

  const isLoading = isAuthLoading || isTierLoading;

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }

    if (allowedRoles && user && !allowedRoles.includes(user.role)) {
      const destination =
        user.role === "admin" ? "/admin" :
        user.role === "doctor" ? "/doctor" :
        "/secretary";
      router.replace(destination);
      return;
    }

    if (user?.must_change_password) {
      router.replace("/change-password");
      return;
    }
  }, [isLoading, isAuthenticated, user, allowedRoles, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-400">Carregando...</div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return null;
  }

  if (user.must_change_password) {
    return null;
  }

  return <>{children}</>;
}
