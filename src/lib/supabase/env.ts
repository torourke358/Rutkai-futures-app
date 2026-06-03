// Strip ALL whitespace from a config value. A long key pasted into an env
// dashboard can pick up stray spaces or newlines — even mid-string — which
// make fetch reject the auth header. Supabase URLs/keys never contain
// whitespace, so removing it all is safe.
export const cleanEnv = (v: string | undefined): string =>
  (v ?? "").replace(/\s/g, "");
