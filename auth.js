(() => {
  const cfg=window.KOROLEV_SUPABASE||{};
  const configured=/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(cfg.url||"")&&typeof cfg.anonKey==="string"&&cfg.anonKey.length>30&&!cfg.anonKey.includes("YOUR_");
  const lib=window.supabase&&window.supabase.createClient;
  const $=id=>document.getElementById(id);
  const authView=$("auth-view"),accountView=$("account-view"),form=$("auth-form"),note=$("config-note");
  const authMessage=$("auth-message"),submit=$("auth-submit"),tabs=[...document.querySelectorAll(".auth-tab")];
  let client,mode="login",currentUser=null,profile=null,enrolledFactor=null,pendingFactor=null,loginFactorId=null,routing=false,clientProjects=[];
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
    await loadProjects();await loadProjectResources();await loadRequests();await loadNotifications();await refreshMfa();translatePortalStatic(document.documentElement.lang||"ru");
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
    clientProjects=(data||[]).map(x=>x.projects).filter(Boolean);$("project-count").textContent=String(clientProjects.length);
    const ids=clientProjects.map(p=>p.id);let stages=[];
    if(ids.length){const result=await client.from("project_stages").select("id,project_id,title,status,progress_percent,planned_end,sort_order").in("project_id",ids).order("sort_order");if(!result.error)stages=result.data||[]}
    const markup=clientProjects.length?clientProjects.map((p,i)=>{const own=stages.filter(s=>s.project_id===p.id);return '<article class="project-card project-card-expanded"><span class="project-number">0'+(i+1)+'</span><div class="project-card-main"><strong>'+escapeHtml(p.title)+'</strong><small>'+escapeHtml(p.project_type||"Проект KOROLEV")+' · '+escapeHtml(p.status||"В работе")+'</small><div class="project-progress"><span style="width:'+Math.max(0,Math.min(100,Number(p.progress_percent)||0))+'%"></span></div>'+(p.due_date?'<small>Срок: '+new Date(p.due_date+"T00:00:00").toLocaleDateString("ru-RU")+'</small>':'')+(own.length?'<div class="stage-list">'+own.map(s=>'<div class="stage-row"><span>'+escapeHtml(s.title)+'</span><small>'+escapeHtml(({pending:"Ожидает",in_progress:"В работе",review:"На проверке",completed:"Завершён",blocked:"Приостановлен"})[s.status]||s.status)+'</small></div>').join("")+'</div>':'')+'</div></article>'}).join(""):'<div class="empty-state"><span>01</span><div><strong>Пока нет проектов</strong><p>После согласования задачи студия добавит проект в ваш кабинет.</p></div></div>';
    $("projects-list").innerHTML=markup;$("overview-projects").innerHTML=markup;
    const select=$("chat-project");if(select){select.innerHTML=clientProjects.length?clientProjects.map(p=>'<option value="'+escapeHtml(p.id)+'">'+escapeHtml(p.title)+'</option>').join(""):'<option value="">Нет доступных проектов</option>';select.disabled=!clientProjects.length;if(clientProjects.length)await loadMessages(clientProjects[0].id)}
    translatePortalStatic(document.documentElement.lang||"ru");
    if(error)say($("session-message"),"Не удалось загрузить список проектов: "+error.message,true);
  }
  async function loadMessages(projectId){
    const box=$("chat-messages");if(!box)return;
    if(!projectId){box.innerHTML='<div class="empty-state">Сначала дождитесь подключения проекта.</div>';return}
    const {data,error}=await client.from("project_messages").select("id,body,sender_id,created_at").eq("project_id",projectId).order("created_at",{ascending:true});
    if(error){box.innerHTML='<div class="empty-state">Не удалось загрузить сообщения: '+escapeHtml(error.message)+'</div>';return}
    box.innerHTML=(data||[]).length?data.map(m=>'<article class="chat-message '+(m.sender_id===currentUser.id?'mine':'')+'"><p>'+escapeHtml(m.body)+'</p><small>'+new Date(m.created_at).toLocaleString("ru-RU")+'</small></article>').join(""):'<div class="empty-state">Сообщений пока нет. Напишите первое.</div>';
    box.scrollTop=box.scrollHeight;
  }
  $("chat-project").addEventListener("change",e=>loadMessages(e.target.value));
  $("chat-form").addEventListener("submit",async e=>{
    e.preventDefault();const projectId=$("chat-project").value,body=e.currentTarget.elements.body.value.trim();if(!projectId||!body)return;
    say($("chat-feedback"),"Отправляем…");
    const {error}=await client.from("project_messages").insert({project_id:projectId,sender_id:currentUser.id,body});
    if(error){say($("chat-feedback"),error.message,true);return}
    e.currentTarget.reset();say($("chat-feedback"),"Сообщение отправлено.");await loadMessages(projectId);
  });
  async function loadProjectResources(){
    const ids=clientProjects.map(p=>p.id);
    if(!ids.length){$("portal-files").innerHTML='<div class="empty-state">Файлы появятся после подключения проекта.</div>';$("portal-documents").innerHTML="";$("portal-payments").innerHTML='<div class="empty-state">Платежей пока нет.</div>';return}
    const [filesRes,docsRes,payRes]=await Promise.all([
      client.from("project_files").select("id,project_id,file_name,storage_path,category,created_at").in("project_id",ids).order("created_at",{ascending:false}),
      client.from("project_documents").select("id,project_id,title,document_type,storage_path,status,created_at").in("project_id",ids).order("created_at",{ascending:false}),
      client.from("project_payments").select("id,project_id,amount,currency,status,paid_at,created_at").in("project_id",ids).order("created_at",{ascending:false})
    ]);
    const projectName=id=>clientProjects.find(p=>p.id===id)?.title||"Проект";
    const fileItems=[];
    for(const f of filesRes.data||[]){const signed=await client.storage.from("project-files").createSignedUrl(f.storage_path,3600);const url=signed.data?.signedUrl;fileItems.push('<article class="project-card"><div class="project-card-main"><strong>'+escapeHtml(f.file_name)+'</strong><small>'+escapeHtml(projectName(f.project_id))+' · '+escapeHtml(f.category)+'</small></div>'+(url?'<a class="portal-secondary" href="'+escapeHtml(url)+'" target="_blank" rel="noopener">Открыть ↗</a>':'<small>Файл недоступен</small>')+'</article>')}
    $("portal-files").innerHTML=filesRes.error?'<div class="empty-state">'+escapeHtml(filesRes.error.message)+'</div>':fileItems.join("")||'<div class="empty-state">Файлов пока нет.</div>';
    const docs=[];
    for(const d of docsRes.data||[]){const signed=d.storage_path?await client.storage.from("project-files").createSignedUrl(d.storage_path,3600):null;const url=signed?.data?.signedUrl;docs.push('<article class="project-card"><div class="project-card-main"><strong>'+escapeHtml(d.title)+'</strong><small>'+escapeHtml(projectName(d.project_id))+' · '+escapeHtml(d.document_type)+' · '+escapeHtml(d.status)+'</small></div>'+(url?'<a class="portal-secondary" href="'+escapeHtml(url)+'" target="_blank" rel="noopener">Открыть ↗</a>':'<span class="request-state">В обработке</span>')+'</article>')}
    $("portal-documents").innerHTML=docs.join("");
    $("portal-payments").innerHTML=payRes.error?'<div class="empty-state">'+escapeHtml(payRes.error.message)+'</div>':(payRes.data||[]).map(p=>'<article class="project-card"><div class="project-card-main"><strong>'+new Intl.NumberFormat("ru-RU",{maximumFractionDigits:2}).format(Number(p.amount))+' '+escapeHtml(p.currency)+'</strong><small>'+escapeHtml(projectName(p.project_id))+' · '+escapeHtml(({pending:"Ожидает оплаты",paid:"Оплачен",failed:"Ошибка",refunded:"Возврат"})[p.status]||p.status)+'</small></div><small>'+new Date(p.paid_at||p.created_at).toLocaleDateString("ru-RU")+'</small></article>').join("")||'<div class="empty-state">Платежей пока нет.</div>';
  }
  const requestStatusLabels={ru:{new:"Новая",reviewing:"На рассмотрении",accepted:"Принята",declined:"Отклонена"},en:{new:"New",reviewing:"Under review",accepted:"Accepted",declined:"Declined"}};
  const requestLang=()=>((document.documentElement.lang||"ru")==="en"?"en":"ru");
  const requestWord=(ru,en)=>requestLang()==="en"?en:ru;
  function formatPortalDate(value){
    if(!value)return requestWord("Дата не указана","Date not set");
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return requestWord("Дата не указана","Date not set");
    return new Intl.DateTimeFormat(requestLang()==="en"?"en-GB":"ru-RU",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(date);
  }
  function requestField(label,value){
    if(value===null||value===undefined||String(value).trim()==="")return "";
    return '<div class="request-detail"><span>'+escapeHtml(label)+'</span><strong>'+escapeHtml(String(value))+'</strong></div>';
  }
  function requestDetails(r,includeContact){
    const contact=r.contact_value||r.email||"";
    const method=r.contact_method|| (r.email?"Email":"");
    return (includeContact?requestField(method?(requestWord("Связь · ","Contact · ")+method):requestWord("Контакт","Contact"),contact):"")+
      requestField(requestWord("Площадь","Area"),r.area)+requestField(requestWord("Адрес объекта","Location"),r.location)+
      requestField(requestWord("Состав работ","Services"),r.services)+requestField(requestWord("Бюджет","Budget"),r.budget);
  }
  async function loadRequests(){
    const {data,error}=await client.from("project_requests").select("id,project_type,area,location,description,status,created_at,contact_method,contact_value,email,services,budget").eq("user_id",currentUser.id).order("created_at",{ascending:false});
    if(error){say($("session-message"),requestWord("Не удалось загрузить заявки: ","Could not load requests: ")+error.message,true);return}
    const labels=requestStatusLabels[requestLang()];
    $("requests-list").innerHTML=(data||[]).length?data.map(r=>{
      const status=labels[r.status]||r.status||requestWord("Статус не указан","Status not set");
      const details=requestDetails(r,true);
      return '<article class="project-card request-item request-client-card"><div class="project-card-main"><div class="request-card-top"><strong>'+escapeHtml(r.project_type||requestWord("Тип проекта не указан","Project type not set"))+'</strong><time>'+escapeHtml(formatPortalDate(r.created_at))+' · #'+escapeHtml(String(r.id||"").slice(0,8))+'</time></div><div class="request-details-grid">'+(details||'<div class="request-detail"><span>'+requestWord("Сведения","Details")+'</span><strong>'+requestWord("Пока не заполнены","Not provided")+'</strong></div>')+'</div>'+(r.description?'<div class="request-description"><span>'+requestWord("Описание задачи","Description")+'</span><p>'+escapeHtml(r.description)+'</p></div>':'')+'</div><span class="request-state request-status-pill">'+escapeHtml(status)+'</span></article>';
    }).join(""):'<div class="empty-state"><span>01</span><div><strong>'+requestWord("Заявок пока нет","No requests yet")+'</strong><p>'+requestWord("После отправки заявки она появится здесь.","Your request will appear here after submission.")+'</p></div></div>';
    const inbox=$("studio-inbox");
    if(inbox&&["admin","staff"].includes(profile?.role)){
      inbox.hidden=false;
      await loadStudioRequests();
    }
  }
  async function loadStudioRequests(){
    const box=$("studio-requests");if(!box)return;
    const {data,error}=await client.from("project_requests").select("id,name,email,contact_value,contact_method,project_type,area,location,services,budget,description,references_url,status,created_at").order("created_at",{ascending:false});
    if(error){box.innerHTML='<div class="empty-state">'+requestWord("Не удалось загрузить заявки: ","Could not load requests: ")+escapeHtml(error.message)+'</div>';return}
    const labels=requestStatusLabels[requestLang()];
    box.innerHTML=(data||[]).length?data.map(r=>{
      const status=labels[r.status]||r.status||requestWord("Статус не указан","Status not set");
      const details=requestDetails(r,true);
      return '<article class="project-card request-item request-studio-card"><div class="project-card-main"><div class="request-card-top"><strong>'+escapeHtml(r.name||requestWord("Без имени","Name not provided"))+' — '+escapeHtml(r.project_type||requestWord("Тип проекта не указан","Project type not set"))+'</strong><time>'+escapeHtml(formatPortalDate(r.created_at))+' · #'+escapeHtml(String(r.id||"").slice(0,8))+'</time></div><div class="request-details-grid">'+(details||'<div class="request-detail"><span>'+requestWord("Сведения","Details")+'</span><strong>'+requestWord("Не заполнены","Not provided")+'</strong></div>')+'</div>'+(r.description?'<div class="request-description"><span>'+requestWord("Описание задачи","Description")+'</span><p>'+escapeHtml(r.description)+'</p></div>':'')+(r.references_url?'<a class="request-reference" href="'+escapeHtml(r.references_url)+'" target="_blank" rel="noopener">'+requestWord("Открыть референсы ↗","Open references ↗")+'</a>':'')+'</div><label class="request-status-label">'+requestWord("Статус","Status")+'<select class="studio-request-status" data-request-id="'+escapeHtml(r.id)+'"><option value="new" '+(r.status==="new"?"selected":"")+'>'+requestWord("Новая","New")+'</option><option value="reviewing" '+(r.status==="reviewing"?"selected":"")+'>'+requestWord("На рассмотрении","Under review")+'</option><option value="accepted" '+(r.status==="accepted"?"selected":"")+'>'+requestWord("Принята","Accepted")+'</option><option value="declined" '+(r.status==="declined"?"selected":"")+'>'+requestWord("Отклонена","Declined")+'</option></select><small class="request-status-current">'+escapeHtml(status)+'</small></label></article>';
    }).join(""):'<div class="empty-state">'+requestWord("Заявок пока нет.","No requests yet.")+'</div>';
  }

  $("portal-request-form").addEventListener("submit",async e=>{
    e.preventDefault();const f=e.currentTarget,v=Object.fromEntries(new FormData(f).entries());say($("portal-request-feedback"),"Отправляем…");
    const {error}=await client.from("project_requests").insert({user_id:currentUser.id,name:profile?.display_name||currentUser.email,email:currentUser.email,contact_method:"Email",project_type:v.project_type.trim(),area:v.area.trim()||null,location:v.location.trim()||null,description:v.description.trim()||null});
    if(error){say($("portal-request-feedback"),error.message,true);return}
    f.reset();say($("portal-request-feedback"),"Заявка отправлена. Студия увидит её в админ-панели.");await loadRequests();
  });
  function localizeNotificationText(value){
    const text=String(value||"");
    if(requestLang()!=="en")return text;
    const exact={
      "Новая заявка KOROLEV":"New KOROLEV inquiry",
      "Заявка взята в работу":"Your inquiry is being reviewed",
      "Заявка принята":"Your inquiry has been accepted",
      "По заявке требуется уточнение":"More information is needed",
      "Статус заявки обновлён":"Inquiry status updated"
    };
    if(exact[text])return exact[text];
    return text
      .replace(/^Заявка от /,"Inquiry from ")
      .replace(/ \(контакт: /," (contact: ")
      .replace(/\)\. Откройте панель управления\.$/," ). Open the admin panel.")
      .replace(/^Заявка KOROLEV: /,"KOROLEV inquiry: ");
  }
  async function loadNotifications(){
    const {data,error}=await client.from("notifications").select("id,title,body,read_at,created_at").eq("user_id",currentUser.id).order("created_at",{ascending:false}).limit(50);
    if(error){say($("session-message"),requestWord("Не удалось загрузить уведомления: ","Could not load notifications: ")+error.message,true);return}
    const items=data||[];
    const unread=items.filter(n=>!n.read_at).length;
    const nav=document.querySelector('[data-section="notifications"]');
    if(nav)nav.innerHTML='<span>04</span>'+requestWord("Уведомления","Notifications")+(unread?' · '+unread:'');
    const readLabel=requestWord("Прочитано","Read");
    $("notifications-list").innerHTML=items.length?items.map(n=>'<article class="project-card notification-card '+(!n.read_at?'unread':'')+'"><div class="project-card-main"><strong>'+escapeHtml(localizeNotificationText(n.title))+'</strong><small>'+new Date(n.created_at).toLocaleString(requestLang()==="en"?"en-GB":"ru-RU")+'</small><p>'+escapeHtml(localizeNotificationText(n.body))+'</p></div>'+(!n.read_at?'<button class="portal-secondary mark-read" data-notification-id="'+escapeHtml(n.id)+'" type="button">'+requestWord("Прочитано","Mark as read")+'</button>':'<span class="request-state">'+readLabel+'</span>')+'</article>').join(""):'<div class="empty-state"><span>01</span><div><strong>'+requestWord("Пока нет уведомлений","No notifications yet")+'</strong><p>'+requestWord("Здесь появятся обновления по вашим заявкам и проектам.","Updates about your inquiries and projects will appear here.")+'</p></div></div>';
  }
  $("notifications-list").addEventListener("click",async e=>{
    const button=e.target.closest(".mark-read");if(!button)return;
    const {error}=await client.from("notifications").update({read_at:new Date().toISOString()}).eq("id",button.dataset.notificationId).eq("user_id",currentUser.id);
    if(error){say($("session-message"),error.message,true);return}await loadNotifications();
  });
  $("notifications-refresh").addEventListener("click",()=>loadNotifications());
  const studioInboxRefresh=$("studio-inbox-refresh");
  if(studioInboxRefresh)studioInboxRefresh.addEventListener("click",loadStudioRequests);
  const studioRequests=$("studio-requests");
  if(studioRequests)studioRequests.addEventListener("change",async e=>{
    const select=e.target.closest(".studio-request-status");if(!select)return;
    select.disabled=true;
    const {error}=await client.from("project_requests").update({status:select.value}).eq("id",select.dataset.requestId);
    select.disabled=false;
    if(error){say($("session-message"),"Не удалось обновить статус заявки: "+error.message,true);return}
    say($("session-message"),"Статус заявки обновлён.");
    await loadStudioRequests();
  });

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
      "welcome-title":"Добро пожаловать.","nav-overview":"Обзор","nav-projects":"Мои проекты","nav-requests":"Заявки","nav-notifications":"Уведомления","nav-messages":"Сообщения","nav-files":"Документы","nav-payments":"Оплата","nav-settings":"Профиль и безопасность",
      "overview-title":"Архитектура начинается\\nс хорошего диалога.","overview-desc":"Здесь будут появляться обновления, этапы и материалы ваших проектов.",
      "overview-link":"Обсудить новый проект ↗","projects-title":"Мои проекты","messages-title":"Сообщения","files-title":"Документы и файлы","payments-title":"Оплата","settings-title":"Профиль и безопасность",
      "profile-title":"Личные данные","avatar-title":"Фотография профиля","avatar-desc":"JPG, PNG или WebP. До 3 МБ.","avatar-upload":"Загрузить фото",
      "display-label":"Отображаемое имя","email-label":"Email аккаунта","save-profile":"Сохранить профиль ↗","password-title":"Смена пароля","password-desc":"Используйте уникальный пароль длиной не менее 8 символов.",
      "new-password":"Новый пароль","confirm-password":"Повторите пароль","update-password":"Обновить пароль","mfa-title":"Двухфакторная аутентификация","mfa-desc":"Дополнительный код из приложения-аутентификатора при входе.",
      "mfa-start":"Настроить 2FA","mfa-remove":"Отключить 2FA","signout":"Выйти из аккаунта","footer":"© KOROLEV — PRIVATE CLIENT SPACE"
    },
    en:{
      "portal-home-link":"Back to website ↗","auth-title":"Welcome back.","auth-subtitle":"Enter your email and password to continue.",
      "welcome-title":"Welcome.","nav-overview":"Overview","nav-projects":"My projects","nav-requests":"Inquiries","nav-notifications":"Notifications","nav-messages":"Messages","nav-files":"Documents","nav-payments":"Payments","nav-settings":"Profile & security",
      "overview-title":"Architecture starts\\nwith a good conversation.","overview-desc":"Updates, project stages and materials will appear here.",
      "overview-link":"Discuss a new project ↗","projects-title":"My projects","messages-title":"Messages","files-title":"Documents & files","payments-title":"Payments","settings-title":"Profile & security",
      "profile-title":"Personal details","avatar-title":"Profile photo","avatar-desc":"JPG, PNG or WebP. Up to 3 MB.","avatar-upload":"Upload photo",
      "display-label":"Display name","email-label":"Account email","save-profile":"Save profile ↗","password-title":"Change password","password-desc":"Use a unique password with at least 8 characters.",
      "new-password":"New password","confirm-password":"Confirm password","update-password":"Update password","mfa-title":"Two-factor authentication","mfa-desc":"Use an authenticator app code when signing in.",
      "mfa-start":"Set up 2FA","mfa-remove":"Disable 2FA","signout":"Sign out","footer":"© KOROLEV — PRIVATE CLIENT SPACE"
    }
  };
  const portalStaticText={"КЛИЕНТСКОЕ ПРОСТРАНСТВО":"CLIENT SPACE","Ваш проект.":"Your project.","В одном месте.":"In one place.","Рабочее пространство для общения со студией, контроля этапов и хранения проектных материалов.":"A workspace to communicate with the studio, track project stages and store project materials.","01 — Прозрачные этапы и сроки":"01 — Clear stages and timelines","02 — Чертежи и документы":"02 — Drawings and documents","03 — Связь со студией":"03 — Contact with the studio","ДОСТУП К КАБИНЕТУ":"CLIENT PORTAL ACCESS","● ЗАЩИЩЁННОЕ СОЕДИНЕНИЕ":"● SECURE CONNECTION","Имя и фамилия":"Full name","Как к вам обращаться":"How should we address you","Пароль":"Password","Не менее 8 символов":"At least 8 characters","Показать":"Show","Войти в кабинет":"Sign in","Для входа требуется код двухфакторной аутентификации.":"A two-factor authentication code is required to sign in.","Код из приложения":"Authenticator code","Подтвердить вход":"Confirm sign-in","Не отправляйте через кабинет данные банковских карт или пароли от сторонних сервисов.":"Do not send bank card details or passwords for other services through the portal.","Подключаем защищённый доступ…":"Connecting secure access…","Клиент":"Client","Связаться со студией ↗":"Contact the studio ↗","ЛИЧНЫЙ КАБИНЕТ / KOROLEV":"CLIENT PORTAL / KOROLEV","АККАУНТ АКТИВЕН":"ACCOUNT ACTIVE","ВАШЕ ПРОСТРАНСТВО":"YOUR SPACE","Архитектура начинается":"Architecture starts","с хорошего диалога.":"with a good conversation.","Здесь будут появляться обновления, этапы и материалы ваших проектов.":"Updates, stages and project materials will appear here.","Обсудить новый проект ↗":"Discuss a new project ↗","Активные проекты":"Active projects","Закреплённых за аккаунтом":"Assigned to your account","Непрочитанные сообщения":"Unread messages","Раздел будет подключён к чату":"Chat will be connected here","Документы":"Documents","Файлы ваших проектов":"Your project files","Последние проекты":"Recent projects","Все проекты ↗":"All projects ↗","Обновления по заявкам и проектам.":"Updates on inquiries and projects.","Обновить":"Refresh","Уведомления":"Notifications","Прочитано":"Read","Пока нет проектов":"No projects yet","После согласования задачи студия добавит проект в ваш кабинет.":"The studio will add a project to your portal once the brief is approved.","Статус, прогресс и основные сведения.":"Status, progress and key information.","Загружаем проекты…":"Loading projects…","Переписка с командой по каждому проекту.":"Messages with the team about each project.","Чат будет доступен после подключения проекта":"Chat will be available once a project is connected","История общения будет храниться внутри кабинета.":"Your conversation history will be stored in the portal.","Чертежи, PDF, договоры и материалы проекта.":"Drawings, PDFs, contracts and project materials.","Пока нет файлов":"No files yet","Материалы появятся здесь, когда студия прикрепит их к проекту.":"Materials will appear here when the studio attaches them to a project.","История платежей и финансовые документы.":"Payment history and financial documents.","Платежей пока нет":"No payments yet","Суммы и статусы будут отображаться после оформления проекта.":"Amounts and statuses will appear once a project is set up.","Управляйте данными и настройками входа.":"Manage your details and sign-in settings.","Подтвердить 2FA":"Confirm 2FA","Отключить 2FA":"Disable 2FA","Проверка…":"Checking…","Код подтверждения":"Verification code","Новый пароль":"New password","Повторите пароль":"Confirm password","Обновить пароль":"Update password","Сохранить профиль":"Save profile","Отображаемое имя":"Display name","Email аккаунта":"Account email","Личные данные":"Personal details","Смена пароля":"Change password","Двухфакторная аутентификация":"Two-factor authentication","Фотография профиля":"Profile photo","Загрузить фото":"Upload photo","JPG, PNG или WebP. До 3 МБ.":"JPG, PNG or WebP. Up to 3 MB.","Используйте уникальный пароль длиной не менее 8 символов.":"Use a unique password with at least 8 characters.","Дополнительный код из приложения-аутентификатора при входе.":"Use an authenticator app code when signing in.","Добавьте этот аккаунт в приложение-аутентификатор, затем введите код из 6 цифр.":"Add this account to your authenticator app, then enter the 6-digit code.","Выйти из аккаунта":"Sign out","На главную ↗":"Back to website ↗","Обзор":"Overview","Мои проекты":"My projects","Мои заявки":"My inquiries","Отправьте запрос в студию и следите за его статусом.":"Send an inquiry to the studio and track its status.","Сообщения":"Messages","Документы и файлы":"Documents & files","Оплата":"Payments","Профиль и безопасность":"Profile & security","Добро пожаловать.":"Welcome.","С возвращением.":"Welcome back.","Введите email и пароль, чтобы продолжить.":"Enter your email and password to continue.","Создайте аккаунт.":"Create your account.","Зарегистрируйтесь, чтобы работать со студией в одном пространстве.":"Create an account to work with the studio in one place.","Регистрация":"Create account","Войти":"Sign in","Создать аккаунт":"Create account","Шаг":"Step","ЛИЧНЫЙ КАБИНЕТ":"CLIENT PORTAL","Сохраняем…":"Saving…","Имя профиля обновлено.":"Profile name updated.","Не удалось загрузить список проектов:":"Could not load project list:","Не удалось загрузить профиль:":"Could not load profile:","Настроить 2FA":"Set up 2FA","Введите одноразовый код из приложения-аутентификатора.":"Enter the one-time code from your authenticator app.","Подтвердите вход.":"Confirm sign-in.","Скрыть":"Hide","Выберите файл":"Choose a file","Файл больше 3 МБ. Выберите изображение меньшего размера.":"File is larger than 3 MB. Choose a smaller image.","Здравствуйте,":"Hello,"};
  function applyPortalDashboardLanguage(lang){
    const en=lang==="en";
    const set=(selector,value)=>{const el=document.querySelector(selector);if(el)el.textContent=value};
    set(".dashboard-top .eyebrow",en?"CLIENT PORTAL / KOROLEV":"ЛИЧНЫЙ КАБИНЕТ / KOROLEV");
    set(".online-indicator",en?"ACCOUNT ACTIVE":"АККАУНТ АКТИВЕН");
    set(".overview-hero .eyebrow",en?"YOUR SPACE":"ВАШЕ ПРОСТРАНСТВО");
    const heroTitle=document.querySelector(".overview-hero h2");
    if(heroTitle)heroTitle.innerHTML=en?"Architecture starts<br>with a good conversation.":"Архитектура начинается<br>с хорошего диалога.";
    const heroPs=document.querySelectorAll(".overview-hero > div > p");
    if(heroPs[1])heroPs[1].textContent=en?"Updates, project stages and materials will appear here.":"Здесь будут появляться обновления, этапы и материалы ваших проектов.";
    set(".overview-hero .text-link",en?"Discuss a new project ↗":"Обсудить новый проект ↗");
    const stats=document.querySelectorAll(".stat-grid article");
    const statText=en?[["Active projects","Assigned to your account"],["Unread messages","Chat will be connected here"],["Documents","Your project files"]]:[["Активные проекты","Закреплённых за аккаунтом"],["Непрочитанные сообщения","Раздел будет подключён к чату"],["Документы","Файлы ваших проектов"]];
    stats.forEach((card,i)=>{const span=card.querySelector("span"),small=card.querySelector("small");if(span&&statText[i])span.textContent=statText[i][0];if(small&&statText[i])small.textContent=statText[i][1]});
    const headingText={
      "section-overview":en?"Recent projects":"Последние проекты",
      "section-requests":en?"My inquiries":"Мои заявки",
      "section-notifications":en?"Notifications":"Уведомления",
      "section-projects":en?"My projects":"Мои проекты",
      "section-messages":en?"Messages":"Сообщения",
      "section-files":en?"Documents & files":"Документы и файлы",
      "section-payments":en?"Payments":"Оплата",
      "section-settings":en?"Profile & security":"Профиль и безопасность"
    };
    Object.entries(headingText).forEach(([id,value])=>{
      const heading=document.querySelector("#"+id+" .section-heading h2");
      if(heading)heading.textContent=value;
    });
    const quiet=document.querySelector(".quiet-button");if(quiet)quiet.textContent=en?"All projects ↗":"Все проекты ↗";
    document.querySelectorAll(".project-list .empty-state").forEach(el=>{const strong=el.querySelector("strong"),p=el.querySelector("p");if(strong)strong.textContent=en?"No projects yet":"Пока нет проектов";if(p)p.textContent=en?"The studio will add a project to your portal once the brief is approved.":"После согласования задачи студия добавит проект в ваш кабинет."});
    const footer=document.querySelector(".portal-footer span");if(footer)footer.textContent="© KOROLEV — PRIVATE CLIENT SPACE";
    const footerLink=document.querySelector(".portal-footer a");if(footerLink)footerLink.textContent=en?"Back to website ↗":"На главную ↗";
  }
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
    const portalLabel=document.querySelector(".portal-header-right > span");
    if(portalLabel)portalLabel.textContent=lang==="en"?"CLIENT SPACE":"КЛИЕНТСКОЕ ПРОСТРАНСТВО";
    applyPortalDashboardLanguage(lang);
  }
  function setPortalLanguage(lang){
    const d=portalText[lang]||portalText.ru;
    document.documentElement.lang=lang;
    const button=$("portal-language");if(button)button.textContent=lang==="ru"?"EN":"RU";
    Object.keys(d).forEach(id=>{const el=$(id);if(el)el.textContent=d[id]});
    const navKeys=["overview","projects","requests","notifications","messages","files","payments","settings"];
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
    translatePortalStatic(lang);
    if(currentUser){loadRequests().catch(()=>{});loadNotifications().catch(()=>{});}
    try{localStorage.setItem("korolev-portal-lang",lang);localStorage.setItem("k-lang",lang)}catch(e){}
  }
  $("portal-language")?.addEventListener("click",()=>setPortalLanguage((document.documentElement.lang||"ru")==="ru"?"en":"ru"));
  let savedPortalLang="ru";try{savedPortalLang=localStorage.getItem("k-lang")||localStorage.getItem("korolev-portal-lang")||"ru"}catch(e){}
  setPortalLanguage(savedPortalLang);
  setMode("login");
})();