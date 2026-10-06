// ============================================================
// landing si la UI se abre FUERA de Electron (p.ej. en GitHub Pages):
// aqui no existe window.jarvis, asi que en vez de fallar mostramos una
// tarjeta que enlaza al control remoto del celular
// ============================================================
if (!window.jarvis) {
  document.body.innerHTML = `
  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at 50% -10%, #0d1e28 0%, #050b10 55%);font-family:-apple-system,'Segoe UI',sans-serif;color:#cdeefc;padding:24px;">
    <div style="max-width:460px;text-align:center;border:1px solid rgba(79,216,255,0.22);background:rgba(13,26,36,0.7);border-radius:20px;padding:38px 30px;">
      <div style="width:58px;height:58px;margin:0 auto 18px;border-radius:50%;background:radial-gradient(circle at 35% 30%, #d9f6ff, #4fd8ff 45%, #0a3a4a 80%);box-shadow:0 0 26px rgba(79,216,255,0.4);"></div>
      <h1 style="margin:0 0 8px;font-size:20px;letter-spacing:5px;color:#4fd8ff;text-shadow:0 0 12px rgba(79,216,255,0.35);">J.A.R.V.I.S.</h1>
      <p style="margin:0 0 10px;font-size:13px;color:#6f95a3;line-height:1.6;">Esta es la app de escritorio: abrela desde tu Mac con la aplicacion JARVIS.</p>
      <p style="margin:0 0 24px;font-size:13px;color:#6f95a3;line-height:1.6;">¿Quieres controlarlo desde el celular?</p>
      <a href="./remote/" style="display:inline-block;padding:12px 26px;border-radius:999px;background:rgba(79,216,255,0.12);border:1px solid #4fd8ff;color:#4fd8ff;text-decoration:none;font-size:12px;letter-spacing:2px;">ABRIR CONTROL REMOTO →</a>
    </div>
  </div>`;
  throw new Error('JARVIS necesita Electron: abre la app de escritorio (window.jarvis no existe aqui).');
}

const chatEl = document.getElementById('chat');
const textInput = document.getElementById('textInput');
const sendBtn = document.getElementById('sendBtn');
const micBtn = document.getElementById('mic');
const gearBtn = document.getElementById('gearBtn');
const overlay = document.getElementById('overlay');
const apiKeyInput = document.getElementById('apiKeyInput');
const saveSettingsBtn = document.getElementById('saveSettings');
const closeSettingsBtn = document.getElementById('closeSettings');
const statusPill = document.getElementById('statusPill');
const statusText = document.getElementById('statusText');
const groqLink = document.getElementById('groqLink');
const workerUrlInput = document.getElementById('workerUrlInput');
const workerSecretInput = document.getElementById('workerSecretInput');
const whatsappTokenInput = document.getElementById('whatsappTokenInput');
const whatsappPhoneIdInput = document.getElementById('whatsappPhoneIdInput');
const remoteEnabledCheckbox = document.getElementById('remoteEnabledCheckbox');

const tabVoiceBtn = document.getElementById('tabVoiceBtn');
const tabChatBtn = document.getElementById('tabChatBtn');
const voicePanel = document.getElementById('voicePanel');
const chatPanel = document.getElementById('chatPanel');
const voiceStateLabel = document.getElementById('voiceStateLabel');
const callBtn = document.getElementById('callBtn');
const captionUser = document.getElementById('captionUser');
const captionJarvis = document.getElementById('captionJarvis');

const MODEL_PREFERENCE = [
  'llama-3.3-70b-versatile',
  'openai/gpt-oss-120b',
  'llama-3.1-8b-instant',
  'openai/gpt-oss-20b',
  'qwen/qwen3-32b'
];

let history = [];
let currentSettings = { apiKey: '', model: '' };
let keyInvalid = false;

// ============================================================
// tabs
// ============================================================
tabVoiceBtn.addEventListener('click', () => {
  tabVoiceBtn.classList.add('active');
  tabChatBtn.classList.remove('active');
  voicePanel.style.display = 'flex';
  chatPanel.style.display = 'none';
});
tabChatBtn.addEventListener('click', () => {
  tabChatBtn.classList.add('active');
  tabVoiceBtn.classList.remove('active');
  chatPanel.style.display = 'flex';
  voicePanel.style.display = 'none';
});

// ============================================================
// text-to-speech
// ============================================================
let selectedVoice = null;
let manualVoiceURI = localStorage.getItem('jarvis_voice_uri') || '';
function loadVoices(){
  const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  if(manualVoiceURI){
    selectedVoice = voices.find(v => v.voiceURI === manualVoiceURI) || null;
    if(selectedVoice) return;
  }
  const lang = (currentSettings && currentSettings.language) || 'es';
  if(lang === 'en'){
    selectedVoice = voices.find(v => v.lang && v.lang.toLowerCase().startsWith('en')) || voices[0] || null;
    return;
  }
  const preferredNames = ['Paulina', 'Mónica', 'Monica', 'Jorge', 'Juan', 'Diego', 'Angelica'];
  selectedVoice = voices.find(v => preferredNames.some(n => v.name.includes(n)))
    || voices.find(v => v.lang && v.lang.toLowerCase() === 'es-mx')
    || voices.find(v => v.lang && v.lang.toLowerCase().startsWith('es'))
    || voices[0] || null;
}
if(window.speechSynthesis){
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}
function speak(text, onDone){
  if(!window.speechSynthesis || !text){ if(onDone) onDone(); return; }
  try{
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    if(selectedVoice) utterance.voice = selectedVoice;
    utterance.lang = selectedVoice ? selectedVoice.lang : 'es-ES';
    utterance.rate = 0.96;
    utterance.pitch = 1.0;
    // each word boundary gives the dots a little burst of movement, so
    // they visually react to the actual rhythm of what JARVIS is saying
    utterance.onboundary = () => { if(typeof pulseSpeakEnergy === 'function') pulseSpeakEnergy(); };
    utterance.onend = () => { if(onDone) onDone(); };
    utterance.onerror = () => { if(onDone) onDone(); };
    window.speechSynthesis.speak(utterance);
  }catch(e){ console.error('TTS error', e); if(onDone) onDone(); }
}

