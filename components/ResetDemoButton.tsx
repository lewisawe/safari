"use client";

/**
 * components/ResetDemoButton.tsx — quiet outlined "Reset demo" action.
 *
 * POSTs /api/demo/reset, which puts both seeded contradictions back to
 * unresolved (same gate reset as the seed) so the next visitor sees the gate
 * fire instead of "carried forward". `onReset` runs after a successful reset
 * (the /solver page clears its results there).
 */

import { useState } from "react";

type ResetStatus =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "done" }
  | { kind: "error"; message: string };

export function ResetDemoButton({
  onReset,
  disabled = false,
}: {
  onReset?: () => void;
  disabled?: boolean;
}) {
  const [status, setStatus] = useState<ResetStatus>({ kind: "idle" });

  async function reset() {
    setStatus({ kind: "busy" });
    try {
      const res = await fetch("/api/demo/reset", { method: "POST" });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; message?: string }
        | null;
      if (res.ok && data?.ok === true) {
        setStatus({ kind: "done" });
        onReset?.();
      } else {
        setStatus({
          kind: "error",
          message: data?.message ?? "Could not reset the demo right now.",
        });
      }
    } catch {
      setStatus({ kind: "error", message: "Could not reset the demo right now." });
    }
  }

  const note =
    status.kind === "done"
      ? "Done. Both contradictions are unresolved again, so the gate will fire on the next run."
      : status.kind === "error"
        ? status.message
        : "Puts both seeded contradictions (ANA 85k vs 90k, VS 25k vs 20k) back to unresolved so the gate fires again.";

  return (
    <div className="flex flex-col items-start gap-[var(--spacing-8)] sm:flex-row sm:items-center sm:gap-[var(--spacing-16)]">
      <button
        type="button"
        onClick={() => void reset()}
        disabled={disabled || status.kind === "busy"}
        className="inline-flex items-center whitespace-nowrap rounded-[var(--radius-full)] border border-[color-mix(in_srgb,var(--color-outlined-action)_55%,transparent)] bg-transparent px-[var(--spacing-16)] py-[var(--spacing-8)] font-[family-name:var(--font-jobytext)] text-[length:var(--text-body-sm)] font-medium tracking-[var(--tracking-body-sm)] text-[var(--color-outlined-action)] transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-outlined-action)] disabled:cursor-default disabled:opacity-55"
      >
        {status.kind === "busy" ? "Resetting…" : "Reset demo"}
      </button>
      <p
        role="status"
        className="m-0 font-[family-name:var(--font-jobytext)] text-[length:var(--text-caption)] font-[450] tracking-[var(--tracking-caption)] text-[color-mix(in_srgb,var(--color-carbon-ink)_65%,transparent)]"
      >
        {note}
      </p>
    </div>
  );
}
