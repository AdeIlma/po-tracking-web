// Supabase Edge Function: gemini-total
// Menerima {prompt, images:[{mime,data(base64)}], model?} dari halaman (user harus login),
// memanggil Gemini dengan GEMINI_API_KEY yang disimpan rahasia di server, dan mengembalikan JSON hasil.
//
// Deploy:
//   supabase functions deploy gemini-total
//   supabase secrets set GEMINI_API_KEY=AIza...   (opsional: GEMINI_MODEL=gemini-2.5-flash)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // 1) hanya user yang login
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    // 2) payload
    const { prompt, images = [], model } = await req.json();
    if (!prompt || !Array.isArray(images) || !images.length) return json({ error: "prompt & images wajib" }, 400);
    if (images.length > 8) return json({ error: "maks 8 gambar" }, 400);

    const key = Deno.env.get("GEMINI_API_KEY");
    if (!key) return json({ error: "GEMINI_API_KEY belum di-set (supabase secrets set GEMINI_API_KEY=...)" }, 500);
    const mdl = model || Deno.env.get("GEMINI_MODEL") || "gemini-3.8-flash";

    // 3) panggil Gemini
    const body = {
      contents: [{ role: "user", parts: [{ text: prompt }, ...images.map((i: any) => ({ inline_data: { mime_type: i.mime || "image/jpeg", data: i.data } }))] }],
      generationConfig: { response_mime_type: "application/json", temperature: 0 },
    };
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${mdl}:generateContent?key=${key}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (!r.ok) return json({ error: `Gemini ${r.status}: ${(await r.text()).slice(0, 300)}` }, 502);
    const j = await r.json();
    const txt = (j.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("");
    let out: unknown = null;
    try { out = JSON.parse(txt); } catch { const m = txt.match(/\{[\s\S]*\}/); out = m ? JSON.parse(m[0]) : { total: null, note: txt.slice(0, 200) }; }
    return json(out, 200);
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
