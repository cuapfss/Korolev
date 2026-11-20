(() => {
  const cfg=window.KOROLEV_SUPABASE||{};
  const configured=/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(cfg.url||"")&&typeof cfg.anonKey==="string"&&cfg.anonKey.length>30&&!cfg.anonKey.includes("YOUR_");
  const lib=window.supabase&&window.supabase.createClient;
  const $=id=>document.getElementById(id);
  const authView=$("auth-view"),accountView=$("account-view"),form=$("auth-form"),note=$("config-note");
  const authMessage=$("auth-message"),submit=$("auth-submit"),tabs=[...document.querySelectorAll(".auth-tab")];
  let client,mode="login",currentUser=null,profile=null,enrolledFactor=null,pendingFactor=null,loginFactorId=null,routing=false;
  const say=(el,msg,error=false)=>{if(!el)return;el.textContent=msg;el.classList.toggle("error",error)};
  function setMode(next){mode=next;tabs.forEach(t=>t.classList.toggle("active",t.dataset.mode===mode));$("name-field").hidden=mode!=="signup";form.elements.password.autocomplete=mode==="signup"?"new-password":"current-password";$("auth-title").textContent=mode==="signup"?"Создайте аккаунт.":"С возвращением."; $("auth-subtitle").textContent=mode==="signup"?"Зарегистрируйтесь, чтобы работать со студией в одном пространстве.":"Введите email и пароль, чтобы продолжить.";submit.innerHTML=mode==="signup"?"Создать аккаунт <span>↗</span>":"Войти в кабинет <span>↗</span>";say(authMessage,"")}
  tabs.forEach(t=>t.addEventListener("click",()=>setMode(t.dataset.mode)));
  $("toggle-password").addEventListener("click",e=>{const input=form.elements.password;input.type=input.type==="password"?"text":"password";e.currentTarget.textContent=input.type==="password"?"Показать":"Скрыть"});
  function showAuth(){accountView.hidden=true;authView.hidden=false;currentUser=null}
  function setAvatar(url,name){["side-avatar","settings-avatar"].forEach(id=>{const el=$(id);if(!el)return;el.innerHTML="";if(url){const img=document.createElement("img");img.src=url;img.alt="Аватар профиля";el.appendChild(img)}else el.textContent=(name||"K").trim().charAt(0).toUpperCase()||"K"})}
  async function loadProfile(user){
    currentUser=user;
    const {data,error}=await client.from("profiles").select("display_name,email,role,avatar_url").eq("id",user.id).maybeSingle();
    profile=data||{};
    const name=profile.display_name||user.user_metadata?.full_name||"Клиент KOROLEV";
    $("side-name").textContent=name;$("side-email").textContent=user.email||"";$("welcome-title").textContent="Здравствуйте, "+name.split(" ")[0]+".";
    $("display-name").value=name;$("profile-email").value=user.email||"";setAvatar(profile.avatar_url,name);
    if(error) say($("session-message"),"Не удалось загрузить профиль: "+error.message,true);
    await loadProjects();await refreshMfa();
  }
  function showSession(user){$("login-mfa").hidden=true;authView.hidden=true;accountView.hidden=false;note.classList.add("ready");loadProfile(user).catch(e=>say($("session-message"),e.message,true))}
  async function routeSession(user){
    if(!user||routing)return;
    routing=true;
    try{
      const {data,error}=await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if(error)throw error;
      if(data.nextLevel==="aal2"&&data.currentLevel!=="aal2"){
        const {data:factors,error:factorError}=await client.auth.mfa.listFactors();
        if(factorError)throw factorError;
        const factor=(factors.totp||[]).find(f=>f.status==="verified");
        if(!factor){showSession(user);return}
        loginFactorId=factor.id;
        const {error:challengeError}=await client.auth.mfa.challenge({factorId:loginFactorId});
        if(challengeError)throw challengeError;
        authView.hidden=false;accountView.hidden=true;$("login-mfa").hidden=false;
        $("auth-title").textContent="Подтвердите вход.";$("auth-subtitle").textContent="Введите одноразовый код из приложения-аутентификатора.";
        say($("login-mfa-feedback"),"");
      }else showSession(user);
    }catch(err){showSession(user);say($("session-message"),"Не удалось проверить 2FA: "+err.message,true)}
    finally{routing=false}
  }
  function activateSection(name){document.querySelectorAll(".portal-nav-item").forEach(b=>b.classList.toggle("active",b.dataset.section===name));document.querySelectorAll(".portal-section").forEach(s=>s.classList.toggle("active",s.id==="section-"+name));}
  document.querySelectorAll(".portal-nav-item").forEach(b=>b.addEventListener("click",()=>activateSection(b.dataset.section)));
  document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>activateSection(b.dataset.go)));
  async function loadProjects(){
    const {data,error}=await client.from("project_members").select("project_id,projects(id,title,project_type,status,progress_percent,due_date)").eq("user_id",currentUser.id);
    const projects=(data||[]).map(x=>x.projects).filter(Boolean);$("project-count").textContent=String(projects.length);
    const markup=projects.length?projects.map((p,i)=>'<article class="project-card"><span class="project-number">0'+(i+1)+'</span><div class="project-card-main"><strong>'+escapeHtml(p.title)+'</strong><small>'+escapeHtml(p.project_type||"Проект KOROLEV")+' · '+escapeHtml(p.status||"В работе")+'</small></div><div class="project-progress"><span style="width:'+Math.max(0,Math.min(100,Number(p.progress_percent)||0))+'%"></span></div></article>').join(""):'<div class="empty-state"><span>01</span><div><strong>Пока нет проектов</strong><p>После согласования задачи студия добавит проект в ваш кабинет.</p></div></div>';
    $("projects-list").innerHTML=markup;$("overview-projects").innerHTML=markup;
    if(error)say($("session-message"),"Не удалось загрузить список проектов: "+error.message,true);
  }
  function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
  $("profile-form").addEventListener("submit",async e=>{e.preventDefault();const name=$("display-name").value.trim();if(!name)return;say($("profile-feedback"),"Сохраняем…");const {error}=await client.from("profiles").update({display_name:name,updated_at:new Date().toISOString()}).eq("id",currentUser.id);if(error){say($("profile-feedback"),error.message,true);return}await client.auth.updateUser({data:{full_name:name}});$("side-name").textContent=name;$("welcome-title").textContent="Здравствуйте, "+name.split(" ")[0]+".";setAvatar(profile?.avatar_url,name);say($("profile-feedback"),"Имя профиля обновлено.")});
  $("avatar-input").addEventListener("change",async e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>3*1024*1024){say($("profile-feedback"),"Файл больше 3 МБ. Выберите изображение поменьше.",true);return}if(!["image/jpeg","image/png","image/webp"].includes(file.type)){say($("profile-feedback"),"Поддерживаются JPG, PNG и WebP.",true);return}say($("profile-feedback"),"Загружаем фотографию…");const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";const path=currentUser.id+"/avatar."+ext;const {error:uploadError}=await client.storage.from("avatars").upload(path,file,{upsert:true,contentType:file.type});if(uploadError){say($("profile-feedback"),"Не удалось загрузить фото. Проверьте настройку хранилища: "+uploadError.message,true);return}const {data}=client.storage.from("avatars").getPublicUrl(path);const url=data.publicUrl+"?v="+Date.now();const {error}=await client.from("profiles").update({avatar_url:url,updated_at:new Date().toISOString()}).eq("id",currentUser.id);if(error){say($("profile-feedback"),error.message,true);return}profile.avatar_url=url;setAvatar(url,$("display-name").value);say($("profile-feedback"),"Фотография профиля обновлена.");e.target.value=""});
  $("password-form").addEventListener("submit",async e=>{e.preventDefault();const a=e.target.elements.new_password.value,b=e.target.elements.confirm_password.value;if(a!==b){say($("password-feedback"),"Пароли не совпадают.",true);return}if(a.length<8){say($("password-feedback"),"Пароль должен содержать не менее 8 символов.",true);return}say($("password-feedback"),"Обновляем пароль…");const {error}=await client.auth.updateUser({password:a});if(error)say($("password-feedback"),error.message,true);else{e.target.reset();say($("password-feedback"),"Пароль успешно обновлён.")}});
  async function refreshMfa(){const {data,error}=await client.auth.mfa.listFactors();if(error){$("mfa-state").textContent="Недоступно";say($("mfa-feedback"),error.message,true);return}enrolledFactor=(data.totp||[]).find(f=>f.status==="verified")||null;$("mfa-state").textContent=enrolledFactor?"ВКЛЮЧЕНА":"НЕ НАСТРОЕНА";$("mfa-enroll").hidden=!!enrolledFactor;$("mfa-disable").hidden=!enrolledFactor;$("mfa-verify").hidden=true}
  $("mfa-start").addEventListener("click",async()=>{say($("mfa-feedback"),"Создаём настройку…");const {data,error}=await client.auth.mfa.enroll({factorType:"totp",friendlyName:"KOROLEV"});if(error){say($("mfa-feedback"),error.message,true);return}pendingFactor=data;$("mfa-qr").src=data.totp.qr_code;$("mfa-verify").hidden=false;$("mfa-enroll").hidden=true;say($("mfa-feedback"),"Отсканируйте QR-код приложением-аутентификатором.")});
  $("mfa-confirm").addEventListener("click",async()=>{const code=$("mfa-code").value.trim();if(!/^\d{6}$/.test(code)){say($("mfa-feedback"),"Введите шестизначный код.",true);return}say($("mfa-feedback"),"Проверяем код…");const {data:challenge,error:challengeError}=await client.auth.mfa.challenge({factorId:pendingFactor.id});if(challengeError){say($("mfa-feedback"),challengeError.message,true);return}const {error}=await client.auth.mfa.verify({factorId:pendingFactor.id,challengeId:challenge.id,code});if(error){say($("mfa-feedback"),"Код не принят: "+error.message,true);return}$("mfa-code").value="";say($("mfa-feedback"),"Двухфакторная защита включена.");await refreshMfa()});
  $("mfa-remove").addEventListener("click",async()=>{if(!enrolledFactor)return;say($("mfa-feedback"),"Отключаем…");const {error}=await client.auth.mfa.unenroll({factorId:enrolledFactor.id});if(error){say($("mfa-feedback"),error.message,true);return}say($("mfa-feedback"),"Двухфакторная защита отключена.");await refreshMfa()});
  if(!configured||!lib){note.textContent="Для входа подключите проект Supabase в supabase/config.js. Используйте только публичный publishable/anon key, никогда не service_role.";form.addEventListener("submit",e=>{e.preventDefault();say(authMessage,"Подключение Supabase не настроено.",true)});return}
  client=lib(cfg.url,cfg.anonKey);note.classList.add("ready");
  client.auth.getSession().then(({data})=>{if(data.session?.user)routeSession(data.session.user)});
  client.auth.onAuthStateChange((_event,session)=>{if(session?.user){if(!routing)routeSession(session.user)}else showAuth()});
  $("login-mfa-submit").addEventListener("click",async()=>{
    const code=$("login-mfa-code").value.trim();
    if(!/^\d{6}$/.test(code)){say($("login-mfa-feedback"),"Введите шестизначный код.",true);return}
    say($("login-mfa-feedback"),"Проверяем код…");
    const {data:challenge,error:challengeError}=await client.auth.mfa.challenge({factorId:loginFactorId});
    if(challengeError){say($("login-mfa-feedback"),challengeError.message,true);return}
    const {error}=await client.auth.mfa.verify({factorId:loginFactorId,challengeId:challenge.id,code});
    if(error){say($("login-mfa-feedback"),"Код не принят: "+error.message,true);return}
    $("login-mfa").hidden=true;$("login-mfa-code").value="";
    const {data:{user}}=await client.auth.getUser();if(user)showSession(user);
  });
  form.addEventListener("submit",async e=>{e.preventDefault();const email=form.elements.email.value.trim(),password=form.elements.password.value;submit.disabled=true;say(authMessage,mode==="signup"?"Создаём аккаунт…":"Проверяем данные…");try{if(mode==="signup"){const name=form.elements.name.value.trim();const {data,error}=await client.auth.signUp({email,password,options:{data:{full_name:name},emailRedirectTo:location.origin+location.pathname}});if(error)throw error;if(data.session?.user)showSession(data.session.user);else say(authMessage,"Проверьте почту и подтвердите адрес, затем войдите в кабинет.")}else{routing=true;const {data,error}=await client.auth.signInWithPassword({email,password});routing=false;if(error)throw error;if(data.user)await routeSession(data.user)}}catch(err){say(authMessage,err.message||"Не удалось выполнить запрос.",true)}finally{submit.disabled=false}});
  $("signout").addEventListener("click",async()=>{const {error}=await client.auth.signOut();if(error)say($("session-message"),error.message,true)});

  const portalText={
    ru:{
      "portal-home-link":"На главную ↗","auth-title":"С возвращением.","auth-subtitle":"Введите email и пароль, чтобы продолжить.",
      "welcome-title":"Добро пожаловать.","nav-overview":"Обзор","nav-projects":"Мои проекты","nav-messages":"Сообщения","nav-files":"Документы","nav-payments":"Оплата","nav-settings":"Профиль и безопасность",
      "overview-title":"Архитектура начинается\\nс хорошего диалога.","overview-desc":"Здесь будут появляться обновления, этапы и материалы ваших проектов.",
      "overview-link":"Обсудить новый проект ↗","projects-title":"Мои проекты","messages-title":"Сообщения","files-title":"Документы и файлы","payments-title":"Оплата","settings-title":"Профиль и безопасность",
      "profile-title":"Личные данные","avatar-title":"Фотография профиля","avatar-desc":"JPG, PNG или WebP. До 3 МБ.","avatar-upload":"Загрузить фото",
      "display-label":"Отображаемое имя","email-label":"Email аккаунта","save-profile":"Сохранить профиль ↗","password-title":"Смена пароля","password-desc":"Используйте уникальный пароль длиной не менее 8 символов.",
      "new-password":"Новый пароль","confirm-password":"Повторите пароль","update-password":"Обновить пароль","mfa-title":"Двухфакторная аутентификация","mfa-desc":"Дополнительный код из приложения-аутентификатора при входе.",
      "mfa-start":"Настроить 2FA","mfa-remove":"Отключить 2FA","signout":"Выйти из аккаунта","footer":"© KOROLEV — PRIVATE CLIENT SPACE"
    },
    en:{
      "portal-home-link":"Back to website ↗","auth-title":"Welcome back.","auth-subtitle":"Enter your email and password to continue.",
      "welcome-title":"Welcome.","nav-overview":"Overview","nav-projects":"My projects","nav-messages":"Messages","nav-files":"Documents","nav-payments":"Payments","nav-settings":"Profile & security",
      "overview-title":"Architecture starts\\nwith a good conversation.","overview-desc":"Updates, project stages and materials will appear here.",
      "overview-link":"Discuss a new project ↗","projects-title":"My projects","messages-title":"Messages","files-title":"Documents & files","payments-title":"Payments","settings-title":"Profile & security",
      "profile-title":"Personal details","avatar-title":"Profile photo","avatar-desc":"JPG, PNG or WebP. Up to 3 MB.","avatar-upload":"Upload photo",
      "display-label":"Display name","email-label":"Account email","save-profile":"Save profile ↗","password-title":"Change password","password-desc":"Use a unique password with at least 8 characters.",
      "new-password":"New password","confirm-password":"Confirm password","update-password":"Update password","mfa-title":"Two-factor authentication","mfa-desc":"Use an authenticator app code when signing in.",
      "mfa-start":"Set up 2FA","mfa-remove":"Disable 2FA","signout":"Sign out","footer":"© KOROLEV — PRIVATE CLIENT SPACE"
    }
  };
  const portalStaticText={"CLIENT SPACE":"КЛИЕНТСКОЕ ПРОСТРАНСТВО","Ваш проект.":"Your project.","В одном месте.":"In one place.","Рабочее пространство для общения со студией, контроля этапов и хранения проектных материалов.":"A workspace to communicate with the studio, track project stages and store project materials.","01 — Прозрачные этапы и сроки":"01 — Clear stages and timelines","02 — Чертежи и документы":"02 — Drawings and documents","03 — Связь со студией":"03 — Contact with the studio","ДОСТУП К КАБИНЕТУ":"CLIENT PORTAL ACCESS","● ЗАЩИЩЁННОЕ СОЕДИНЕНИЕ":"● SECURE CONNECTION","Имя и фамилия":"Full name","Как к вам обращаться":"How should we address you","Пароль":"Password","Не менее 8 символов":"At least 8 characters","Показать":"Show","Войти в кабинет":"Sign in","Для входа требуется код двухфакторной аутентификации.":"A two-factor authentication code is required to sign in.","Код из приложения":"Authenticator code","Подтвердить вход":"Confirm sign-in","Не отправляйте через кабинет данные банковских карт или пароли от сторонних сервисов.":"Do not send bank card details or passwords for other services through the portal.","Подключаем защищённый доступ…":"Connecting secure access…","Клиент":"Client","Связаться со студией ↗":"Contact the studio ↗","ЛИЧНЫЙ КАБИНЕТ / KOROLEV":"CLIENT PORTAL / KOROLEV","АККАУНТ АКТИВЕН":"ACCOUNT ACTIVE","ВАШЕ ПРОСТРАНСТВО":"YOUR SPACE","Архитектура начинается":"Architecture starts","с хорошего диалога.":"with a good conversation.","Здесь будут появляться обновления, этапы и материалы ваших проектов.":"Updates, stages and project materials will appear here.","Обсудить новый проект ↗":"Discuss a new project ↗","Активные проекты":"Active projects","Закреплённых за аккаунтом":"Assigned to your account","Непрочитанные сообщения":"Unread messages","Раздел будет подключён к чату":"Chat will be connected here","Документы":"Documents","Файлы ваших проектов":"Your project files","Последние проекты":"Recent projects","Все проекты ↗":"All projects ↗","Пока нет проектов":"No projects yet","После согласования задачи студия добавит проект в ваш кабинет.":"The studio will add a project to your portal once the brief is approved.","Статус, прогресс и основные сведения.":"Status, progress and key information.","Загружаем проекты…":"Loading projects…","Переписка с командой по каждому проекту.":"Messages with the team about each project.","Чат будет доступен после подключения проекта":"Chat will be available once a project is connected","История общения будет храниться внутри кабинета.":"Your conversation history will be stored in the portal.","Чертежи, PDF, договоры и материалы проекта.":"Drawings, PDFs, contracts and project materials.","Пока нет файлов":"No files yet","Материалы появятся здесь, когда студия прикрепит их к проекту.":"Materials will appear here when the studio attaches them to a project.","История платежей и финансовые документы.":"Payment history and financial documents.","Платежей пока нет":"No payments yet","Суммы и статусы будут отображаться после оформления проекта.":"Amounts and statuses will appear once a project is set up.","Управляйте данными и настройками входа.":"Manage your details and sign-in settings.","Подтвердить 2FA":"Confirm 2FA","Отключить 2FA":"Disable 2FA","Проверка…":"Checking…","Код подтверждения":"Verification code","Новый пароль":"New password","Повторите пароль":"Confirm password","Обновить пароль":"Update password","Сохранить профиль":"Save profile","Отображаемое имя":"Display name","Email аккаунта":"Account email","Личные данные":"Personal details","Смена пароля":"Change password","Двухфакторная аутентификация":"Two-factor authentication","Фотография профиля":"Profile photo","Загрузить фото":"Upload photo","JPG, PNG или WebP. До 3 МБ.":"JPG, PNG or WebP. Up to 3 MB.","Используйте уникальный пароль длиной не менее 8 символов.":"Use a unique password with at least 8 characters.","Дополнительный код из приложения-аутентификатора при входе.":"Use an authenticator app code when signing in.","Добавьте этот аккаунт в приложение-аутентификатор, затем введите код из 6 цифр.":"Add this account to your authenticator app, then enter the 6-digit code.","Выйти из аккаунта":"Sign out","На главную ↗":"Back to website ↗","Обзор":"Overview","Мои проекты":"My projects","Сообщения":"Messages","Документы и файлы":"Documents & files","Оплата":"Payments","Профиль и безопасность":"Profile & security","Добро пожаловать.":"Welcome.","С возвращением.":"Welcome back.","Введите email и пароль, чтобы продолжить.":"Enter your email and password to continue.","Создайте аккаунт.":"Create your account.","Зарегистрируйтесь, чтобы работать со студией в одном пространстве.":"Create an account to work with the studio in one place.","Регистрация":"Create account","Войти":"Sign in","Создать аккаунт":"Create account","Шаг":"Step"};
  function translatePortalStatic(lang){
    const pairs=lang==="en"?portalStaticText:Object.fromEntries(Object.entries(portalStaticText).map(([ru,en])=>[en,ru]));
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    let node;
    while((node=walker.nextNode())){
      const parent=node.parentElement;
      if(!parent||/^(SCRIPT|STYLE|TEXTAREA|INPUT)$/i.test(parent.tagName))continue;
      const raw=node.nodeValue,trimmed=raw.trim();
      if(Object.prototype.hasOwnProperty.call(pairs,trimmed)){
        node.nodeValue=raw.replace(trimmed,pairs[trimmed]);
      }
    }
    document.querySelectorAll("input[placeholder],textarea[placeholder]").forEach(input=>{
      const value=input.getAttribute("placeholder");
      const translated=pairs[value];
      if(translated)input.setAttribute("placeholder",translated);
    });
  }
  function setPortalLanguage(lang){
    const d=portalText[lang]||portalText.ru;
    document.documentElement.lang=lang;
    const button=$("portal-language");if(button)button.textContent=lang==="ru"?"EN":"RU";
    Object.keys(d).forEach(id=>{const el=$(id);if(el)el.textContent=d[id]});
    const navKeys=["overview","projects","messages","files","payments","settings"];
    document.querySelectorAll(".portal-nav-item").forEach((el,i)=>{const label=d["nav-"+navKeys[i]];if(label&&el.childNodes.length>1)el.childNodes[1].textContent=label});
    const authTitle=$("auth-title");if(authTitle&&!currentUser){authTitle.textContent=lang==="ru"?(mode==="login"?"С возвращением.":"Создайте аккаунт."):(mode==="login"?"Welcome back.":"Create your account.");}
    const authSubtitle=$("auth-subtitle");if(authSubtitle&&!currentUser)authSubtitle.textContent=lang==="ru"?(mode==="login"?"Введите email и пароль, чтобы продолжить.":"Зарегистрируйтесь, чтобы работать со студией в одном пространстве."):(mode==="login"?"Enter your email and password to continue.":"Create an account to work with the studio in one place.");
    const tabs=document.querySelectorAll(".auth-tab");if(tabs[0])tabs[0].textContent=lang==="ru"?"Войти":"Sign in";if(tabs[1])tabs[1].textContent=lang==="ru"?"Регистрация":"Create account";
    if(submit)submit.innerHTML=mode==="signup"?(lang==="ru"?"Создать аккаунт <span>↗</span>":"Create account <span>↗</span>"):(lang==="ru"?"Войти в кабинет <span>↗</span>":"Sign in <span>↗</span>");
    const labels={
      "display-name":lang==="ru"?"Имя и фамилия":"Full name",
      "profile-email":lang==="ru"?"Email аккаунта":"Account email",
      "mfa-code":lang==="ru"?"Код подтверждения":"Verification code"
    };
    Object.entries(labels).forEach(([id,label])=>{const input=$(id);if(input){const parent=input.closest("label");if(parent&&parent.firstChild)parent.firstChild.textContent=label}});
    const settings=$("section-settings");
    if(settings){
      const cards=settings.querySelectorAll(".settings-card h3");
      const titles=lang==="ru"?["Личные данные","Смена пароля","Двухфакторная аутентификация"]:["Personal details","Change password","Two-factor authentication"];
      cards.forEach((el,i)=>{if(titles[i])el.textContent=titles[i]});
      const paras=settings.querySelectorAll(".settings-card > p,.avatar-editor p");
      const descriptions=lang==="ru"?["Используйте уникальный пароль длиной не менее 8 символов.","JPG, PNG или WebP. До 3 МБ."]:["Use a unique password with at least 8 characters.","JPG, PNG or WebP. Up to 3 MB."];
      paras.forEach((el,i)=>{if(descriptions[i])el.textContent=descriptions[i]});
      const upload=settings.querySelector(".upload-button");if(upload&&upload.childNodes[0])upload.childNodes[0].textContent=lang==="ru"?"Загрузить фото":"Upload photo";
      const fields=settings.querySelectorAll("label");fields.forEach(label=>{const input=label.querySelector("input");if(!input)return;const map={"display-name":lang==="ru"?"Отображаемое имя":"Display name","profile-email":lang==="ru"?"Email аккаунта":"Account email","avatar-input":lang==="ru"?"Фотография профиля":"Profile photo"};if(map[input.id]&&label.childNodes[0])label.childNodes[0].textContent=map[input.id]});
    }
    const sections=document.querySelectorAll(".portal-section .section-heading h2");
    const headingMap=lang==="ru"?["Последние проекты","Мои проекты","Сообщения","Документы и файлы","Оплата","Профиль и безопасность"]:["Recent projects","My projects","Messages","Documents & files","Payments","Profile & security"];
    sections.forEach((el,i)=>{if(headingMap[i])el.textContent=headingMap[i]});
    translatePortalStatic(lang);
    try{localStorage.setItem("korolev-portal-lang",lang)}catch(e){}
  }
  $("portal-language")?.addEventListener("click",()=>setPortalLanguage((document.documentElement.lang||"ru")==="ru"?"en":"ru"));
  let savedPortalLang="ru";try{savedPortalLang=localStorage.getItem("korolev-portal-lang")||"ru"}catch(e){}
  setPortalLanguage(savedPortalLang);
  setMode("login");
})();