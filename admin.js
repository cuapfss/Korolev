(() => {
const cfg=window.KOROLEV_SUPABASE||{},$=id=>document.getElementById(id);
const configured=cfg.url&&cfg.anonKey&&window.supabase?.createClient;
if(!configured){$("admin-loading").textContent="Supabase не настроен.";return}
const client=window.supabase.createClient(cfg.url,cfg.anonKey);let adminUser=null,adminProjects=[];
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const say=(id,msg,error=false)=>{const el=$(id);el.textContent=msg;el.classList.toggle("error",error)};
async function load(){
const {data:projects,error:pErr}=await client.from("projects").select("id,title,project_type,status,progress_percent,due_date,created_at,project_members(user_id,profiles(display_name,email))").order("created_at",{ascending:false});
const {data:clients,error:cErr}=await client.from("profiles").select("id,display_name,email,created_at").eq("role","client").order("created_at",{ascending:false});
const {data:requests,error:rErr}=await client.from("project_requests").select("*").order("created_at",{ascending:false});
if(pErr)throw pErr;if(cErr)throw cErr;if(rErr)throw rErr;
$("admin-client-count").textContent=(clients||[]).length;$("admin-project-count").textContent=(projects||[]).length;$("admin-active-count").textContent=(projects||[]).filter(p=>!["completed","archived"].includes(p.status)).length;
$("admin-request-count").textContent=(requests||[]).filter(r=>r.status==="new").length;adminProjects=projects||[];const workspaceSelect=$("workspace-project"),previous=workspaceSelect.value;workspaceSelect.innerHTML=adminProjects.length?adminProjects.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.title)+'</option>').join(""):'<option value="">Нет проектов</option>';if(adminProjects.some(p=>p.id===previous))workspaceSelect.value=previous;if(workspaceSelect.value)await loadWorkspace();
$("admin-requests").innerHTML=(requests||[]).length?requests.map(r=>'<tr><td>'+new Date(r.created_at).toLocaleDateString("ru-RU")+'</td><td><strong>'+esc(r.name)+'</strong><small>'+esc(r.email)+'</small><small>'+esc(r.contact_method)+'</small></td><td>'+esc(r.project_type)+'</td><td><small>Площадь: '+esc(r.area||"—")+'</small><small>Локация: '+esc(r.location||"—")+'</small><small>Услуги: '+esc(r.services||"—")+'</small><small>Бюджет: '+esc(r.budget||"—")+'</small><small>'+esc(r.description||"")+'</small>'+(r.references_url?'<small><a href="'+esc(r.references_url)+'" target="_blank" rel="noopener">Референсы ↗</a></small>':'')+'</td><td><select class="request-status" data-request-id="'+esc(r.id)+'"><option value="new" '+(r.status==="new"?"selected":"")+'>Новая</option><option value="reviewing" '+(r.status==="reviewing"?"selected":"")+'>На рассмотрении</option><option value="accepted" '+(r.status==="accepted"?"selected":"")+'>Принята</option><option value="declined" '+(r.status==="declined"?"selected":"")+'>Отклонена</option></select></td></tr>').join(""):'<tr><td colspan="5">Заявок пока нет.</td></tr>';
$("admin-projects").innerHTML=(projects||[]).length?projects.map(p=>{const member=p.project_members?.[0]?.profiles;return '<tr><td><strong>'+esc(p.title)+'</strong><small>'+esc(p.project_type||"")+'</small></td><td>'+esc(member?.display_name||member?.email||"Не назначен")+'</td><td>'+esc(p.status)+'</td><td><div class="admin-project-progress"><span style="width:'+Math.max(0,Math.min(100,Number(p.progress_percent)||0))+'%"></span></div></td></tr>'}).join(""):'<tr><td colspan="4">Проектов пока нет.</td></tr>';
$("admin-clients").innerHTML=(clients||[]).length?clients.map(c=>'<tr><td>'+esc(c.display_name||"Клиент")+'</td><td>'+esc(c.email)+'</td><td>'+new Date(c.created_at).toLocaleDateString("ru-RU")+'</td></tr>').join(""):'<tr><td colspan="3">Клиентов пока нет.</td></tr>';
}
async function init(){
const {data:{session}}=await client.auth.getSession();
if(!session){$("admin-loading").hidden=true;$("admin-denied").hidden=false;return}
adminUser=session.user;
const {data:profile,error}=await client.from("profiles").select("role").eq("id",session.user.id).maybeSingle();
if(error||!profile||profile.role!=="admin"){$("admin-loading").hidden=true;$("admin-denied").hidden=false;return}
$("admin-loading").hidden=true;$("admin-app").hidden=false;
try{await load()}catch(e){say("admin-feedback","Не удалось загрузить данные: "+e.message,true)}
}
$("new-project-form").addEventListener("submit",async e=>{
e.preventDefault();const f=e.currentTarget,values=Object.fromEntries(new FormData(f).entries());say("admin-form-message","Создаём проект…");
const {data:clientProfile,error:findError}=await client.from("profiles").select("id").eq("email",values.client_email.trim()).maybeSingle();
if(findError){say("admin-form-message",findError.message,true);return}
if(!clientProfile){say("admin-form-message","Клиент с таким email не найден. Сначала он должен зарегистрироваться.",true);return}
const {data:project,error}=await client.from("projects").insert({title:values.title.trim(),project_type:values.project_type||null,location:values.location||null,total_price:values.total_price?Number(values.total_price):null,currency:values.currency,status:"contract"}).select("id").single();
if(error){say("admin-form-message",error.message,true);return}
const {error:memberError}=await client.from("project_members").insert({project_id:project.id,user_id:clientProfile.id,access_role:"client"});
if(memberError){say("admin-form-message","Проект создан, но клиент не закреплён: "+memberError.message,true);return}
f.reset();say("admin-form-message","Проект создан и закреплён за клиентом.");await load();
});
$("admin-requests").addEventListener("change",async e=>{
const select=e.target.closest(".request-status");if(!select)return;
select.disabled=true;
const {error}=await client.from("project_requests").update({status:select.value}).eq("id",select.dataset.requestId);
select.disabled=false;
if(error){say("admin-feedback","Не удалось изменить статус заявки: "+error.message,true);return}
say("admin-feedback","Статус заявки обновлён.");await load();
});

