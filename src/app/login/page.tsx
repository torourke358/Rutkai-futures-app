import LoginForm from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 rounded-2xl bg-[var(--surface)] p-6 ring-1 ring-[var(--border)] shadow-xl">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-indigo-500/15 text-indigo-300 font-bold">
            T
          </div>
          <div>
            <p className="text-lg font-semibold text-slate-100">Thor</p>
            <p className="text-xs text-slate-400">Trade journal</p>
          </div>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
