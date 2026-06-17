import PasswordForm from "@/components/PasswordForm";

export const dynamic = "force-dynamic";

export default function PasswordPage() {
  return (
    <div className="space-y-4 pb-8">
      <h1 className="text-lg font-semibold text-slate-100">Change password</h1>
      <div className="max-w-md rounded-2xl bg-[var(--surface)] p-4 ring-1 ring-[var(--border)]">
        <PasswordForm />
      </div>
    </div>
  );
}