async function loadWorkspace(){
const id=$("workspace-project").value;const p=adminProjects.find(x=>x.id===id);if(!p)return;
$("workspace-status").value=p.status||"lead";$("workspace-progress").value=p.progress_percent||0;$("workspace-due").value=p.due_date||"";
const {data,error}=await client.from("project_stages").select("id,title,status,progress_percent,planned_end,sort_order").eq("project_id",id).order("sort_order");
$("workspace-stages").innerHTML=error?'<div class="empty-state">'+esc(error.message)+'</div>':(data||[]).map(s=>'<article class="project-card"><div class="project-card-main"><strong>'+esc(s.title)+'</strong><small>'+esc(s.status)+' · '+(s.planned_end?new Date(s.planned_end+"T00:00:00").toLocaleDateString("ru-RU"):"срок не задан")+'</small></div><select class="stage-status" data-stage-id="'+esc(s.id)+'"><option value="pending" '+(s.status==="pending"?"selected":"")+'>Ожидает</option><option value="in_progress" '+(s.status==="in_progress"?"selected":"")+'>В работе</option><option value="review" '+(s.status==="review"?"selected":"")+'>На проверке</option><option value="completed" '+(s.status==="completed"?"selected":"")+'>Завершён</option><option value="blocked" '+(s.status==="blocked"?"selected":"")+'>Приостановлен</option></select></article>').join("")||'<div class="empty-state">Этапы ещё не добавлены.</div>';
}
$("workspace-project").addEventListener("change",loadWorkspace);
$("workspace-save").addEventListener("click",async()=>{
const id=$("workspace-project").value;if(!id)return;
const progress=Math.max(0,Math.min(100,Number($("workspace-progress").value)||0));
const {error}=await client.from("projects").update({status:$("workspace-status").value,progress_percent:progress,due_date:$("workspace-due").value||null,updated_at:new Date().toISOString()}).eq("id",id);
if(error){say("admin-feedback",error.message,true);return}
say("admin-feedback","Проект обновлён.");await load();
});
$("workspace-stages").addEventListener("change",async e=>{
const el=e.target.closest(".stage-status");if(!el)return;
const {error}=await client.from("project_stages").update({status:el.value,progress_percent:el.value==="completed"?100:el.value==="in_progress"?50:0,completed_at:el.value==="completed"?new Date().toISOString():null}).eq("id",el.dataset.stageId);
if(error)say("admin-feedback",error.message,true);else say("admin-feedback","Этап обновлён.");
});
$("stage-form").addEventListener("submit",async e=>{
e.preventDefault();const id=$("workspace-project").value;if(!id){say("stage-feedback","Сначала создайте или выберите проект.",true);return}
const v=Object.fromEntries(new FormData(e.currentTarget).entries());
const {error}=await client.from("project_stages").insert({project_id:id,title:v.title.trim(),planned_end:v.planned_end||null,sort_order:Date.now()});
if(error){say("stage-feedback",error.message,true);return}e.currentTarget.reset();say("stage-feedback","Этап добавлен.");await loadWorkspace();
});
$("admin-message-form").addEventListener("submit",async e=>{
e.preventDefault();const id=$("workspace-project").value,body=e.currentTarget.elements.body.value.trim();if(!id||!body)return;
const {error}=await client.from("project_messages").insert({project_id:id,sender_id:adminUser.id,body});
if(error){say("admin-message-feedback",error.message,true);return}e.currentTarget.reset();say("admin-message-feedback","Сообщение отправлено клиенту.");
});
$("admin-file-form").addEventListener("submit",async e=>{
e.preventDefault();const id=$("workspace-project").value,file=e.currentTarget.elements.file.files[0],category=e.currentTarget.elements.category.value;if(!id||!file)return;
if(file.size>25*1024*1024){say("admin-file-feedback","Максимальный размер файла — 25 МБ.",true);return}
say("admin-file-feedback","Загружаем файл…");
const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_"),path=id+"/"+Date.now()+"-"+safeName;
const {error:uploadError}=await client.storage.from("project-files").upload(path,file,{upsert:false,contentType:file.type||"application/octet-stream"});
if(uploadError){say("admin-file-feedback",uploadError.message,true);return}
const {error}=await client.from("project_files").insert({project_id:id,uploaded_by:adminUser.id,storage_path:path,file_name:file.name,mime_type:file.type||null,size_bytes:file.size,category});
if(error){say("admin-file-feedback","Файл загружен, но запись не создана: "+error.message,true);return}
if(["contract","invoice","act","proposal"].includes(category)){
const {error:docError}=await client.from("project_documents").insert({project_id:id,document_type:category,title:file.name,storage_path:path,status:"sent"});
if(docError){say("admin-file-feedback","Файл добавлен, но карточка документа не создана: "+docError.message,true);return}
}
e.currentTarget.reset();say("admin-file-feedback","Файл добавлен в кабинет клиента.");
});
$("admin-payment-form").addEventListener("submit",async e=>{
e.preventDefault();const id=$("workspace-project").value,v=Object.fromEntries(new FormData(e.currentTarget).entries());if(!id)return;
const {error}=await client.from("project_payments").insert({project_id:id,amount:Number(v.amount),currency:v.currency,status:v.status,paid_at:v.status==="paid"?new Date().toISOString():null,payment_type:"manual"});
if(error){say("admin-payment-feedback",error.message,true);return}e.currentTarget.reset();say("admin-payment-feedback","Платёж добавлен в историю проекта.");
});
$("refresh-admin").addEventListener("click",()=>load().catch(e=>say("admin-feedback",e.message,true)));
$("admin-signout").addEventListener("click",async()=>{await client.auth.signOut();location.href="account.html"});
init();
})();