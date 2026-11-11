// PROTOTYPE — throwaway. Floating variant switcher for UI prototypes.
// Cycles ?variant= with the arrows (or ←/→ keys) and toggles prototype-only params.
import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "~/lib/utils";

interface Toggle {
  param: string;
  options: { value: string | null; label: string }[];
}

export function PrototypeSwitcher({
  variants,
  names,
  toggles = [],
}: {
  variants: string[];
  names?: Record<string, string>;
  toggles?: Toggle[];
}) {
  const [params, setParams] = useSearchParams();
  const current = params.get("variant") ?? variants[0];
  const idx = Math.max(0, variants.indexOf(current));

  function set(param: string, value: string | null) {
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (value === null) next.delete(param);
        else next.set(param, value);
        return next;
      },
      { replace: true, preventScrollReset: true }
    );
  }

  function go(delta: number) {
    set("variant", variants[(idx + delta + variants.length) % variants.length]);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!import.meta.env.DEV) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-full bg-zinc-900 px-2 py-1.5 text-sm text-white shadow-2xl ring-1 ring-white/10">
      <button onClick={() => go(-1)} className="rounded-full p-1 hover:bg-white/15">
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-56 text-center">
        <span className="font-bold">{current}</span>
        {names?.[current] && <span className="text-white/70"> ({names[current]})</span>}
      </span>
      <button onClick={() => go(1)} className="rounded-full p-1 hover:bg-white/15">
        <ChevronRight className="size-4" />
      </button>
      {toggles.map((t) => (
        <div key={t.param} className="flex rounded-full bg-white/10 p-0.5 text-xs">
          {t.options.map((o) => {
            const active = (params.get(t.param) ?? null) === o.value;
            return (
              <button
                key={o.label}
                onClick={() => set(t.param, o.value)}
                className={cn("rounded-full px-2 py-0.5", active ? "bg-white text-zinc-900" : "text-white/70")}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
