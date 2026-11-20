(() => {
  const cfg = window.KOROLEV_SUPABASE || {};
  const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(cfg.url || "") && typeof cfg.anonKey === "string" && cfg.anonKey.length > 30 && !cfg.anonKey.includes("YOUR_");
  const clientLib = window.supabase && window.supabase.createClient;
  const note = document.getElementById("config-note"), form = document.getElementById("auth-form");
  const tabs = [...document.querySelectorAll(".auth-tab")], message = document.getElementById("auth-message"), submit = document.getElementById("auth-submit");
  const authView = document.getElementById("auth-view"), accountView = document.getElementById("account-view");
  let mode = "login", client;
  function say(text,error=false){message.textContent=text;message.classList.toggle("error",error)}
  function setMode(next){mode=next;tabs.forEach(t=>t.classList.toggle("active",t.dataset.mode===mode));document.getElementById("name-field").hidden=mode!=="signup";form.elements.password.autocomplete=mode==="signup"?"new-password":"current-password";document.getElementById("auth-title").textContent=mode==="signup"?"Создайте аккаунт.":"С возвращением.";document.getElementById("auth-subtitle").textContent=mode==="signup"?"Зарегистрируйтесь, чтобы работать со студией в одном пространстве.":"Введите данные, чтобы открыть личный кабинет.";submit.innerHTML=mode==="signup"?'Создать аккаунт <span>↗</span>':'Войти в кабинет <span>↗</span>';say("")}
  tabs.forEach(t=>t.addEventListener("click",()=>setMode(t.dataset.mode)));
  document.getElementById("toggle-password").addEventListener("click",e=>{const i=form.elements.password;i.type=i.type==="password"?"text":"password";e.currentTarget.textContent=i.type==="password"?"Показать":"Скрыть"});
  function showSession(user){authView.hidden=true;accountView.hidden=false;note.classList.add("ready");document.getElementById("user-email").textContent=user.email||"";document.getElementById("user-name").textContent=user.user_metadata?.full_name||"Клиент KOROLEV"}
  function showAuth(){accountView.hidden=true;authView.hidden=false}
  if(!configured||!clientLib){note.textContent="Регистрация пока не активирована: создайте проект Supabase и добавьте URL проекта и публичный anon key в supabase/config.js. Никогда не вставляйте сюда service_role key.";form.addEventListener("submit",e=>{e.preventDefault();say("Сначала подключите Supabase — регистрация пока не отправляет данные.",true)});return}
  client=clientLib(cfg.url,cfg.anonKey);note.classList.add("ready");
  client.auth.getSession().then(({data})=>{if(data.session?.user)showSession(data.session.user)});
  client.auth.onAuthStateChange((_event,session)=>{if(session?.user)showSession(session.user);else showAuth()});
  form.addEventListener("submit",async e=>{e.preventDefault();const email=form.elements.email.value.trim(),password=form.elements.password.value;submit.disabled=true;say(mode==="signup"?"Создаём аккаунт…":"Проверяем данные…");try{if(mode==="signup"){const name=form.elements.name.value.trim();const {data,error}=await client.auth.signUp({email,password,options:{data:{full_name:name},emailRedirectTo:location.origin+location.pathname}});if(error)throw error;if(data.session?.user)showSession(data.session.user);else say("Проверьте почту и подтвердите адрес, затем войдите в кабинет.")}else{const {data,error}=await client.auth.signInWithPassword({email,password});if(error)throw error;if(data.user)showSession(data.user)}}catch(err){say(err.message||"Не удалось выполнить запрос. Попробуйте ещё раз.",true)}finally{submit.disabled=false}});
  document.getElementById("signout").addEventListener("click",async()=>{const {error}=await client.auth.signOut();document.getElementById("session-message").textContent=error?"Не удалось выйти: "+error.message:"Вы вышли из аккаунта."});
})();