// ============================================================
// settings
// ============================================================
async function detectBestModel(apiKey){
  const result = await window.jarvis.listModels(apiKey);
  if(!result.ok || !result.data?.data) return null;
  const available = result.data.data.map(m => m.id);
  for(const pref of MODEL_PREFERENCE){ if(available.includes(pref)) return pref; }
  const usable = available.filter(id => !/whisper|tts|guard|moderation|distil/i.test(id));
  return usable[0] || available[0] || null;
}

function refreshStatus(){
  if(!currentSettings.apiKey){
    statusPill.classList.add('off');
    statusText.textContent = 'SIN CONFIGURAR';
  } else if(keyInvalid){
    statusPill.classList.add('off');
    statusText.textContent = 'API VENCIDA';
  } else {
    statusPill.classList.remove('off');
    statusText.textContent = 'SISTEMA ACTIVO';
  }
}

async function init(){
  window.jarvis.boostMic(78);
  currentSettings = await window.jarvis.getSettings();
  refreshStatus();
  refreshLanguageBtn();
  if(!currentSettings.apiKey){
    setTimeout(() => overlay.classList.add('open'), 400);
  } else if(!currentSettings.model){
    const detected = await detectBestModel(currentSettings.apiKey);
    if(detected){
      currentSettings = await window.jarvis.saveSettings({ apiKey: currentSettings.apiKey, model: detected });
      refreshStatus();
    }
  }
  addMessage('jarvis', 'Sistemas de J.A.R.V.I.S. inicializados. Diga "hola JARVIS" para su resumen del dia.');
}
init();

groqLink.addEventListener('click', (e) => { e.preventDefault(); window.jarvis.openUrl('https://console.groq.com/keys'); });

// enlace a la pagina del control remoto (GitHub Pages) desde los ajustes
const remoteLink = document.getElementById('remoteLink');
if (remoteLink) remoteLink.addEventListener('click', (e) => { e.preventDefault(); window.jarvis.openUrl('https://ultimatejr.github.io/jarvis/remote/'); });

const voiceSelect = document.getElementById('voiceSelect');
const testVoiceBtn = document.getElementById('testVoiceBtn');
function populateVoiceSelect(){
  if(!window.speechSynthesis) return;
  const voices = window.speechSynthesis.getVoices().filter(v => v.lang && v.lang.toLowerCase().startsWith('es'));
  const list = voices.length ? voices : window.speechSynthesis.getVoices();
  voiceSelect.innerHTML = '';
  list.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.voiceURI;
    opt.textContent = v.name + ' (' + v.lang + ')';
    if(selectedVoice && v.voiceURI === selectedVoice.voiceURI) opt.selected = true;
    voiceSelect.appendChild(opt);
  });
}
if(window.speechSynthesis){
  populateVoiceSelect();
  window.speechSynthesis.onvoiceschanged = () => { loadVoices(); populateVoiceSelect(); };
}
voiceSelect.addEventListener('change', () => {
  manualVoiceURI = voiceSelect.value;
  localStorage.setItem('jarvis_voice_uri', manualVoiceURI);
  loadVoices();
});
testVoiceBtn.addEventListener('click', () => {
  manualVoiceURI = voiceSelect.value;
  localStorage.setItem('jarvis_voice_uri', manualVoiceURI);
  loadVoices();
  speak('Hola, senor. Asi es como sueno con esta voz.');
});

// ---------- language (fixed, not auto-detected - avoids mixed-up-language errors) ----------
const languageToggleBtn = document.getElementById('languageToggleBtn');
const subtitlesCheckbox = document.getElementById('subtitlesCheckbox');
const LANGUAGES = { es: 'Espanol', en: 'English' };

function refreshLanguageBtn(){
  languageToggleBtn.textContent = LANGUAGES[currentSettings.language || 'es'];
}
languageToggleBtn.addEventListener('click', async () => {
  const next = (currentSettings.language === 'en') ? 'es' : 'en';
  currentSettings = await window.jarvis.saveSettings({ language: next });
  refreshLanguageBtn();
  loadVoices(); // re-pick a voice matching the new language if none was manually chosen
});

// ---------- subtitles toggle ----------
const captionBox = document.querySelector('.caption-box');
let showSubtitles = localStorage.getItem('jarvis_show_subtitles') !== 'false';
function applySubtitleVisibility(){
  captionBox.style.visibility = showSubtitles ? 'visible' : 'hidden';
}
applySubtitleVisibility();
subtitlesCheckbox.addEventListener('change', () => {
  showSubtitles = subtitlesCheckbox.checked;
  localStorage.setItem('jarvis_show_subtitles', String(showSubtitles));
  applySubtitleVisibility();
});

gearBtn.addEventListener('click', async () => {
  apiKeyInput.value = currentSettings.apiKey || '';
  workerUrlInput.value = currentSettings.workerUrl || '';
  workerSecretInput.value = currentSettings.workerSecret || '';
  whatsappTokenInput.value = currentSettings.whatsappToken || '';
  whatsappPhoneIdInput.value = currentSettings.whatsappPhoneId || '';
  remoteEnabledCheckbox.checked = !!currentSettings.remoteEnabled;
  subtitlesCheckbox.checked = showSubtitles;
  refreshLanguageBtn();
  populateVoiceSelect();
  overlay.classList.add('open');
});
closeSettingsBtn.addEventListener('click', () => overlay.classList.remove('open'));
overlay.addEventListener('click', (e) => { if(e.target === overlay) overlay.classList.remove('open'); });

