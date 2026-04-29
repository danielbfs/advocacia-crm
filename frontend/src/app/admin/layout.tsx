"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { AppHeader } from "@/components/app-header";
import { useTier } from "@/lib/tier";

type NavItem = 
  | { href: string; label: string; advancedOnly?: boolean; heading?: never }
  | { heading: string; href?: never; label?: never; advancedOnly?: boolean };

const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "Painel" },
  { href: "/admin/calendar", label: "Agenda da Clínica" },
  { href: "/admin/leads", label: "Leads" },

  { heading: "Automações" },
  { href: "/admin/shared-inbox", label: "Caixa Compartilhada" },
  { href: "/admin/chatbot", label: "Chatbot / IA" },
  { href: "/admin/ia-comercial", label: "Atendente IA" },
  { href: "/admin/follow-ups", label: "Follow-ups" },
  
  { heading: "Relatórios" },
  { href: "/admin/reports", label: "Funil de Leads" },
  
  { heading: "Cadastros" },
  { href: "/admin/patients", label: "Pacientes" },
  { href: "/admin/doctors", label: "Médicos / Horários" },
  { href: "/admin/specialties", label: "Especialidades" },
  { href: "/admin/users", label: "Usuários" },
  
  { heading: "Sistema" },
  { href: "/admin/whatsapp", label: "WhatsApp" },
  { href: "/admin/setup", label: "Configurações" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { tier } = useTier();

  const filteredNavItems = NAV_ITEMS.filter((item) => {
    if (tier === "basic" && item.advancedOnly) return false;
    return true;
  });

  return (
    <AuthGuard allowedRoles={["admin"]}>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {tier !== "basic" && <AppHeader />}
        <div className="flex flex-1">
          <nav className="w-56 bg-white border-r p-4 space-y-1 overflow-y-auto">
            {filteredNavItems.map((item, idx) => {
              if (item.heading) {
                return (
                  <div key={`h-${idx}`} className="pt-4 pb-1 px-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    {item.heading}
                  </div>
                );
              }
              const { href, label } = item;
              const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href as string);
              return (
                <Link
                  key={href}
                  href={href as string}
                  className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                    active
                      ? "bg-blue-50 text-blue-700 font-medium"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="flex-1 overflow-x-hidden">{children}</div>
        </div>
      </div>
    </AuthGuard>
  );
}

