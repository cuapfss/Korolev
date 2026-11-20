(() => {
const cfg=window.KOROLEV_SUPABASE||{},$=id=>document.getElementById(id);
const configured=cfg.url&&cfg.anonKey&&window.supabase?.createClient;
if(!configured){$("admin-loading").textContent="Supabase не настроен.";return}
const client=window.supabase.createClient(cfg.url,cfg.anonKey);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const say=(id,msg,error=false)=>{const el=$(id);el.textContent=msg;el.classList.toggle("error",error)};
async function load(){
const {data:projects,error:pErr}=await client.from("projects").select("id,title,project_type,status,progress_percent,created_at,project_members(user_id,profiles(display_name,email))").order("created_at",{ascending:false});
const {data:clients,error:cErr}=await client.from("profiles").select("id,display_name,email,created_at").eq("role","client").order("created_at",{ascending:false});
if(pErr)throw pErr;if(cErr)throw cErr;
$("admin-client-count").textContent=(clients||[]).length;$("admin-project-count").textContent=(projects||[]).length;$("admin-active-count").textContent=(projects||[]).filter(p=>!["completed","archived"].includes(p.status)).length;
$("admin-projects").innerHTML=(projects||[]).length?projects.map(p=>{const member=p.project_members?.[0]?.profiles;return '<tr><td><strong>'+esc(p.title)+'</strong><small>'+esc(p.project_type||"")+'</small></td><td>'+esc(member?.display_name||member?.email||"Не назначен")+'</td><td>'+esc(p.status)+'</td><td><div class="admin-project-progress"><span style="width:'+Math.max(0,Math.min(100,Number(p.progress_percent)||0))+'%"></span></div></td></tr>'}).join(""):'<tr><td colspan="4">Проектов пока нет.</td></tr>';
$("admin-clients").innerHTML=(clients||[]).length?clients.map(c=>'<tr><td>'+esc(c.display_name||"Клиент")+'</td><td>'+esc(c.email)+'</td><td>'+new Date(c.created_at).toLocaleDateString("ru-RU")+'</td></tr>').join(""):'<tr><td colspan="3">Клиентов пока нет.</td></tr>';
}
async function init(){
const {data:{session}}=await client.auth.getSession();
if(!session){$("admin-loading").hidden=true;$("admin-denied").hidden=false;return}
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
$("refresh-admin").addEventListener("click",()=>load().catch(e=>say("admin-feedback",e.message,true)));
$("admin-signout").addEventListener("click",async()=>{await client.auth.signOut();location.href="account.html"});
init();
})();