saveSettingsBtn.addEventListener('click', async () => {
  const newKey = apiKeyInput.value.trim();
  saveSettingsBtn.disabled = true;
  saveSettingsBtn.textContent = 'DETECTANDO...';
  const detected = await detectBestModel(newKey);
  currentSettings = await window.jarvis.saveSettings({
    apiKey: newKey,
    model: detected || '',
    workerUrl: workerUrlInput.value.trim(),
    workerSecret: workerSecretInput.value.trim(),
    whatsappToken: whatsappTokenInput.value.trim(),
    whatsappPhoneId: whatsappPhoneIdInput.value.trim(),
    remoteEnabled: remoteEnabledCheckbox.checked
  });
  keyInvalid = false;
  refreshStatus();
  saveSettingsBtn.disabled = false;
  saveSettingsBtn.textContent = 'GUARDAR';
  overlay.classList.remove('open');
  addMessage('jarvis', detected ? `Configuracion guardada, senor. Nucleo activo con el modelo ${detected}.` : 'Configuracion guardada, senor.');
});

// ============================================================
// chat log (secondary UI)
// ============================================================
function addMessage(role, text){
  const block = document.createElement('div');
  block.className = 'msg-block ' + (role === 'user' ? 'user' : 'jarvis');
  const label = document.createElement('div');
  label.className = 'msg-label';
  label.textContent = role === 'user' ? 'USUARIO' : 'J.A.R.V.I.S';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  block.appendChild(label);
  block.appendChild(bubble);
  chatEl.appendChild(block);
  chatEl.scrollTop = chatEl.scrollHeight;
  return bubble;
}
function addTyping(){
  const block = document.createElement('div');
  block.className = 'msg-block jarvis';
  const label = document.createElement('div');
  label.className = 'msg-label';
  label.textContent = 'J.A.R.V.I.S';
  const bubble = document.createElement('div');
  bubble.className = 'bubble typing';
  bubble.textContent = 'Procesando...';
  block.appendChild(label);
  block.appendChild(bubble);
  chatEl.appendChild(block);
  chatEl.scrollTop = chatEl.scrollHeight;
  return bubble;
}

// ============================================================
// native app opening
// ============================================================
const APP_ALIASES = {
  spotify: ['spotify'], musica: ['musica', 'música'],
  safari: ['safari', 'navegador', 'internet', 'buscador'], chrome: ['chrome'],
  mail: ['mail', 'correo', 'gmail'], calendario: ['calendario', 'agenda'],
  notas: ['notas'], mensajes: ['mensajes', 'imessage'], fotos: ['fotos'],
  terminal: ['terminal'], finder: ['finder', 'archivos'], recordatorios: ['recordatorios'],
  mapas: ['mapas', 'maps'], youtube: ['youtube'], github: ['github']
};

async function requestOpenApp(name){
  const result = await window.jarvis.openApp(name);
  if(result.ok) return `Abriendo ${name}, senor.` + (result.method === 'web-fallback' ? ' (use la version web)' : '');
  return `No pude abrir ${name}, senor.`;
}
async function tryOpenApp(t){
  for(const [app, aliases] of Object.entries(APP_ALIASES)){
    for(const alias of aliases){
      if(t.includes(alias) && (t.includes('abr') || t.includes('inicia') || t.includes('lanza') || t === alias)){
        return await requestOpenApp(app);
      }
    }
  }
  const match = t.match(/^(?:abre|abrir|inicia|lanza)\s+(?:la |el |la app |la aplicacion |el juego )?(.+)/);
  if(match && match[1].trim()) return await requestOpenApp(match[1].trim());
  return null;
}

// ============================================================
// local command handling (shared by voice + chat)
// ============================================================
const GREETING_REGEX = /^(hola|hey|buenas|buenos dias|buenas tardes|buenas noches)?[\s,]*jarvis[\s!.,]*$/;

function extractPageRange(t){
  const m = t.match(/(?:de la hoja|de la pagina|de las hojas|de las paginas|hojas|paginas|hoja|pagina)\s*(\d+)\s*(?:a|hasta)\s*(?:la\s*)?(\d+)/i);
  return m ? `${m[1]}-${m[2]}` : null;
}

