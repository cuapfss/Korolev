// KOROLEV AI assistant — authenticated server-backed chat and image generation.
(function () {
  if (document.getElementById("korolev-ai")) return;
  const ru = (document.documentElement.lang || "ru").toLowerCase().startsWith("ru");
  const cfg = window.KOROLEV_SUPABASE || {};
  const root = document.createElement("div");
  root.id = "korolev-ai";
  root.innerHTML = `
    <button class="ai-launcher" type="button" aria-label="Открыть AI-помощника"><span>AI</span></button>
    <section class="ai-panel" aria-label="KOROLEV AI" aria-hidden="true">
      <div class="ai-head"><div class="ai-brand"><div class="ai-orb">K</div><div><strong>KOROLEV / AI</strong><small>${ru ? "Архитектурный помощник" : "Architecture assistant"}</small></div></div><button class="ai-close" type="button" aria-label="Закрыть">×</button></div>
      <div class="ai-messages" aria-live="polite"><div class="ai-msg bot">${ru ? "Привет! Я помощник KOROLEV. Могу консультировать по архитектуре, анализировать референсы и создавать визуальные концепции." : "Hello! I’m the KOROLEV assistant. I can discuss architecture, analyze references and create visual concepts."}</div></div>
      <div class="ai-quick"><button type="button" data-prompt="${ru ? "Какие услуги вы предлагаете?" : "What services do you offer?"}">${ru ? "Услуги" : "Services"}</button><button type="button" data-prompt="${ru ? "Из чего складывается стоимость проекта?" : "How is project pricing calculated?"}">${ru ? "Стоимость" : "Pricing"}</button><button type="button" data-prompt="${ru ? "Создай мудборд современного кирпичного дома с лаконичным фасадом." : "Create a moodboard for a modern brick house with a minimalist facade."}">${ru ? "Создать мудборд" : "Create moodboard"}</button></div>
      <form class="ai-compose"><label class="ai-upload">＋ ${ru ? "Прикрепить изображение" : "Attach image"}<input type="file" accept="image/png,image/jpeg,image/webp"></label><div class="ai-file-name" hidden></div><div class="ai-compose-row"><textarea rows="1" maxlength="4000" placeholder="${ru ? "Напишите сообщение…" : "Write a message…"}"></textarea><button class="ai-send" type="submit" aria-label="Отправить">↗</button></div><div class="ai-status">${ru ? "Для работы войдите в клиентский кабинет." : "Sign in to the client portal to use the assistant."}</div></form>
    </section>`;
  document.body.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const launcher = $(".ai-launcher"), panel = $(".ai-panel"), field = $("textarea"), form = $("form"), file = $('input[type="file"]');
  const messages = $(".ai-messages"), status = $(".ai-status"), fileName = $(".ai-file-name");
  let client = null, selectedImage = "";
  if (window.supabase?.createClient && cfg.url && cfg.anonKey) {
    client = window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  }
  const add = (value, who) => {
    const el = document.createElement("div"); el.className = "ai-msg " + who;
    if (typeof value === "string") el.textContent = value;
    else el.appendChild(value);
    messages.appendChild(el); messages.scrollTop = messages.scrollHeight;
  };
  const open = () => { panel.classList.add("is-open"); panel.setAttribute("aria-hidden", "false"); field.focus(); };
  const shut = () => { panel.classList.remove("is-open"); panel.setAttribute("aria-hidden", "true"); launcher.focus(); };
  launcher.addEventListener("click", () => panel.classList.contains("is-open") ? shut() : open());
  $(".ai-close").addEventListener("click", shut);
  document.addEventListener("keydown", e => { if (e.key === "Escape" && panel.classList.contains("is-open")) shut(); });
  file.addEventListener("change", async () => {
    selectedImage = ""; fileName.hidden = true;
    const f = file.files?.[0]; if (!f) return;
    if (f.size > 3 * 1024 * 1024) { status.textContent = ru ? "Файл больше 3 МБ. Выберите изображение меньше." : "Image exceeds 3 MB."; file.value = ""; return; }
    if (!["image/png", "image/jpeg", "image/webp"].includes(f.type)) { status.textContent = ru ? "Поддерживаются PNG, JPEG и WebP." : "PNG, JPEG and WebP are supported."; file.value = ""; return; }
    selectedImage = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(f); });
    fileName.hidden = false; fileName.textContent = f.name;
  });
  root.querySelectorAll("[data-prompt]").forEach(btn => btn.addEventListener("click", () => { field.value = btn.dataset.prompt; field.focus(); }));
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const message = field.value.trim();
    if (!message && !selectedImage) return;
    if (!client) { add(ru ? "Не удалось загрузить модуль подключения. Обновите страницу." : "Connection module unavailable. Refresh the page.", "bot"); return; }
    const { data: sessionData } = await client.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) { add(ru ? "Чтобы пользоваться помощником, сначала войдите в клиентский кабинет KOROLEV." : "Please sign in to your KOROLEV client portal first.", "bot"); status.textContent = ru ? "Требуется вход в аккаунт." : "Sign-in required."; return; }
    add(message || (ru ? "Проанализируй изображение." : "Please analyze this image."), "user");
    if (selectedImage) { const preview = document.createElement("img"); preview.src = selectedImage; preview.alt = ru ? "Прикреплённое изображение" : "Attached image"; preview.style.maxWidth = "180px"; preview.style.borderRadius = "12px"; add(preview, "user"); }
    const sendButton = $(".ai-send"); sendButton.disabled = true; status.textContent = ru ? "KOROLEV AI думает…" : "KOROLEV AI is thinking…";
    try {
      const response = await fetch(cfg.url + "/functions/v1/korolev-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: cfg.anonKey, Authorization: "Bearer " + token },
        body: JSON.stringify({ message, image: selectedImage || undefined })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Request failed");
      if (result.reply) add(result.reply, "bot");
      if (result.image) {
        const img = document.createElement("img"); img.src = result.image; img.alt = ru ? "Сгенерированная концепция KOROLEV" : "Generated KOROLEV concept"; img.style.width = "100%"; img.style.borderRadius = "14px"; add(img, "bot");
      }
      if (!result.reply && !result.image) add(ru ? "Ответ не получен. Попробуйте ещё раз." : "No response returned. Please try again.", "bot");
      field.value = ""; file.value = ""; selectedImage = ""; fileName.hidden = true;
      status.textContent = ru ? "Подключено к KOROLEV AI" : "Connected to KOROLEV AI";
    } catch (err) {
      add(err.message || (ru ? "Ошибка подключения." : "Connection error."), "bot");
      status.textContent = ru ? "Не удалось выполнить запрос." : "Request failed.";
    } finally { sendButton.disabled = false; messages.scrollTop = messages.scrollHeight; }
  });
  if (client) client.auth.getSession().then(({ data }) => {
    status.textContent = data.session ? (ru ? "Подключено к KOROLEV AI" : "Connected to KOROLEV AI") : (ru ? "Войдите в клиентский кабинет для работы." : "Sign in to the client portal.");
  });
})();
