document.querySelectorAll('.menu').forEach(b=>b.addEventListener('click',()=>document.querySelector('.links').classList.toggle('open')));
document.querySelectorAll('.links a').forEach(a=>a.addEventListener('click',()=>document.querySelector('.links').classList.remove('open')));
document.querySelectorAll('form[data-telegram]').forEach(form=>form.addEventListener('submit',e=>{
 e.preventDefault();const d=new FormData(form);let msg='Заявка с сайта KOROLEV%0A';
 for(const [k,v] of d.entries()) if(String(v).trim()) msg+=encodeURIComponent(k+': '+v)+'%0A';
 window.open('https://t.me/vosopo?text='+msg,'_blank','noopener');form.reset();
}));