async function handleLocalCommand(raw){
  const t = raw.trim().toLowerCase();

  // if we previously asked "color or black & white?", resolve that first
  if(pendingPrintFile){
    let colorMode = null;
    if(/\bcolor\b/.test(t)) colorMode = 'color';
    else if(/blanco y negro|b\.?\s?n\.?\b|escala de grises|\bgris\b/.test(t)) colorMode = 'gray';
    const pageRange = extractPageRange(t);

    if(colorMode){
      const target = pendingPrintFile;
      pendingPrintFile = null;
      await window.jarvis.previewFile(target);
      const printResult = await window.jarvis.printFile(target, colorMode, pageRange);
      const colorLabel = colorMode === 'gray' ? 'en blanco y negro' : 'a color';
      const pageLabel = printResult.pagesUsed ? `, paginas ${printResult.pagesUsed}` : '';
      const text = printResult.ok
        ? `Enviando ${target.split('/').pop()} a la impresora ${colorLabel}${pageLabel}, senor.`
        : `No pude enviar ese archivo a imprimir, senor. Detalle: ${printResult.error || 'desconocido'}.`;
      return { visual: text, spoken: printResult.ok ? text : 'No pude enviar ese archivo a imprimir, senor.' };
    }
    // anything else cancels the pending question and continues normally
    pendingPrintFile = null;
  }

  if(GREETING_REGEX.test(t) || t === 'hola' || t === 'resumen del dia' || t === 'hola jarvis'){
    const briefing = await window.jarvis.getBriefing();
    return { visual: briefing.visual, spoken: briefing.spoken };
  }

  if(t === 'hora' || t.includes('que hora es')){
    const now = new Date();
    const text = `Son las ${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}, senor.`;
    return { visual: text, spoken: text };
  }
  if(t === 'sistemas'){
    const text = `Diagnostico completo, senor:\n- Nucleo IA: ${currentSettings.apiKey ? (keyInvalid ? 'API VENCIDA' : 'operativo') : 'SIN CONFIGURAR'}\n- Apertura de apps: activa\n- Voz: activa\n- Sin anomalias.`;
    return { visual: text, spoken: 'Diagnostico completo, senor. Todos los sistemas operativos, sin anomalias.' };
  }

  if(/que (apps|aplicaciones|programas|juegos) tengo|lista de (apps|aplicaciones|programas|juegos)/.test(t)){
    const result = await window.jarvis.listApps();
    if(!result.ok || !result.apps.length) return { visual:'No pude leer sus Aplicaciones, senor.', spoken:'No pude leer sus aplicaciones, senor.' };
    const shown = result.apps.slice(0, 40);
    const visual = `Tiene ${result.apps.length} aplicaciones instaladas, senor:\n` + shown.join(', ');
    return { visual, spoken: `Tiene ${result.apps.length} aplicaciones instaladas, senor.` };
  }

  // dropped-file commands: any mention of "imprimir" while a file is on
  // hand always prints THAT file, no matter how you phrase it - this used
  // to require exact words like "esto" and silently fell through to the
  // AI (which then hallucinated something) if you phrased it differently
  if(lastDroppedFile && /imprim/.test(t)){
    let colorMode = null;
    if(/\bcolor\b/.test(t)) colorMode = 'color';
    else if(/blanco y negro|b\.?\s?n\.?\b|escala de grises|\bgris\b/.test(t)) colorMode = 'gray';
    const pageRange = extractPageRange(t);

    // if you gave a page range, just print - no need to ask about color first
    if(!colorMode && !pageRange){
      pendingPrintFile = lastDroppedFile;
      const q = 'Con gusto, senor. ¿Lo imprimo a color o en blanco y negro?';
      return { visual: q, spoken: q };
    }

    await window.jarvis.previewFile(lastDroppedFile);
    const printResult = await window.jarvis.printFile(lastDroppedFile, colorMode, pageRange);
    const colorLabel = colorMode === 'gray' ? 'en blanco y negro' : colorMode === 'color' ? 'a color' : '';
    const pageLabel = printResult.pagesUsed ? `, paginas ${printResult.pagesUsed}` : '';
    const text = printResult.ok
      ? `Enviando ${lastDroppedFile.split('/').pop()} a la impresora${colorLabel ? ' ' + colorLabel : ''}${pageLabel}, senor.`
      : `No pude enviar ese archivo a imprimir, senor. Detalle: ${printResult.error || 'desconocido'}. Ruta: ${lastDroppedFile}`;
    return { visual: text, spoken: printResult.ok ? text : 'No pude enviar ese archivo a imprimir, senor. Revise el detalle en pantalla.' };
  }

  // other dropped-file commands: "abre esto", "lee esto", "borra esto"
  if(/\b(esto|este archivo|ese archivo|lo que te mande|lo que te di|lo que solte)\b/.test(t) && lastDroppedFile){
    if(/^abre|abrir/.test(t)){
      const opened = await window.jarvis.openFile(lastDroppedFile);
      const text = opened.ok ? `Abriendo ${lastDroppedFile.split('/').pop()}, senor.` : 'No pude abrir ese archivo, senor.';
      return { visual: text, spoken: text };
    }
    if(/lee|leer|que dice/.test(t)){
      const read = await window.jarvis.readFile(lastDroppedFile);
      if(!read.ok) return { visual: 'No pude leer ese archivo, senor (puede que no sea texto plano).', spoken: 'No pude leer ese archivo, senor.' };
      return { visual: read.content.slice(0, 3000), spoken: 'Aqui esta el contenido, senor: ' + read.content.slice(0, 500) };
    }
    if(/borra|eliminar|elimina/.test(t)){
      const del = await window.jarvis.deleteFile(lastDroppedFile);
      const text = del.ok ? `Archivo ${lastDroppedFile.split('/').pop()} eliminado, senor.` : 'No pude eliminar ese archivo, senor.';
      lastDroppedFile = null;
      return { visual: text, spoken: text };
    }
  }

  const filesMatch = t.match(/(?:que archivos hay en|que hay en|lista(?:r)? archivos de)\s+(?:el |mi |la )?(escritorio|desktop|documentos|documents|descargas|downloads)/);
  if(filesMatch){
    const result = await window.jarvis.listFiles(filesMatch[1]);
    if(!result.ok) return { visual:'No pude leer esa carpeta, senor.', spoken:'No pude leer esa carpeta, senor.' };
    if(!result.entries.length) return { visual:`La carpeta ${result.folder} esta vacia, senor.`, spoken:`La carpeta esta vacia, senor.` };
    return { visual: `En ${result.folder} tiene, senor:\n` + result.entries.slice(0,40).join(', '), spoken: `Tiene ${result.entries.length} elementos en ${result.folder}, senor.` };
  }

  const fileSearchMatch = t.match(/^busca(?:r)?\s+(?:el |la |un |una )?archivo\s+(.+)/);
  if(fileSearchMatch){
    const result = await window.jarvis.searchFile(fileSearchMatch[1]);
    if(!result.ok || !result.results.length) return { visual:`No encontre "${fileSearchMatch[1]}", senor.`, spoken:'No encontre ese archivo, senor.' };
    return { visual: 'Encontre esto, senor:\n' + result.results.join('\n'), spoken: `Encontre ${result.results.length} resultados, senor.` };
  }

  const openFileMatch = t.match(/^abre(?:r)?\s+(?:el |la )?archivo\s+(.+)/);
  if(openFileMatch){
    const search = await window.jarvis.searchFile(openFileMatch[1]);
    if(search.ok && search.results.length){
      const opened = await window.jarvis.openFile(search.results[0]);
      if(opened.ok) return { visual:`Abriendo ${search.results[0]}, senor.`, spoken:'Abriendo el archivo, senor.' };
    }
    return { visual:`No pude abrir ese archivo, senor.`, spoken:'No pude abrir ese archivo, senor.' };
  }

  if(/(prende|enciende|activa)\s+(mi\s+)?(la\s+)?impresora/.test(t)){
    const result = await window.jarvis.printerStatus();
    const prefix = 'No puedo encender su impresora por software, senor, eso requiere el boton fisico. ';
    if(!result.ok || !result.raw) return { visual: prefix + 'Tampoco encuentro impresoras configuradas.', spoken: prefix + 'Tampoco encuentro impresoras configuradas.' };
    return { visual: prefix + 'Pero ya esta conectada y lista:\n' + result.raw, spoken: prefix + 'Pero ya esta conectada y lista.' };
  }

  if(/calendario|agenda|eventos de hoy|que tengo (hoy|programado)/.test(t) && !t.includes('abr')){
    const result = await window.jarvis.getCalendarEvents();
    if(!result.ok) return { visual:'No pude leer su Calendario, senor.', spoken:'No pude leer su calendario, senor.' };
    if(!result.raw) return { visual:'No tiene eventos programados para hoy, senor.', spoken:'No tiene eventos programados para hoy, senor.' };
    return { visual: 'Esto es lo que tiene en su calendario hoy, senor:\n' + result.raw, spoken: 'En su calendario de hoy tiene: ' + result.raw.split('\n').filter(Boolean).join('; ') };
  }

  const playMatch = t.match(/^(?:reproduce|reproducir|pon|ponme|toca|play)\s+(.+)/);
  if(playMatch){
    const song = playMatch[1].replace(/\s+en spotify$/, '').trim();
    if(song){
      const result = await window.jarvis.playSpotify(song);
      const text = result.method === 'native' ? `Reproduciendo "${song}" en Spotify, senor.` : `Le mande la busqueda de "${song}" a Spotify, senor.`;
      return { visual: text, spoken: text };
    }
  }

  const printMatch = t.match(/^imprime(?:r)?\s+(?:el |la |mi )?(?:archivo\s+)?(.+)/);
  if(printMatch){
    let query = printMatch[1].trim();
    let colorMode = null;
    if(/\bcolor\b/.test(query)) colorMode = 'color';
    else if(/blanco y negro|b\.?\s?n\.?\b|escala de grises|\bgris\b/.test(query)) colorMode = 'gray';
    const pageRange = extractPageRange(query);
    query = query
      .replace(/\s*(a color|en color|a blanco y negro|en blanco y negro|en escala de grises|en gris)\s*$/i, '')
      .replace(/\s*(?:de la hoja|de la pagina|de las hojas|de las paginas|hojas|paginas|hoja|pagina)\s*\d+\s*(?:a|hasta)\s*(?:la\s*)?\d+\s*$/i, '')
      .trim();

    const search = await window.jarvis.searchFile(query);
    if(!search.ok || !search.results.length) return { visual:`No encontre "${query}" para imprimir, senor.`, spoken:'No encontre ese archivo para imprimir, senor.' };

    if(!colorMode && !pageRange){
      pendingPrintFile = search.results[0];
      const q = 'Lo encontre, senor. ¿Lo imprimo a color o en blanco y negro?';
      return { visual: q, spoken: q };
    }

    await window.jarvis.previewFile(search.results[0]);
    const printResult = await window.jarvis.printFile(search.results[0], colorMode, pageRange);
    const colorLabel = colorMode === 'gray' ? 'en blanco y negro' : colorMode === 'color' ? 'a color' : '';
    const pageLabel = printResult.pagesUsed ? `, paginas ${printResult.pagesUsed}` : '';
    const text = printResult.ok ? `Enviando "${search.results[0]}" a la impresora${colorLabel ? ' ' + colorLabel : ''}${pageLabel}, senor.` : 'No pude enviar el archivo a imprimir, senor.';
    return { visual: text, spoken: text };
  }

  const appResult = await tryOpenApp(t);
  if(appResult) return { visual: appResult, spoken: appResult };

  const searchMatch = t.match(/^busca(?:r)?\s+(?:en internet\s+)?(.+)/);
  if(searchMatch){
    window.jarvis.openUrl('https://www.google.com/search?q=' + encodeURIComponent(searchMatch[1]));
    const text = `Buscando "${searchMatch[1]}" en la red, senor.`;
    return { visual: text, spoken: text };
  }

  return null;
}

