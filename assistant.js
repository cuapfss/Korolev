// KOROLEV assistant widget — interface and safe demo mode.
// A server-side AI endpoint must be configured before model responses are enabled.
(function(){
  if(document.getElementById('korolev-ai'))return;
  var ru=(document.documentElement.lang||'ru').toLowerCase().indexOf('ru')===0;
  var root=document.createElement('div');root.id='korolev-ai';
  root.innerHTML=
    '<button class="ai-launcher" type="button" aria-label="Открыть AI-помощника"><span>AI</span></button>'+
    '<section class="ai-panel" aria-label="KOROLEV AI" aria-hidden="true">'+
      '<div class="ai-head"><div class="ai-brand"><div class="ai-orb">K</div><div><strong>KOROLEV / AI</strong><small>'+(ru?'Архитектурный помощник':'Architecture assistant')+'</small></div></div><button class="ai-close" type="button" aria-label="Закрыть">×</button></div>'+
      '<div class="ai-messages" aria-live="polite"><div class="ai-msg bot">'+(ru?'Привет! Я помощник KOROLEV. Могу рассказать об услугах, этапах работы и подготовке к проекту. Сейчас открыт тестовый интерфейс — подключение языковой модели ещё не завершено.':'Hello! I’m the KOROLEV assistant. I can help with services, project stages and getting ready for a project. This is the interface preview; the language model is not connected yet.')+'</div></div>'+
      '<div class="ai-quick"><button type="button" data-prompt="'+(ru?'Какие услуги вы предлагаете?':'What services do you offer?')+'">'+(ru?'Услуги':'Services')+'</button><button type="button" data-prompt="'+(ru?'Из чего складывается стоимость?':'How is pricing calculated?')+'">'+(ru?'Стоимость':'Pricing')+'</button><button type="button" data-prompt="'+(ru?'Как начать проект?':'How do I start a project?')+'">'+(ru?'Начать проект':'Start a project')+'</button></div>'+
      '<form class="ai-compose"><label class="ai-upload">＋ '+(ru?'Прикрепить изображение':'Attach an image')+'<input type="file" accept="image/*"></label><div class="ai-file-name" hidden></div><div class="ai-compose-row"><textarea rows="1" placeholder="'+(ru?'Напишите сообщение…':'Write a message…')+'"></textarea><button class="ai-send" type="submit" aria-label="Отправить">↗</button></div><div class="ai-status">'+(ru?'Демо-интерфейс · AI-модель ещё не подключена':'Interface preview · AI model not connected yet')+'</div></form>'+
    '</section>';
  document.body.appendChild(root);
  var launcher=root.querySelector('.ai-launcher'),panel=root.querySelector('.ai-panel'),close=root.querySelector('.ai-close'),messages=root.querySelector('.ai-messages'),form=root.querySelector('form'),field=form.querySelector('textarea'),file=form.querySelector('input[type=file]'),fileName=root.querySelector('.ai-file-name');
  function open(){panel.classList.add('is-open');panel.setAttribute('aria-hidden','false');field.focus()}
  function shut(){panel.classList.remove('is-open');panel.setAttribute('aria-hidden','true');launcher.focus()}
  function add(text,who){var el=document.createElement('div');el.className='ai-msg '+who;el.textContent=text;messages.appendChild(el);messages.scrollTop=messages.scrollHeight}
  launcher.addEventListener('click',function(){panel.classList.contains('is-open')?shut():open()});
  close.addEventListener('click',shut);
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&panel.classList.contains('is-open'))shut()});
  file.addEventListener('change',function(){fileName.hidden=!file.files.length;fileName.textContent=file.files.length?file.files[0].name:''});
  root.querySelectorAll('[data-prompt]').forEach(function(btn){btn.addEventListener('click',function(){field.value=btn.dataset.prompt;field.focus()})});
  form.addEventListener('submit',function(e){
    e.preventDefault();var value=field.value.trim();
    if(!value&&!file.files.length)return;
    add(value|| (ru?'Изображение прикреплено':'Image attached'),'user');
    if(file.files.length)add((ru?'Файл выбран: ':'File selected: ')+file.files[0].name,'user');
    field.value='';file.value='';fileName.hidden=true;
    add(ru?'Пока я работаю в режиме предварительного просмотра. Чтобы отвечать на вопросы и анализировать изображения, нужно подключить серверную AI-модель.':'I’m currently in preview mode. To answer questions and analyze images, the server-side AI model must be connected.','bot');
  });
})();