import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://cuapfss.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  if (origin !== "https://cuapfss.github.io") return json({ error: "Origin not allowed." }, 403);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Войдите в клиентский кабинет, чтобы пользоваться помощником." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || publishableKeys.default;
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!supabaseUrl || !anonKey || !openaiKey) return json({ error: "Сервер не настроен. Обратитесь к администратору KOROLEV." }, 503);

  const supabase = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return json({ error: "Сессия недействительна. Войдите в кабинет заново." }, 401);

  let body: { message?: string; image?: string; mode?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Некорректный запрос." }, 400);
  }

  const message = typeof body.message === "string" ? body.message.trim().slice(0, 4000) : "";
  const image = typeof body.image === "string" ? body.image : "";
  if (!message && !image) return json({ error: "Напишите сообщение или прикрепите изображение." }, 400);
  if (image && (!/^data:image\/(png|jpeg|webp);base64,/.test(image) || image.length > 5_500_000)) {
    return json({ error: "Поддерживаются PNG, JPEG и WebP размером до 3 МБ." }, 400);
  }

  const { data: allowed, error: quotaError } = await supabase.rpc("consume_ai_quota");
  if (quotaError) return json({ error: "Не удалось проверить лимит запросов. Попробуйте позже." }, 503);
  if (!allowed) return json({ error: "Лимит помощника на сегодня достигнут. Попробуйте позже." }, 429);

  const systemPrompt = `Ты — архитектурный AI-помощник студии KOROLEV. Стиль общения: профессиональный, спокойный, дружелюбный, краткий. Слоган студии: «Форма следует за смыслом».
Помогай с архитектурой частных домов, планировками, фасадами, интерьером, стилями, подготовкой технического задания, этапами работы и предварительным бюджетом. Не выдумывай цены, сроки, услуги, адреса или факты о студии: если точных данных нет, скажи, что их подтвердит специалист KOROLEV. Любую смету обозначай как ориентировочную, с оговорками о регионе, площади, материалах и составе работ. Не выдавай концепт или изображение за рабочие чертежи, расчёт конструкций или разрешительную документацию. Если пользователь просит изображение/мудборд/визуальную концепцию, используй инструмент генерации изображений. При анализе прикреплённого изображения опиши видимые архитектурные особенности и практичные идеи без необоснованных выводов. Отвечай на языке пользователя.`;

  const inputContent: Array<Record<string, unknown>> = [];
  if (message) inputContent.push({ type: "input_text", text: message });
  if (image) inputContent.push({ type: "input_image", image_url: image, detail: "high" });

  try {
    const aiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5.5",
        instructions: systemPrompt,
        input: [{ role: "user", content: inputContent }],
        tools: [{ type: "image_generation", model: "gpt-image-2.5-flare" }],
        tool_choice: "auto",
        max_output_tokens: 900,
        safety_identifier: await crypto.subtle.digest("SHA-256", new TextEncoder().encode(userData.user.id + ":korolev-assistant")).then(buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, "0")).join("")),
      }),
    });
    const result = await aiResponse.json();
    if (!aiResponse.ok) {
      console.error("OpenAI response error", aiResponse.status, result?.error?.type || "unknown");
      return json({ error: "Сервис ИИ временно недоступен. Попробуйте позже." }, 502);
    }

    let reply = "";
    let generatedImage = "";
    for (const item of result.output || []) {
      if (item.type === "message") {
        for (const part of item.content || []) if (part.type === "output_text") reply += part.text || "";
      }
      if (item.type === "image_generation_call" && item.result) generatedImage = item.result;
    }
    if (!reply && !generatedImage) return json({ error: "Не удалось получить ответ. Попробуйте переформулировать запрос." }, 502);
    return json({ reply, image: generatedImage ? "data:image/png;base64," + generatedImage : null });
  } catch (error) {
    console.error("Assistant request failed", error instanceof Error ? error.message : "unknown");
    return json({ error: "Не удалось связаться с ИИ. Попробуйте позже." }, 502);
  }
});