async function callGroq(userText){
  if(!currentSettings.apiKey){
    const text = 'No tengo configurada una llave de acceso, senor. Abra ajustes e ingrese su API key de Groq.';
    return { text, needsKey: true };
  }
  const lang = currentSettings.language || 'es';
  const langInstruction = lang === 'en'
    ? 'Always respond in English.'
    : 'Responde siempre en español (nunca en ingles ni mezclado).';
  let systemPrompt = `Eres J.A.R.V.I.S. (Just A Rather Very Intelligent System), el asistente de IA personal de Tony Stark. ${langInstruction} Tono formal, calmado, ligeramente ingenioso, dirigiendote al usuario como "senor" (o "sir" en ingles). Se conciso (2-4 frases salvo que pidan detalle). Varia tu forma de expresarte de una respuesta a otra - evita repetir las mismas frases o estructuras que ya usaste antes en la conversacion, incluso si la pregunta es parecida.`;

  // if a file was dropped, give the model its content so open-ended
  // questions like "que contiene", "resume esto", "de que trata" work
  if(lastDroppedFile){
    const read = await window.jarvis.readFile(lastDroppedFile);
    if(read.ok){
      const fileName = lastDroppedFile.split('/').pop();
      systemPrompt += `\n\nEl usuario acaba de compartir un archivo llamado "${fileName}" con este contenido (usalo para responder si la pregunta se relaciona con el):\n---\n${read.content.slice(0, 6000)}\n---`;
    }
  }

  const messages = [{ role:'system', content: systemPrompt }, ...history, { role:'user', content:userText }];

  let modelToUse = currentSettings.model;
  if(!modelToUse){
    modelToUse = await detectBestModel(currentSettings.apiKey);
    if(modelToUse){ currentSettings = await window.jarvis.saveSettings({ apiKey: currentSettings.apiKey, model: modelToUse }); }
  }

  let result = await window.jarvis.chat({ apiKey: currentSettings.apiKey, model: modelToUse, messages });
  const isModelIssue = !result.ok && (result.status === 404 || (result.status === 400 && /model_not_found|decommissioned/i.test(result.data?.error?.code || '')));
  if(isModelIssue){
    const replacement = await detectBestModel(currentSettings.apiKey);
    if(replacement && replacement !== modelToUse){
      currentSettings = await window.jarvis.saveSettings({ apiKey: currentSettings.apiKey, model: replacement });
      result = await window.jarvis.chat({ apiKey: currentSettings.apiKey, model: replacement, messages });
    }
  }
  if(!result.ok){
    if(result.status === 401){
      keyInvalid = true; refreshStatus();
      return { text: 'Mi API ha vencido o la llave ya no es valida, senor. Ingrese una nueva en ajustes.', needsKey: true };
    }
    return { text: `Hubo un fallo al contactar el nucleo central, senor (codigo ${result.status}).`, needsKey: false };
  }
  const reply = result.data?.choices?.[0]?.message?.content?.trim() || 'Disculpe senor, no pude procesar esa solicitud.';
  history.push({ role:'user', content:userText });
  history.push({ role:'assistant', content:reply });
  if(history.length > 20) history = history.slice(-20);
  return { text: reply, needsKey: false };
}

