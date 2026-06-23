import LoginForm from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 rounded-2xl bg-card p-6 border border-line shadow-sm">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-surface-2 text-ink font-bold">
            T
          </div>
          <div>
            <p className="text-lg font-semibold text-ink">Thor</p>
            <p className="text-xs text-muted">Trade journal</p>
          </div>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
