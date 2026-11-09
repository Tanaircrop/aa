import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Admin API for the Louvre V+A Photo Game dashboard.
// Auth: header x-admin-token must match the value stored in public.lva_settings (key = 'admin_token').
// Uses the service role, so RLS does not apply here; nothing is readable through the public API otherwise.
// Deployed with verify_jwt = false (the token check above is the authentication).

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: setting } = await supabase.from("lva_settings").select("value").eq("key", "admin_token").maybeSingle();
  const token = req.headers.get("x-admin-token") ?? "";
  if (!setting || !token || token !== setting.value) return json({ error: "unauthorized" }, 401);

  const withUrls = async (rows: Record<string, unknown>[]) => {
    const paths = rows.map((r) => r.path as string);
    const urls = new Map<string, string>();
    for (let i = 0; i < paths.length; i += 100) {
      const signed = await supabase.storage.from("lva-photos").createSignedUrls(paths.slice(i, i + 100), 3600);
      for (const s of signed.data ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
    }
    return rows.map((r) => ({ ...r, url: urls.get(r.path as string) ?? null }));
  };

  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "overview";
  if (action === "overview") {
    const since = new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString();
    const [devices, results, counts] = await Promise.all([
      supabase.from("lva_devices").select("*").gte("updated_at", since).order("updated_at", { ascending: false }),
      supabase.from("lva_results").select("*").order("finished_at", { ascending: false }).limit(200),
      supabase.from("lva_photos").select("device_id", { count: "exact", head: true }),
    ]);
    return json({ devices: devices.data ?? [], results: results.data ?? [], photoCount: counts.count ?? 0, now: new Date().toISOString() });
  }
  if (action === "photos") {
    const device = url.searchParams.get("device_id");
    if (!device) return json({ error: "device_id required" }, 400);
    const { data: rows } = await supabase.from("lva_photos").select("*").eq("device_id", device).order("created_at", { ascending: true });
    return json({ photos: await withUrls(rows ?? []) });
  }
  if (action === "all_photos") {
    // every photo of the current class, for automatic grading on the dashboard (metadata + strokes + note + signed URL)
    const { data: rows } = await supabase.from("lva_photos").select("*").order("created_at", { ascending: true }).limit(2000);
    return json({ photos: await withUrls(rows ?? []) });
  }
  if (action === "reset" && req.method === "POST") {
    // clears the live board (devices + results + photo rows + files) for a new class; requires ?confirm=yes
    if (url.searchParams.get("confirm") !== "yes") return json({ error: "confirm=yes required" }, 400);
    const { data: rows } = await supabase.from("lva_photos").select("path");
    const paths = (rows ?? []).map((r) => r.path);
    for (let i = 0; i < paths.length; i += 100) await supabase.storage.from("lva-photos").remove(paths.slice(i, i + 100));
    await supabase.from("lva_photos").delete().neq("id", "");
    await supabase.from("lva_results").delete().neq("device_id", "");
    await supabase.from("lva_devices").delete().neq("device_id", "");
    return json({ ok: true, removed: paths.length });
  }
  return json({ error: "unknown action" }, 404);
});
