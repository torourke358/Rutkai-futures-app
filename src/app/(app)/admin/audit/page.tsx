import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

interface AuditRow {
  id: string;
  user_id: string | null;
  entity_type: string;
  entity_id: string | null;
  action: string;
  before_state: unknown;
  after_state: unknown;
  created_at: string;
}

export default async function AuditPage() {
  const role = await getUserRole();
  if (role !== "admin") notFound();

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("audit_log")
    .select("id, user_id, entity_type, entity_id, action, before_state, after_state, created_at")
    .order("created_at", { ascending: false })
    .limit(200)
    .returns<AuditRow[]>();

  return (
    <div className="space-y-4 pb-8">
      <h1 className="text-lg font-semibold text-ink">Audit log</h1>
      <div className="overflow-x-auto rounded-2xl bg-card border border-line shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2 text-left">When</th>
              <th className="px-3 py-2 text-left">Action</th>
              <th className="px-3 py-2 text-left">Entity</th>
              <th className="px-3 py-2 text-left">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(rows ?? []).map((r) => (
              <tr key={r.id} className="align-top hover:bg-surface-2">
                <td className="whitespace-nowrap px-3 py-2 text-muted">
                  {formatDateTime(r.created_at)}
                </td>
                <td className="px-3 py-2">
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium uppercase text-muted">
                    {r.action}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted">
                  {r.entity_type}
                  {r.entity_id ? (
                    <span className="block text-[10px] text-muted">
                      {r.entity_id}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  <details>
                    <summary className="cursor-pointer text-xs text-muted">
                      view
                    </summary>
                    <pre className="mt-1 max-w-md overflow-x-auto rounded-md bg-surface-2 p-2 text-[10px] text-muted">
                      {JSON.stringify(
                        { before: r.before_state, after: r.after_state },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                </td>
              </tr>
            ))}
            {(rows ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-muted">
                  No audit entries.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
