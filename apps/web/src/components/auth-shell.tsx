import type { ReactNode } from "react";
import { Brand } from "./brand";

interface AuthShellProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}

/** Split-screen layout of the login and register pages: brand panel on the left, form on the right. */
export function AuthShell({ eyebrow, title, subtitle, children }: AuthShellProps) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      <aside className="bg-primary flex flex-col justify-between gap-10 p-8 lg:p-12">
        <Brand inverted />
        <div className="max-w-lg">
          <span className="bg-surface text-warning-ink rounded-badge inline-block px-2.5 py-1 text-xs font-extrabold tracking-wide uppercase">
            Învață cu încredere
          </span>
          <p className="mt-5 text-4xl leading-tight font-extrabold text-white lg:text-5xl">
            Un spațiu de învățare construit în jurul progresului.
          </p>
          <p className="mt-5 text-lg text-white/80">
            Clase, evaluări, resurse și explicații AI într-o experiență coerentă.
          </p>
        </div>
        <p className="hidden text-sm text-white/70 lg:block">
          Creat pentru profesori și elevi din România.
        </p>
      </aside>
      <main className="bg-surface flex items-center justify-center p-6 lg:p-12">
        <section className="w-full max-w-md">
          <p className="text-primary text-xs font-extrabold tracking-wide uppercase">{eyebrow}</p>
          <h1 className="mt-1 mb-1">{title}</h1>
          <p className="text-ink-3 mb-6">{subtitle}</p>
          {children}
        </section>
      </main>
    </div>
  );
}