// ============================================================
// unified entry point: handles a phrase from EITHER voice or chat
// returns { visual, spoken, needsKey }
// ============================================================
async function processInput(raw){
  const local = await handleLocalCommand(raw);
  if(local) return { visual: local.visual, spoken: local.spoken, needsKey: false };
  const { text, needsKey } = await callGroq(raw);
  return { visual: text, spoken: text, needsKey };
}

// ============================================================
// CHAT tab wiring
// ============================================================
async function handleChatInput(raw){
  if(!raw || !raw.trim()) return;
  addMessage('user', raw);
  textInput.value = '';
  sendBtn.disabled = true;
  const typingBubble = addTyping();
  try{
    const { visual, spoken, needsKey } = await processInput(raw);
    typingBubble.classList.remove('typing');
    typingBubble.textContent = visual;
    speak(spoken);
    if(needsKey) overlay.classList.add('open');
  }catch(err){
    typingBubble.classList.remove('typing');
    typingBubble.textContent = 'Error interno, senor. Detalle: ' + err.message;
  }finally{
    sendBtn.disabled = false;
    chatEl.scrollTop = chatEl.scrollHeight;
  }
}
sendBtn.addEventListener('click', () => handleChatInput(textInput.value));
textInput.addEventListener('keydown', (e) => { if(e.key === 'Enter') handleChatInput(textInput.value); });
document.querySelectorAll('.action-btn').forEach(btn => {
  btn.addEventListener('click', () => { const cmd = btn.getAttribute('data-cmd'); if(cmd) handleChatInput(cmd); });
});
document.getElementById('clearBtn').addEventListener('click', () => {
  chatEl.innerHTML = '';
  history = [];
  addMessage('jarvis', 'Registros limpiados, senor.');
});

// ============================================================
// DRAG & DROP: drop any file onto the window, then say "imprime esto",
// "abre esto", "lee esto" etc. and JARVIS acts on that exact file.
// ============================================================
let lastDroppedFile = null;
let pendingPrintFile = null; // set when we asked "color or B&W?" and are waiting for the answer
const dropOverlay = document.getElementById('dropOverlay');
const droppedFileBadge = document.getElementById('droppedFileBadge');

window.addEventListener('dragover', (e) => { e.preventDefault(); dropOverlay.classList.add('active'); });
window.addEventListener('dragleave', (e) => { if(e.target === document.documentElement) dropOverlay.classList.remove('active'); });
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dropOverlay.classList.remove('active');
  if(!e.dataTransfer.files.length) return;
  const file = e.dataTransfer.files[0];
  const filePath = window.jarvis.getPathForFile(file);
  lastDroppedFile = filePath;
  console.log('Archivo soltado, ruta detectada:', filePath);
  droppedFileBadge.textContent = '📎 ' + file.name;
  droppedFileBadge.title = filePath;
  droppedFileBadge.classList.add('show');
  setTimeout(() => droppedFileBadge.classList.remove('show'), 4000);
  const msg = `Archivo recibido, senor: ${file.name}.`;
  captionJarvis.textContent = msg + '\n(ruta: ' + filePath + ')';
  speak(msg);
  if(chatPanel.style.display !== 'none') addMessage('jarvis', msg + '\n(ruta: ' + filePath + ')');
});

