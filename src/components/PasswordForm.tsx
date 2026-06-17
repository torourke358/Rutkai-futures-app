"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function PasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (password.length < 8) {
      setStatus("error");
      setMessage("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setStatus("error");
      setMessage("Passwords don't match.");
      return;
    }
    setStatus("saving");
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }
    setStatus("done");
    setMessage("Password updated.");
    setPassword("");
    setConfirm("");
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-xs text-slate-400">
        New password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          className="mt-1 w-full rounded-lg bg-[var(--surface-2)] px-3 py-2 text-slate-100 ring-1 ring-[var(--border)]"
        />
      </label>
      <label className="block text-xs text-slate-400">
        Confirm password
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          className="mt-1 w-full rounded-lg bg-[var(--surface-2)] px-3 py-2 text-slate-100 ring-1 ring-[var(--border)]"
        />
      </label>
      <button
        type="submit"
        disabled={status === "saving"}
        className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-60"
      >
        {status === "saving" ? "Saving…" : "Update password"}
      </button>
      {message && (
        <p
          className={`text-xs ${
            status === "error" ? "text-rose-300" : "text-emerald-300"
          }`}
        >
          {message}
        </p>
      )}
    </form>
  );
}
