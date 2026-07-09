"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Scale, ArrowRight, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(username, password);
      const { user } = useAuth.getState();

      if (user?.must_change_password) {
        router.push("/change-password");
      } else if (user?.role === "admin") {
        router.push("/admin");
      } else if (user?.role === "lawyer") {
        router.push("/lawyer");
      } else {
        router.push("/secretary");
      }
    } catch {
      setError("Usuário ou senha inválidos.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_0.95fr]">
      {/* ───────────────────────── Tese editorial ───────────────────────── */}
      <section className="relative hidden overflow-hidden bg-ink px-12 py-14 lg:flex lg:flex-col lg:justify-between xl:px-20">
        <div className="pointer-events-none absolute inset-y-0 left-[4.25rem] w-px bg-carimbo/55" />
        <div className="pointer-events-none absolute inset-y-0 left-[4.5rem] w-px bg-carimbo/15" />

        <span
          className="pointer-events-none absolute -right-10 bottom-16 select-none font-mono text-[7rem] font-medium leading-none text-parchment/[0.03] xl:text-[9rem]"
          aria-hidden
        >
          LEAD-2026
          <br />
          #004821
        </span>

        <header className="animate-rise flex items-center gap-3 pl-8">
          <span className="grid size-9 place-items-center rounded-sm bg-carimbo">
            <Scale className="size-5 text-parchment" strokeWidth={1.5} />
          </span>
          <span className="font-mono text-xs tracking-[0.3em] text-parchment-dim uppercase">
            Advoca<span className="text-carimbo">IA</span> · CRM
          </span>
        </header>

        <div className="animate-rise pl-8" style={{ animationDelay: "120ms" }}>
          <p className="mb-6 font-mono text-xs tracking-[0.35em] text-selo uppercase">Pipeline sob controle</p>
          <h1 className="max-w-xl font-display text-5xl leading-[1.05] font-semibold text-parchment xl:text-6xl">
            Do primeiro contato
            <br />
            ao <em className="text-carimbo">contrato assinado.</em>
          </h1>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-parchment-dim">
            Todo lead atendido no prazo, toda proposta acompanhada. O funil comercial do
            escritório inteiro — leads, negociações e conversões — em um só painel.
          </p>
        </div>

        <div className="animate-rise pl-8 max-w-md" style={{ animationDelay: "180ms" }}>
          <div className="rounded-sm border border-line bg-ink-2/30 p-5 backdrop-blur-sm">
            <div className="flex gap-3">
              <div className="shrink-0 mt-0.5 text-selo">
                <Scale className="size-4" strokeWidth={1.5} />
              </div>
              <div>
                <h3 className="font-mono text-xs tracking-wider text-parchment uppercase font-semibold">LGPD & Uso Ético de IA</h3>
                <p className="mt-2 text-xs text-parchment-dim leading-relaxed">
                  Este sistema opera em conformidade com a LGPD (Lei 13.709/2018). O atendimento
                  por IA registra as conversas para fins comerciais, não fornece aconselhamento
                  jurídico e transfere o contato a um advogado sempre que necessário.
                </p>
              </div>
            </div>
          </div>
        </div>

        <footer className="animate-rise flex items-end justify-between pl-8" style={{ animationDelay: "240ms" }}>
          <Seal />
          <p className="font-mono text-[10px] tracking-wider text-parchment-faint uppercase">
            Gestão comercial · Vendas & Leads
          </p>
        </footer>
      </section>

      {/* ───────────────────────── Credenciais ──────────────────────────── */}
      <section className="flex items-center justify-center bg-ink-2/40 px-6 py-12 sm:px-10">
        <div className="animate-rise w-full max-w-sm" style={{ animationDelay: "120ms" }}>
          <div className="mb-10 flex items-center gap-2.5 lg:hidden">
            <span className="grid size-8 place-items-center rounded-sm bg-carimbo">
              <Scale className="size-4 text-parchment" strokeWidth={1.5} />
            </span>
            <span className="font-mono text-xs tracking-[0.3em] text-parchment-dim uppercase">
              Advoca<span className="text-carimbo">IA</span> · CRM
            </span>
          </div>

          <h2 className="font-display text-3xl font-semibold text-parchment">Entrar</h2>
          <p className="mt-2 text-sm text-parchment-dim">Acesse o painel comercial do escritório.</p>

          <form onSubmit={handleSubmit} className="mt-9 space-y-5">
            <Field label="Usuário">
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="input"
                required
                autoFocus
              />
            </Field>

            <Field label="Senha">
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input pr-11"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute inset-y-0 right-0 grid w-11 place-items-center text-parchment-faint transition-colors hover:text-parchment"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>

            {error && (
              <p className="rounded-sm border border-carimbo/40 bg-carimbo/10 px-3 py-2 text-sm text-carimbo-bright">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="group flex w-full items-center justify-center gap-2 rounded-sm bg-carimbo px-4 py-3 text-sm font-semibold tracking-wide text-parchment shadow-[0_1px_0_0_rgba(0,0,0,0.4)] transition-all hover:bg-carimbo-bright active:translate-y-px focus-visible:ring-2 focus-visible:ring-carimbo focus-visible:ring-offset-2 focus-visible:ring-offset-ink-2 focus-visible:outline-none disabled:opacity-60"
            >
              {loading ? "Entrando…" : "Entrar"}
              {!loading && <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />}
            </button>
          </form>

          <div className="mt-10 rounded-sm border border-line bg-ink/20 p-4">
            <p className="font-mono text-[9px] text-parchment-dim leading-normal">
              <strong className="text-selo font-bold uppercase tracking-wider">Conformidade LGPD:</strong> O
              processamento de dados por IA neste painel ocorre exclusivamente em redes locais dedicadas
              sob criptografia.
            </p>
          </div>
        </div>
      </section>

      <style>{`
        .input {
          width: 100%;
          border-radius: 2px;
          border: 1px solid var(--color-line);
          background-color: color-mix(in srgb, var(--color-ink) 60%, transparent);
          padding: 0.7rem 0.85rem;
          font-size: 0.9rem;
          color: var(--color-parchment);
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .input::placeholder { color: var(--color-parchment-faint); }
        .input:focus {
          outline: none;
          border-color: var(--color-carimbo);
          box-shadow: 0 0 0 1px var(--color-carimbo);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block font-mono text-[10px] tracking-[0.2em] text-parchment-dim uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}

function Seal() {
  return (
    <div className="relative grid size-20 place-items-center rounded-full border border-selo/50">
      <div className="absolute inset-1.5 rounded-full border border-selo/25" />
      <Scale className="size-6 text-selo" strokeWidth={1.25} />
      <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 translate-y-full pt-1.5 font-mono text-[9px] tracking-[0.2em] text-parchment-faint uppercase">
        MMXXVI
      </span>
    </div>
  );
}
