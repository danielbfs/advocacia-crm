"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { AppHeader } from "@/components/app-header";
import { useTier } from "@/lib/tier";
import {
  LayoutDashboard, Calendar, Users, Inbox, Bot, BrainCircuit, Clock,
  PieChart, UserCircle, Stethoscope, Activity, Shield, MessageCircle, Settings,
  Scale, LucideIcon
} from "lucide-react";

type NavItem = 
  | { href: string; label: string; icon: LucideIcon; advancedOnly?: boolean; heading?: never }
  | { heading: string; href?: never; label?: never; icon?: never; advancedOnly?: boolean };

const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "Painel", icon: LayoutDashboard },
  { href: "/admin/calendar", label: "Agenda da Clínica", icon: Calendar },
  { href: "/admin/leads", label: "Leads", icon: Users },

  { heading: "Automações" },
  { href: "/admin/shared-inbox", label: "Caixa Compartilhada", icon: Inbox },
  { href: "/admin/chatbot", label: "Chatbot / IA", icon: Bot },
  { href: "/admin/ia-comercial", label: "Atendente IA", icon: BrainCircuit },
  { href: "/admin/follow-ups", label: "Follow-ups", icon: Clock },
  
  { heading: "Relatórios" },
  { href: "/admin/reports", label: "Funil de Leads", icon: PieChart },
  
  { heading: "Cadastros" },
  { href: "/admin/patients", label: "Pacientes", icon: UserCircle },
  { href: "/admin/doctors", label: "Médicos", icon: Stethoscope },
  { href: "/admin/specialties", label: "Especialidades", icon: Activity },
  { href: "/admin/users", label: "Usuários", icon: Shield },
  
  { heading: "Sistema" },
  { href: "/admin/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { href: "/admin/setup", label: "Configurações", icon: Settings },
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
      <div className="min-h-screen bg-ink flex flex-col font-sans">
        {tier !== "basic" && <AppHeader />}
        <div className="flex flex-1 overflow-hidden">
          <nav className="w-64 border-r border-line flex flex-col z-10">
            <div className="flex items-center gap-2.5 px-5 py-5">
              <span className="grid size-8 place-items-center rounded-sm bg-carimbo">
                <Scale className="size-4 text-parchment" strokeWidth={1.5} />
              </span>
              <span className="font-mono text-sm tracking-[0.2em] text-parchment uppercase">
                Advoca<span className="text-carimbo">IA</span>
                <span className="text-parchment-faint"> · CRM</span>
              </span>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-6 space-y-1 custom-scrollbar">
              {filteredNavItems.map((item, idx) => {
                if (item.heading) {
                  return (
                    <div key={`h-${idx}`} className="pt-6 pb-2 px-3 font-mono text-[11px] uppercase tracking-widest text-parchment-faint">
                      {item.heading}
                    </div>
                  );
                }
                const { href, label, icon: Icon } = item;
                const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href as string);
                return (
                  <Link
                    key={href}
                    href={href as string}
                    className={`relative flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm transition-colors ${
                      active
                        ? "bg-ink-3 text-parchment"
                        : "text-parchment-dim hover:bg-ink-2 hover:text-parchment"
                    }`}
                  >
                    {active && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-carimbo" />}
                    {Icon && <Icon size={18} strokeWidth={1.5} className={active ? "text-carimbo" : "text-parchment-dim"} />}
                    {label}
                  </Link>
                );
              })}
            </div>
          </nav>
          <div className="flex-1 overflow-x-hidden overflow-y-auto bg-ink-2/30">{children}</div>
        </div>
      </div>
    </AuthGuard>
  );
}

