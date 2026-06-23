import PasswordForm from "@/components/PasswordForm";

export const dynamic = "force-dynamic";

export default function PasswordPage() {
  return (
    <div className="space-y-4 pb-8">
      <h1 className="text-lg font-semibold text-ink">Change password</h1>
      <div className="max-w-md rounded-2xl bg-card p-4 ring-1 ring-line">
        <PasswordForm />
      </div>
    </div>
  );
}
