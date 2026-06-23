import { createServiceClient } from "@/lib/supabase/server";

interface AuditInput {
  user_id: string;
  entity_type: string;
  entity_id?: string | null;
  // Phase 1 verbs plus the regulated-engine verbs (propose/approve/reject/fill).
  // Must stay in sync with the audit_log.action CHECK constraint in migration 03.
  action: "create" | "update" | "delete" | "import" | "propose" | "approve" | "reject" | "fill";
  before_state?: unknown;
  after_state?: unknown;
}

// Write an audit_log row through the service-role client so RLS doesn't
// block the insert. Errors are logged but never thrown — audit failure
// must not bubble up and break the user action.
export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    const admin = createServiceClient();
    const { error } = await admin.from("audit_log").insert({
      user_id: input.user_id,
      entity_type: input.entity_type,
      entity_id: input.entity_id ?? null,
      action: input.action,
      before_state: input.before_state ?? null,
      after_state: input.after_state ?? null,
    });
    if (error) console.error("writeAudit failed", error);
  } catch (err) {
    console.error("writeAudit threw", err);
  }
}
