import type { ReactNode } from "react";
import type { VisualVariant } from "@/types/domain";
import { cn } from "@/lib/utils";

const variantClasses: Record<VisualVariant, string> = {
  loading: "border-neutral-200 bg-white text-neutral-700",
  empty: "border-neutral-200 bg-white text-neutral-700",
  success: "border-black bg-white text-black",
  warning: "border-neutral-300 bg-white text-neutral-800",
  error: "border-black bg-white text-black",
};

interface StatusCardProps {
  title: string;
  eyebrow?: string;
  variant?: VisualVariant;
  children: ReactNode;
  className?: string;
}

export function StatusCard({
  title,
  eyebrow,
  variant = "empty",
  children,
  className,
}: StatusCardProps) {
  return (
    <section className={cn("rounded-[32px] border p-5 shadow-[0_18px_60px_rgba(0,0,0,0.08)]", variantClasses[variant], className)}>
      {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.25em] opacity-70">{eyebrow}</p> : null}
      <h2 className="font-geist mt-2 text-lg font-semibold text-black">{title}</h2>
      <div className="mt-4 text-sm leading-6 text-neutral-600">{children}</div>
    </section>
  );
}