// ============================================================
// MICROPHONE (real audio recording + Groq Whisper transcription)
//
// IMPORTANT: Electron's built-in SpeechRecognition (webkitSpeechRecognition)
// does NOT work here - Chromium's speech recognition needs a Google API key
// that stock Electron builds don't include, so every attempt fails silently.
// Instead we record real audio with MediaRecorder and transcribe it
// ourselves with Groq's Whisper (same as we already do for WhatsApp voice
// notes), which actually works.
// ============================================================
function blobToBase64(blob){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ---------- fuzzy correction: if a transcribed word is >=90% similar to a
// known command word, snap it to that exact word. Fixes cases where Whisper
// mishears a command slightly (e.g. "inprime" -> "imprime").
const COMMAND_DICTIONARY = [
  'jarvis','hola','imprime','imprimir','imprimelo','abre','abrir','calendario','agenda',
  'spotify','musica','hora','sistemas','busca','buscar','archivo','escritorio','documentos',
  'descargas','reproduce','pon','ponme','toca','enciende','prende','impresora','lee','leer',
  'borra','elimina','eliminar','color','negro','gris','esto','este','ese','navegador',
  'terminal','finder','mapas','correo','notas','aplicaciones','juegos','resumen','dia'
];

function levenshtein(a, b){
  const dp = Array.from({length: a.length + 1}, () => new Array(b.length + 1).fill(0));
  for(let i = 0; i <= a.length; i++) dp[i][0] = i;
  for(let j = 0; j <= b.length; j++) dp[0][j] = j;
  for(let i = 1; i <= a.length; i++){
    for(let j = 1; j <= b.length; j++){
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[a.length][b.length];
}
function similarity(a, b){
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - levenshtein(a, b) / maxLen;
}
function correctTranscript(text){
  return text.split(' ').map(word => {
    const clean = word.toLowerCase().replace(/[^\wáéíóúñü]/gi, '');
    if(!clean || COMMAND_DICTIONARY.includes(clean)) return word;
    let best = null, bestScore = 0;
    for(const dictWord of COMMAND_DICTIONARY){
      const score = similarity(clean, dictWord);
      if(score > bestScore){ bestScore = score; best = dictWord; }
    }
    return (best && bestScore >= 0.9) ? best : word;
  }).join(' ');
}

async function transcribe(blob, mimeType){
  const base64 = await blobToBase64(blob);
  const result = await window.jarvis.transcribeAudio({ audioBase64: base64, mimeType });
  const raw = (result && result.ok && result.text) ? result.text.trim() : '';
  return raw ? correctTranscript(raw) : '';
}

// ---------- secondary mic (CHAT tab): push-to-talk, tap to start/stop ----------
let chatMicStream = null;
let chatRecorder = null;
let chatChunks = [];
let chatRecording = false;

micBtn.addEventListener('click', async () => {
  if(chatRecording){
    chatRecorder.stop();
    return;
  }
  try{
    chatMicStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  }catch(err){
    addMessage('jarvis', 'No tengo permiso de microfono, senor. Autoricelo en Ajustes del Sistema > Privacidad > Microfono.');
    return;
  }
  const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
  chatRecorder = new MediaRecorder(chatMicStream, mimeType ? { mimeType } : undefined);
  chatChunks = [];
  chatRecorder.ondataavailable = (e) => { if(e.data.size > 0) chatChunks.push(e.data); };
  chatRecorder.onstop = async () => {
    chatRecording = false;
    micBtn.classList.remove('listening');
    chatMicStream.getTracks().forEach(t => t.stop());
    const blob = new Blob(chatChunks, { type: mimeType || 'audio/webm' });
    const text = await transcribe(blob, mimeType || 'audio/webm');
    if(text) handleChatInput(text);
  };
  chatRecorder.start();
  chatRecording = true;
  micBtn.classList.add('listening');
});

// ============================================================
// particle visualization: a spiral "orb" made of dots, where each dot
// jitters INDIVIDUALLY (no shared rotation of the whole shape).
// Slow individual drift when idle, fast agitation while you talk (then
// freezes when you stop), and reacts to JARVIS's actual words while he
// speaks (bursts of movement timed to each word, via speech boundaries).
// ============================================================
const particleCanvas = document.getElementById('particleCanvas');
const pctx = particleCanvas.getContext('2d');
const P_CENTER = { x: 110, y: 110 };
const P_BOUND_RADIUS = 92;
const P_COUNT = 140;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ~2.39996, gives an even spiral fill

let particleDots = [];
function initParticles(){
  particleDots = [];
  for(let i = 0; i < P_COUNT; i++){
    const frac = i / P_COUNT;
    particleDots.push({
      homeX: P_CENTER.x + Math.cos(i * GOLDEN_ANGLE) * (P_BOUND_RADIUS * Math.sqrt(frac)),
      homeY: P_CENTER.y + Math.sin(i * GOLDEN_ANGLE) * (P_BOUND_RADIUS * Math.sqrt(frac)),
      offX: 0, offY: 0, vx: 0, vy: 0,
      size: 0.9 + (1 - frac) * 2.6, // bigger near the center, tapering out - reads as a sphere
      phase: Math.random() * 1000
    });
  }
}
initParticles();

let particleMode = 'idle'; // idle | talking | still | speaking
let speakEnergy = 0; // spikes on each word JARVIS says, then decays
function setParticleMode(mode){ particleMode = mode; }
function pulseSpeakEnergy(){ speakEnergy = 1.0; }

function animateParticles(){
  pctx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);

  let jitterForce, damping;
  if(particleMode === 'talking'){ jitterForce = 0.55; damping = 0.88; }
  else if(particleMode === 'still'){ jitterForce = 0; damping = 0.7; } // decays quickly to a stop
  else if(particleMode === 'speaking'){ jitterForce = 0.15 + speakEnergy * 0.7; damping = 0.85; speakEnergy *= 0.93; }
  else { jitterForce = 0.06; damping = 0.94; } // idle - slow ambient drift

  particleDots.forEach((p) => {
    p.vx += (Math.random() - 0.5) * jitterForce;
    p.vy += (Math.random() - 0.5) * jitterForce;
    p.vx *= damping;
    p.vy *= damping;
    p.offX += p.vx;
    p.offY += p.vy;

    // soft pull back toward home position so dots don't wander off forever
    p.offX *= 0.96;
    p.offY *= 0.96;

    const x = p.homeX + p.offX;
    const y = p.homeY + p.offY;

    pctx.beginPath();
    pctx.arc(x, y, p.size, 0, Math.PI * 2);
    pctx.fillStyle = 'rgba(79,216,255,0.9)';
    pctx.shadowColor = 'rgba(79,216,255,0.9)';
    pctx.shadowBlur = 6;
    pctx.fill();
  });

  requestAnimationFrame(animateParticles);
}
animateParticles();

// ============================================================
// VOICE tab (primary) - fully automatic, hands-free conversation.
// No buttons: it listens on its own using real-time volume detection
// (voice activity detection), records while you talk, stops when you
// go quiet, transcribes, responds by voice, then listens again.
// ============================================================
let voiceCallActive = true;
let vadState = 'idle'; // idle | recording | processing | speaking | paused
let audioCtx = null, analyser = null, micStreamForVoice = null;
let voiceRecorder = null, voiceChunks = [];
let lastLoudTime = 0, recordingStartedAt = 0, vadTimer = null;

const VAD_SILENCE_MS = 1100; // how long you need to stay quiet before we consider you done
const VAD_MIN_MS = 350;      // ignore recordings shorter than this (avoid noise blips)

// self-calibrating sensitivity: instead of a fixed number (which is either
// too sensitive in a noisy room or not sensitive enough in a quiet one),
// we track your actual ambient noise level and set the thresholds relative
// to it, so it adapts to your mic/room automatically.
let noiseFloor = 0.01;
function currentStartThreshold(){ return noiseFloor + 0.014; }
function currentSilenceThreshold(){ return noiseFloor + 0.008; }

function setVoiceState(state, label){
  voicePanel.className = 'state-' + state;
  voiceStateLabel.textContent = label;
}

function getVolume(){
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteTimeDomainData(data);
  let sum = 0;
  for(let i = 0; i < data.length; i++){ const v = (data[i]-128)/128; sum += v*v; }
  return Math.sqrt(sum / data.length);
}

function startVoiceRecording(){
  vadState = 'recording';
  recordingStartedAt = Date.now();
  lastLoudTime = Date.now();
  voiceChunks = [];
  setParticleMode('talking');
  const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
  voiceRecorder = new MediaRecorder(micStreamForVoice, mimeType ? { mimeType } : undefined);
  voiceRecorder.ondataavailable = (e) => { if(e.data.size > 0) voiceChunks.push(e.data); };
  voiceRecorder.onstop = handleVoiceRecordingStop;
  voiceRecorder.start();
}

async function handleVoiceRecordingStop(){
  vadState = 'processing';
  setParticleMode('still');
  setVoiceState('processing', 'Pensando...');
  const blob = new Blob(voiceChunks, { type: 'audio/webm' });

  if(Date.now() - recordingStartedAt < VAD_MIN_MS){
    vadState = 'idle';
    setVoiceState('listening', 'Escuchando...');
    return;
  }

  try{
    const transcript = await transcribe(blob, 'audio/webm');
    if(!transcript){
      vadState = 'idle';
      setVoiceState('listening', 'Escuchando...');
      return;
    }
    captionUser.textContent = 'Tu: ' + transcript;
    const { visual, spoken, needsKey } = await processInput(transcript);
    captionJarvis.textContent = visual;
    vadState = 'speaking';
    setParticleMode('speaking');
    setVoiceState('speaking', 'Hablando...');
    speak(spoken, () => {
      vadState = voiceCallActive ? 'idle' : 'paused';
      setParticleMode('idle');
      setVoiceState(voiceCallActive ? 'listening' : 'idle', voiceCallActive ? 'Escuchando...' : 'Microfono en pausa');
    });
    if(needsKey) overlay.classList.add('open');
  }catch(err){
    captionJarvis.textContent = 'Error al transcribir, senor.';
    vadState = 'idle';
    setParticleMode('idle');
    setVoiceState('listening', 'Escuchando...');
  }
}

function checkVoiceVolume(){
  const volume = getVolume();

  if(!voiceCallActive || vadState === 'processing' || vadState === 'speaking' || vadState === 'paused') return;

  if(vadState === 'idle'){
    // slowly learn the room's background noise level while nobody's talking
    noiseFloor = noiseFloor * 0.98 + volume * 0.02;
    if(volume > currentStartThreshold()) startVoiceRecording();
  } else if(vadState === 'recording'){
    if(volume > currentSilenceThreshold()) lastLoudTime = Date.now();
    const elapsed = Date.now() - recordingStartedAt;
    const silentFor = Date.now() - lastLoudTime;
    if(elapsed > VAD_MIN_MS && silentFor > VAD_SILENCE_MS){
      if(voiceRecorder && voiceRecorder.state !== 'inactive') voiceRecorder.stop();
    }
  }
}

async function initVoiceLoop(){
  try{
    micStreamForVoice = await navigator.mediaDevices.getUserMedia({ audio: true });
  }catch(err){
    captionJarvis.textContent = 'Sin acceso al microfono, senor. Vaya a Ajustes del Sistema > Privacidad y Seguridad > Microfono, active JARVIS ahi, y reinicie la app (Cmd+Q y abrala de nuevo).';
    setVoiceState('idle', 'SIN PERMISO DE MICROFONO');
    return;
  }
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  // Chromium creates AudioContext "suspended" until there's user interaction -
  // without this, volume readings stay at zero forever and voice never triggers
  if(audioCtx.state === 'suspended'){
    try{ await audioCtx.resume(); }catch(e){ /* ignore */ }
  }
  const source = audioCtx.createMediaStreamSource(micStreamForVoice);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);

  setVoiceState('listening', 'Escuchando...');
  vadTimer = setInterval(checkVoiceVolume, 100);
}
initVoiceLoop();

// safety net: resume the audio context on the very first click/keypress
// anywhere in the app, in case it stayed suspended for any reason
function resumeAudioOnFirstInteraction(){
  if(audioCtx && audioCtx.state === 'suspended'){ audioCtx.resume(); }
  document.removeEventListener('click', resumeAudioOnFirstInteraction);
  document.removeEventListener('keydown', resumeAudioOnFirstInteraction);
}
document.addEventListener('click', resumeAudioOnFirstInteraction);
document.addEventListener('keydown', resumeAudioOnFirstInteraction);

// button is just an optional mute/pause now, not required to start
callBtn.addEventListener('click', () => {
  voiceCallActive = !voiceCallActive;
  if(voiceCallActive){
    callBtn.classList.remove('active');
    callBtn.textContent = '🎙';
    vadState = 'idle';
    setParticleMode('idle');
    setVoiceState('listening', 'Escuchando...');
  } else {
    callBtn.classList.add('active');
    callBtn.textContent = '🔇';
    window.speechSynthesis.cancel();
    if(voiceRecorder && voiceRecorder.state !== 'inactive') voiceRecorder.stop();
    vadState = 'paused';
    setParticleMode('still');
    setVoiceState('idle', 'Microfono en pausa');
  }
});
