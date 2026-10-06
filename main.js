const { app, BrowserWindow, ipcMain, shell, systemPreferences } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { exec } = require('child_process');

const SETTINGS_PATH = path.join(app.getPath('userData'), 'jarvis-settings.json');

function loadSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return {
      apiKey: '', model: '',
      remoteEnabled: false,
      workerUrl: '', workerSecret: '',
      whatsappToken: '', whatsappPhoneId: '',
      language: 'es'
    };
  }
}

function saveSettingsToDisk(settings) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
}

let mainWindow;

function createWindow() {
  let windowIcon = undefined;
  try {
    // when packaged, native icon-loading can't read files compressed inside
    // app.asar - they need to be read from their "unpacked" location instead
    let iconPath = path.join(__dirname, 'build', 'icon.png');
    iconPath = iconPath.replace('app.asar', 'app.asar.unpacked');
    if (fs.existsSync(iconPath)) windowIcon = iconPath;
  } catch (e) { windowIcon = undefined; }

  mainWindow = new BrowserWindow({
    width: 1000,
    height: 720,
    backgroundColor: '#050b10',
    title: 'J.A.R.V.I.S.',
    icon: windowIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // load the actual UI FIRST - nothing below this line should ever be able
  // to block or crash the app before the window has content
  mainWindow.loadFile('index.html');
  // devtools solo mientras desarrollas - nunca en la app empaquetada
  if (!app.isPackaged) mainWindow.webContents.openDevTools({ mode: 'detach' });

  if (process.platform === 'darwin' && app.dock && windowIcon) {
    try {
      app.dock.setIcon(windowIcon);
    } catch (e) {
      console.error('No se pudo poner el icono del Dock:', e);
    }
  }

  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(permission === 'media');
  });
}

app.whenReady().then(() => {
  if (process.platform === 'darwin' && systemPreferences.askForMediaAccess) {
    systemPreferences.askForMediaAccess('microphone').catch(() => {});
  }
  boostMicSensitivity();
  createWindow();
  startRemoteBridgeLoop();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// raises the Mac's system microphone input level so JARVIS picks up your
// voice more easily, even from a bit further away or speaking softly.
// this is a real, actionable "sensitivity" boost - the Web Speech API itself
// has no such setting, the input gain lives at the OS level.
function boostMicSensitivity(level = 78) {
  if (process.platform !== 'darwin') return;
  exec(`osascript -e "set volume input volume ${level}"`, (error) => {
    if (error) console.error('could not raise mic input volume:', error);
  });
}
ipcMain.handle('boost-mic', (event, level) => { boostMicSensitivity(level); return { ok: true }; });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ============================================================
// settings
// ============================================================
ipcMain.handle('get-settings', () => loadSettings());
ipcMain.handle('save-settings', (event, settings) => {
  const current = loadSettings();
  const merged = { ...current, ...settings };
  saveSettingsToDisk(merged);
  return loadSettings();
});

// ============================================================
// Groq (chat + model discovery) — reusable functions
// ============================================================
async function groqListModels(apiKey) {
  try {
    const response = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { data = null; }
    return { ok: response.ok, status: response.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: null, raw: String(err) };
  }
}

async function groqChat(apiKey, model, messages) {
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, max_tokens: 500, temperature: 0.9, presence_penalty: 0.4 })
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { data = null; }
    return { ok: response.ok, status: response.status, data, raw: text };
  } catch (err) {
    return { ok: false, status: 0, data: null, raw: String(err) };
  }
}

ipcMain.handle('groq-list-models', (event, apiKey) => groqListModels(apiKey));
ipcMain.handle('groq-chat', (event, { apiKey, model, messages }) => groqChat(apiKey, model, messages));

// ============================================================
// open real, native applications
// ============================================================
const APP_COMMANDS = {
  darwin: {
    spotify: ['open -b com.spotify.client', 'open -a Spotify', 'open -a "/Applications/Spotify.app"'],
    musica: 'open -a Music',
    safari: 'open -a Safari',
    navegador: 'open -a Safari',
    chrome: 'open -a "Google Chrome"',
    mail: 'open -a Mail',
    correo: 'open -a Mail',
    calendario: 'open -a Calendar',
    notas: 'open -a Notes',
    mensajes: 'open -a Messages',
    fotos: 'open -a Photos',
    terminal: 'open -a Terminal',
    finder: 'open -a Finder',
    recordatorios: 'open -a Reminders',
    mapas: 'open -a Maps'
  },
  win32: {
    spotify: 'start spotify:',
    musica: 'start spotify:',
    safari: 'start microsoft-edge:',
    navegador: 'start microsoft-edge:',
    chrome: 'start chrome',
    mail: 'start outlookmail:',
    correo: 'start outlookmail:',
    calendario: 'start outlookcal:',
    notas: 'start "" "notepad.exe"',
    terminal: 'start cmd',
    finder: 'start explorer'
  },
  linux: {
    spotify: 'xdg-open spotify:',
    musica: 'xdg-open spotify:',
    navegador: 'xdg-open https://google.com',
    chrome: 'xdg-open https://google.com',
    terminal: 'x-terminal-emulator',
    finder: 'xdg-open .'
  }
};

const WEB_FALLBACK = {
  spotify: 'https://open.spotify.com',
  musica: 'https://open.spotify.com',
  safari: 'https://www.google.com',
  navegador: 'https://www.google.com',
  chrome: 'https://www.google.com',
  mail: 'https://mail.google.com',
  correo: 'https://mail.google.com',
  calendario: 'https://calendar.google.com',
  mapas: 'https://maps.google.com',
  youtube: 'https://www.youtube.com',
  github: 'https://github.com'
};

function performOpenApp(appName) {
  const platform = process.platform;
  const commands = APP_COMMANDS[platform] || {};
  let candidates = commands[appName];
  let generic = false;

  if (!candidates) {
    generic = true;
    const safeName = String(appName).replace(/"/g, '');
    if (platform === 'darwin') candidates = [`open -a "${safeName}"`];
    else if (platform === 'win32') candidates = [`start "" "${safeName}"`];
    else candidates = [`xdg-open "${safeName}"`];
  } else if (!Array.isArray(candidates)) {
    candidates = [candidates];
  }

  return new Promise((resolve) => {
    const tryNext = (i) => {
      if (i >= candidates.length) {
        const fallbackUrl = WEB_FALLBACK[appName];
        if (fallbackUrl) {
          shell.openExternal(fallbackUrl);
          resolve({ ok: true, method: 'web-fallback' });
        } else {
          resolve({ ok: false, error: 'not_found', generic });
        }
        return;
      }
      exec(candidates[i], (error) => {
        if (error) tryNext(i + 1);
        else resolve({ ok: true, method: generic ? 'native-generic' : 'native' });
      });
    };
    tryNext(0);
  });
}

ipcMain.handle('open-app', (event, appName) => performOpenApp(appName));
ipcMain.handle('open-url', (event, url) => { shell.openExternal(url); return { ok: true }; });

// ============================================================
// installed apps
// ============================================================
function performListApps() {
  const dirs = ['/Applications', path.join(app.getPath('home'), 'Applications')];
  let apps = [];
  for (const dir of dirs) {
    try {
      const entries = fs.readdirSync(dir);
      apps.push(...entries.filter(e => e.endsWith('.app')).map(e => e.replace(/\.app$/, '')));
    } catch (e) { /* ignore */ }
  }
  return { ok: true, apps: [...new Set(apps)].sort() };
}
ipcMain.handle('list-apps', () => performListApps());

// ============================================================
// files
// ============================================================
function performListFiles(folderName) {
  const map = {
    escritorio: 'Desktop', desktop: 'Desktop',
    documentos: 'Documents', documents: 'Documents',
    descargas: 'Downloads', downloads: 'Downloads',
    musica: 'Music', music: 'Music',
    fotos: 'Pictures', pictures: 'Pictures',
    peliculas: 'Movies', movies: 'Movies',
    aplicaciones: '/Applications', applications: '/Applications'
  };
  const key = (folderName || '').toLowerCase().trim();
  // if it's not one of the shortcuts, treat it as a literal path (expand ~ and
  // relative-to-home paths) so ANY folder on the whole computer can be listed
  let dirPath;
  if (map[key]) {
    dirPath = map[key].startsWith('/') ? map[key] : path.join(app.getPath('home'), map[key]);
  } else if (folderName && (folderName.startsWith('/') || folderName.startsWith('~'))) {
    dirPath = folderName.replace(/^~/, app.getPath('home'));
  } else {
    dirPath = path.join(app.getPath('home'), 'Desktop');
  }
  try {
    const entries = fs.readdirSync(dirPath).filter(f => !f.startsWith('.'));
    return { ok: true, folder: dirPath, entries };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
ipcMain.handle('list-files', (event, folderName) => performListFiles(folderName));

function performSearchFile(query, scope) {
  const safe = String(query).replace(/"/g, '');
  // default to the home folder (fast & reliable without extra permissions);
  // pass an explicit scope to search elsewhere (e.g. the whole disk)
  const searchRoot = scope || app.getPath('home');
  return new Promise((resolve) => {
    exec(`mdfind -name "${safe}" -onlyin "${searchRoot}"`, { timeout: 15000 }, (error, stdout) => {
      if (error) return resolve({ ok: false, error: String(error) });
      resolve({ ok: true, results: stdout.split('\n').filter(Boolean).slice(0, 15) });
    });
  });
}
ipcMain.handle('search-file', (event, query, scope) => performSearchFile(query, scope));

function performOpenFile(filePath) {
  return shell.openPath(filePath).then(result => ({ ok: result === '', error: result || null }));
}
ipcMain.handle('open-file', (event, filePath) => performOpenFile(filePath));

// read a text file's contents (so JARVIS can read documents/notes/code back to you)
ipcMain.handle('read-file', (event, filePath) => {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > 200000) return { ok: false, error: 'file_too_large' };
    const content = fs.readFileSync(filePath, 'utf-8');
    return { ok: true, content };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// copy / move / delete - real file management, not just opening things
ipcMain.handle('copy-file', (event, src, dest) => {
  try { fs.copyFileSync(src, dest); return { ok: true }; }
  catch (err) { return { ok: false, error: String(err) }; }
});
ipcMain.handle('move-file', (event, src, dest) => {
  try { fs.renameSync(src, dest); return { ok: true }; }
  catch (err) { return { ok: false, error: String(err) }; }
});
ipcMain.handle('delete-file', (event, filePath) => {
  try { fs.rmSync(filePath, { recursive: false }); return { ok: true }; }
  catch (err) { return { ok: false, error: String(err) }; }
});

// ============================================================
// printing
// ============================================================
function performPrinterStatus() {
  return new Promise((resolve) => {
    exec('lpstat -p -d', (error, stdout) => {
      if (error) return resolve({ ok: false, error: String(error) });
      resolve({ ok: true, raw: stdout.trim() });
    });
  });
}
ipcMain.handle('printer-status', () => performPrinterStatus());
ipcMain.handle('list-printers', () => performPrinterStatus());

// asks macOS's Spotlight metadata for the real page count of a PDF, so we
// can always tell CUPS explicitly "print pages 1 through N" instead of
// leaving it to guess (which is what caused it to sometimes only print 1 page)
function getPdfPageCount(filePath) {
  return new Promise((resolve) => {
    const safePath = filePath.replace(/"/g, '');
    exec(`mdls -raw -name kMDItemNumberOfPages "${safePath}"`, (error, stdout) => {
      const n = parseInt(stdout, 10);
      resolve(Number.isFinite(n) && n > 0 ? n : null);
    });
  });
}

async function performPrintFile(filePath, colorMode, pageRange) {
  const safePath = filePath.replace(/"/g, '');
  const colorOpt = colorMode === 'gray' ? '-o ColorModel=Gray -o print-color-mode=monochrome'
    : colorMode === 'color' ? '-o ColorModel=RGB -o print-color-mode=color'
    : '';

  // if no explicit range was requested, find the real page count and force
  // the FULL range explicitly - never leave it to the default
  let finalRange = pageRange;
  if (!finalRange) {
    const totalPages = await getPdfPageCount(filePath);
    if (totalPages && totalPages > 1) finalRange = `1-${totalPages}`;
  }
  const pageOpt = finalRange ? `-P "${finalRange.replace(/[^0-9,\-]/g, '')}"` : '';

  return new Promise((resolve) => {
    exec(`lp ${colorOpt} ${pageOpt} "${safePath}"`, (error, stdout, stderr) => {
      if (error) return resolve({ ok: false, error: stderr || String(error) });
      resolve({ ok: true, output: stdout.trim(), pagesUsed: finalRange || 'todas' });
    });
  });
}
ipcMain.handle('print-file', (event, filePath, colorMode, pageRange) => performPrintFile(filePath, colorMode, pageRange));

// opens the file in Preview/QuickLook style so you can see exactly what
// you're about to print before it goes to the printer
function performPreviewFile(filePath) {
  return new Promise((resolve) => {
    exec(`open -a Preview "${filePath.replace(/"/g, '')}"`, (error) => {
      resolve({ ok: !error });
    });
  });
}
ipcMain.handle('preview-file', (event, filePath) => performPreviewFile(filePath));

// ============================================================
// AppleScript helper + Calendar
// ============================================================
function runAppleScript(script) {
  return new Promise((resolve) => {
    const tmpFile = path.join(os.tmpdir(), `jarvis-script-${Date.now()}.scpt`);
    fs.writeFileSync(tmpFile, script, 'utf-8');
    exec(`osascript "${tmpFile}"`, { timeout: 20000 }, (error, stdout, stderr) => {
      try { fs.unlinkSync(tmpFile); } catch (e) { /* ignore */ }
      if (error) return resolve({ ok: false, error: stderr || String(error) });
      resolve({ ok: true, raw: stdout.trim() });
    });
  });
}

function performGetCalendarEvents() {
  if (process.platform !== 'darwin') return Promise.resolve({ ok: false, error: 'not_macos' });
  const script = `
set output to ""
tell application "Calendar"
	set todayDate to current date
	set startOfDay to todayDate - (time of todayDate)
	set endOfDay to startOfDay + (24 * 60 * 60) - 1
	repeat with cal in calendars
		try
			set theEvents to (every event of cal whose start date is greater than or equal to startOfDay and start date is less than or equal to endOfDay)
			repeat with e in theEvents
				set output to output & (summary of e) & " - " & (start date of e as string) & linefeed
			end repeat
		end try
	end repeat
end tell
return output
`;
  return runAppleScript(script);
}
ipcMain.handle('get-calendar-events', () => performGetCalendarEvents());

// ============================================================
// daily briefing: calendar + news + gaming news, all free (no API keys),
// using Google News RSS feeds
// ============================================================
async function fetchRssTitles(url, limit) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const xml = await res.text();
    const matches = [...xml.matchAll(/<item>[\s\S]*?<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/g)];
    return matches.slice(0, limit).map(m => m[1].trim()).filter(Boolean);
  } catch (e) {
    return [];
  }
}

async function performBriefing() {
  const [calendar, generalNews, gamingNews] = await Promise.all([
    performGetCalendarEvents(),
    fetchRssTitles('https://news.google.com/rss?hl=es-419&gl=MX&ceid=MX:es-419', 4),
    fetchRssTitles('https://news.google.com/rss/search?q=videojuegos&hl=es-419&gl=MX&ceid=MX:es-419', 3)
  ]);

  const hour = new Date().getHours();
  const saludo = hour < 12 ? 'Buenos dias' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';

  const calendarLines = (!calendar.ok || !calendar.raw)
    ? ['Sin eventos programados para hoy']
    : calendar.raw.split('\n').filter(Boolean);

  const spoken = [
    `${saludo}, senor.`,
    calendarLines[0] === 'Sin eventos programados para hoy'
      ? 'No tiene eventos programados para hoy.'
      : `En su agenda de hoy tiene: ${calendarLines.join('; ')}.`,
    generalNews.length ? `En noticias generales: ${generalNews.join('. ')}.` : 'No pude obtener noticias en este momento.',
    gamingNews.length ? `Y en videojuegos: ${gamingNews.join('. ')}.` : 'No encontre novedades de videojuegos.'
  ].join(' ');

  const visual = [
    `${saludo}, senor. Esto es lo que tiene hoy:`,
    '',
    '📅 CALENDARIO',
    ...calendarLines.map(l => `• ${l}`),
    '',
    '📰 NOTICIAS',
    ...(generalNews.length ? generalNews.map(n => `• ${n}`) : ['• No disponibles en este momento']),
    '',
    '🎮 VIDEOJUEGOS',
    ...(gamingNews.length ? gamingNews.map(n => `• ${n}`) : ['• No disponibles en este momento'])
  ].join('\n');

  return { spoken, visual };
}
ipcMain.handle('get-briefing', () => performBriefing());

// ============================================================
// Spotify
// ============================================================
function delay(ms) { return new Promise(res => setTimeout(res, ms)); }

async function performSpotifyPlay(query) {
  const encoded = encodeURIComponent(query);
  if (process.platform !== 'darwin') {
    shell.openExternal('https://open.spotify.com/search/' + encoded);
    return { ok: true, method: 'web-fallback' };
  }
  await new Promise((resolve) => exec('open -b com.spotify.client', () => resolve()));
  await delay(1200);
  const script = `
tell application "Spotify"
	activate
	play track "spotify:search:${encoded}"
end tell
`;
  const result = await runAppleScript(script);
  if (!result.ok) {
    shell.openExternal('https://open.spotify.com/search/' + encoded);
    return { ok: true, method: 'web-fallback' };
  }
  return { ok: true, method: 'native' };
}
ipcMain.handle('spotify-play', (event, query) => performSpotifyPlay(query));

// ============================================================
// local mic transcription (used by the desktop app's VOZ tab, since
// Electron's built-in SpeechRecognition doesn't work without a Google
// API key that stock Electron builds lack). We record audio in the
// renderer and transcribe it here with Groq's Whisper instead.
// ============================================================
ipcMain.handle('transcribe-audio', async (event, { audioBase64, mimeType }) => {
  const settings = loadSettings();
  if (!settings.apiKey) return { ok: false, text: '', error: 'no_api_key' };
  const ext = (mimeType || '').includes('mp4') ? 'm4a' : 'webm';
  const tmpPath = path.join(os.tmpdir(), `jarvis-mic-${Date.now()}.${ext}`);
  try {
    fs.writeFileSync(tmpPath, Buffer.from(audioBase64, 'base64'));
    const text = await transcribeAudio(tmpPath, settings.apiKey, settings.language || 'es');
    return { ok: true, text };
  } catch (err) {
    return { ok: false, text: '', error: String(err) };
  } finally {
    try { fs.unlinkSync(tmpPath); } catch (e) { /* ignore */ }
  }
});

// ============================================================
// REMOTE BRIDGE — WhatsApp (via Meta Cloud API) + a tiny Cloudflare
// Worker as mailbox. The Mac only makes OUTBOUND requests (polling
// the Worker, calling Meta's API), so no ports need to be opened.
// ============================================================
const MODEL_PREFERENCE = [
  'llama-3.3-70b-versatile',
  'openai/gpt-oss-120b',
  'llama-3.1-8b-instant',
  'openai/gpt-oss-20b',
  'qwen/qwen3-32b'
];

async function detectBestModelMain(apiKey) {
  const result = await groqListModels(apiKey);
  if (!result.ok || !result.data?.data) return null;
  const available = result.data.data.map(m => m.id);
  for (const pref of MODEL_PREFERENCE) if (available.includes(pref)) return pref;
  const usable = available.filter(id => !/whisper|tts|guard|moderation|distil/i.test(id));
  return usable[0] || available[0] || null;
}

// mirrors the same local-command logic used in renderer.js, so remote
// commands (from WhatsApp) behave the same as typing them in the app
async function processRemoteCommand(text) {
  const t = text.trim().toLowerCase();
  const settings = loadSettings();

  if (/^(hola|hey|buenas|buenos dias|buenas tardes|buenas noches)?[\s,]*jarvis[\s!.,]*$/.test(t) || t === 'hola') {
    const briefing = await performBriefing();
    return briefing.spoken;
  }

  if (t === 'hora' || t.includes('que hora es')) {
    const now = new Date();
    return `Son las ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}, senor.`;
  }

  const filesMatch = t.match(/(?:que archivos hay en|que hay en)\s+(?:el |mi |la )?(escritorio|desktop|documentos|documents|descargas|downloads)/);
  if (filesMatch) {
    const result = performListFiles(filesMatch[1]);
    if (!result.ok) return 'No pude leer esa carpeta, senor.';
    if (!result.entries.length) return `La carpeta ${result.folder} esta vacia, senor.`;
    return `En ${result.folder} tiene, senor:\n` + result.entries.slice(0, 40).join(', ');
  }

  const printMatch = t.match(/^imprime(?:r)?\s+(?:el |la |mi )?(?:archivo\s+)?(.+)/);
  if (printMatch) {
    const search = await performSearchFile(printMatch[1].trim());
    if (!search.ok || !search.results.length) return `No encontre un archivo llamado "${printMatch[1]}", senor.`;
    const printResult = await performPrintFile(search.results[0]);
    return printResult.ok
      ? `Enviando "${search.results[0]}" a la impresora, senor. Si esta apagada tendra que encenderla con el boton fisico.`
      : `No pude enviar el archivo a imprimir, senor.`;
  }

  if (/calendario|agenda|eventos de hoy|que tengo (hoy|programado)/.test(t)) {
    const result = await performGetCalendarEvents();
    if (!result.ok) return 'No pude leer su Calendario, senor.';
    if (!result.raw) return 'No tiene eventos programados para hoy, senor.';
    return 'Esto es lo que tiene en su calendario hoy, senor:\n' + result.raw;
  }

  const playMatch = t.match(/^(?:reproduce|reproducir|pon|ponme|toca|play)\s+(.+)/);
  if (playMatch) {
    const song = playMatch[1].replace(/\s+en spotify$/, '').trim();
    const result = await performSpotifyPlay(song);
    return result.method === 'native'
      ? `Reproduciendo "${song}" en Spotify, senor.`
      : `Le mande la busqueda de "${song}" a Spotify, senor.`;
  }

  const openMatch = t.match(/^(?:abre|abrir|inicia|lanza)\s+(?:la |el |la app |la aplicacion |el juego )?(.+)/);
  if (openMatch) {
    const result = await performOpenApp(openMatch[1].trim());
    return result.ok ? `Abriendo ${openMatch[1].trim()}, senor.` : `No pude abrir ${openMatch[1].trim()}, senor.`;
  }

  // fallback: general conversation via Groq
  if (!settings.apiKey) {
    return 'No tengo configurada mi llave de Groq, senor. Configuresela primero desde la app de la Mac.';
  }
  let model = settings.model;
  if (!model) model = await detectBestModelMain(settings.apiKey);
  const systemPrompt = `Eres J.A.R.V.I.S., el asistente de IA personal de Tony Stark. Responde siempre en español, formal, calmado, ligeramente ingenioso, llamando al usuario "senor". Se conciso (2-4 frases), ya que esto se va a leer en voz alta por WhatsApp.`;
  const result = await groqChat(settings.apiKey, model, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: text }
  ]);
  if (!result.ok) return 'Hubo un fallo al contactar mi nucleo central, senor.';
  return result.data?.choices?.[0]?.message?.content?.trim() || 'Disculpe senor, no pude procesar esa solicitud.';
}

// ---------- WhatsApp (Meta Cloud API) helpers ----------
const GRAPH_BASE = 'https://graph.facebook.com/v20.0';

async function downloadWhatsAppMedia(mediaId, token) {
  const metaRes = await fetch(`${GRAPH_BASE}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const meta = await metaRes.json();
  if (!meta.url) throw new Error('no_media_url');

  const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
  const buffer = Buffer.from(await fileRes.arrayBuffer());
  const tmpPath = path.join(os.tmpdir(), `jarvis-in-${Date.now()}.ogg`);
  fs.writeFileSync(tmpPath, buffer);
  return tmpPath;
}

async function transcribeAudio(filePath, apiKey, language) {
  const fileBuffer = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('file', new Blob([fileBuffer]), path.basename(filePath));
  form.append('model', 'whisper-large-v3');
  // pin the language instead of letting Whisper auto-detect - auto-detect on
  // short clips is what causes it to occasionally mishear/mistranslate you
  if (language) form.append('language', language);
  // temperature 0 = most deterministic/consistent transcription (less "creative" guessing)
  form.append('temperature', '0');
  // biasing prompt: gives Whisper a hint of the vocabulary it will likely hear,
  // which meaningfully improves accuracy on command words and names
  form.append('prompt', 'JARVIS, imprime, imprimir, calendario, agenda, Spotify, reproduce, hora, sistemas, aplicaciones, archivo, escritorio, documentos, descargas, busca, buscar, abre, abrir, impresora, color, blanco y negro, terminal, navegador, correo, notas.');

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  });
  const data = await res.json();
  return data.text || '';
}

function synthesizeSpeech(text) {
  return new Promise((resolve, reject) => {
    const outPath = path.join(os.tmpdir(), `jarvis-out-${Date.now()}.m4a`);
    const safeText = text.replace(/"/g, "'");
    exec(`say -v Paulina -o "${outPath}" --file-format=m4af --data-format=aac "${safeText}"`, (error) => {
      if (error) {
        // fallback to default system voice if "Paulina" isn't installed
        exec(`say -o "${outPath}" --file-format=m4af --data-format=aac "${safeText}"`, (err2) => {
          if (err2) reject(err2); else resolve(outPath);
        });
      } else {
        resolve(outPath);
      }
    });
  });
}

async function uploadWhatsAppMedia(filePath, token, phoneId) {
  const fileBuffer = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('file', new Blob([fileBuffer], { type: 'audio/mp4' }), 'reply.m4a');
  form.append('type', 'audio/mp4');
  form.append('messaging_product', 'whatsapp');

  const res = await fetch(`${GRAPH_BASE}/${phoneId}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  const data = await res.json();
  return data.id;
}

async function sendWhatsAppAudio(phoneId, token, to, mediaId) {
  return fetch(`${GRAPH_BASE}/${phoneId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'audio', audio: { id: mediaId } })
  });
}

async function sendWhatsAppText(phoneId, token, to, text) {
  return fetch(`${GRAPH_BASE}/${phoneId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } })
  });
}

let lastProcessedRemoteId = null;
let lastProcessedWebId = null;

// evita que dos mensajes se procesen en paralelo si la respuesta tarda mas
// que el intervalo de polling (antes un comando podia pisar al otro)
let bridgeBusy = false;

async function ackWorker(base, secret, endpoint) {
  try {
    await fetch(`${base}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret })
    });
  } catch (e) { /* si falla, se reintenta en el proximo ciclo */ }
}

// heartbeat: avisa al worker cada pocos segundos que la app de escritorio
// esta viva. Asi el remote puede mostrar "EN LINEA" o "JARVIS esta dormido".
async function sendHeartbeat() {
  const settings = loadSettings();
  if (!settings.workerUrl || !settings.workerSecret) return;
  const base = settings.workerUrl.replace(/\/$/, '');
  try {
    await fetch(`${base}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: settings.workerSecret })
    });
  } catch (e) { /* sin internet o worker caido - no importa, se reintenta */ }
}

async function pollRemoteBridge() {
  const settings = loadSettings();
  if (!settings.remoteEnabled || !settings.workerUrl || !settings.workerSecret || !settings.whatsappToken || !settings.whatsappPhoneId) return;
  if (bridgeBusy) return;

  const base = settings.workerUrl.replace(/\/$/, '');
  bridgeBusy = true;

  try {
    const res = await fetch(`${base}/inbox?secret=${encodeURIComponent(settings.workerSecret)}`);
    if (!res.ok) return;
    const data = await res.json();
    if (!data || !data.id || data.id === lastProcessedRemoteId) return;
    lastProcessedRemoteId = data.id;

    let text = '';
    if (data.kind === 'text') {
      text = data.text || '';
    } else if (data.kind === 'audio') {
      if (!settings.apiKey) {
        await sendWhatsAppText(settings.whatsappPhoneId, settings.whatsappToken, data.from,
          'No tengo configurada mi llave de Groq, senor. Configuresela desde la app de la Mac para poder escuchar notas de voz.');
        await ackWorker(base, settings.workerSecret, 'ack');
        return;
      }
      const audioPath = await downloadWhatsAppMedia(data.mediaId, settings.whatsappToken);
      text = await transcribeAudio(audioPath, settings.apiKey, settings.language || 'es');
      try { fs.unlinkSync(audioPath); } catch (e) { /* ignore */ }
    } else {
      // mensaje no soportado: limpiar el inbox para que no se reprocese
      await ackWorker(base, settings.workerSecret, 'ack');
      return;
    }

    if (!text.trim()) return;

    const reply = await processRemoteCommand(text);

    try {
      const replyAudioPath = await synthesizeSpeech(reply);
      const mediaId = await uploadWhatsAppMedia(replyAudioPath, settings.whatsappToken, settings.whatsappPhoneId);
      try { fs.unlinkSync(replyAudioPath); } catch (e) { /* ignore */ }
      if (mediaId) {
        await sendWhatsAppAudio(settings.whatsappPhoneId, settings.whatsappToken, data.from, mediaId);
      } else {
        await sendWhatsAppText(settings.whatsappPhoneId, settings.whatsappToken, data.from, reply);
      }
    } catch (err) {
      console.error('voice reply failed, falling back to text:', err);
      await sendWhatsAppText(settings.whatsappPhoneId, settings.whatsappToken, data.from, reply);
    }

    // ya respondimos: limpiar el inbox para no repetir la respuesta si la
    // app se reinicia (antes el ultimo mensaje se volvia a procesar)
    await ackWorker(base, settings.workerSecret, 'ack');
  } catch (err) {
    console.error('remote bridge error:', err);
  } finally {
    bridgeBusy = false;
  }
}

function startRemoteBridgeLoop() {
  setInterval(pollRemoteBridge, 3000);
  setInterval(pollWebBridge, 2500);
  // heartbeat de inmediato y luego cada 5 segundos
  sendHeartbeat();
  setInterval(sendHeartbeat, 5000);
}

// ============================================================
// WEB CONTROL PANEL bridge (phone browser page, no WhatsApp needed)
// ============================================================

async function pollWebBridge() {
  const settings = loadSettings();
  if (!settings.remoteEnabled || !settings.workerUrl || !settings.workerSecret) return;
  if (bridgeBusy) return;

  const base = settings.workerUrl.replace(/\/$/, '');
  bridgeBusy = true;

  try {
    const res = await fetch(`${base}/web-poll?secret=${encodeURIComponent(settings.workerSecret)}`);
    if (!res.ok) return;
    const data = await res.json();
    if (!data || !data.id || data.id === lastProcessedWebId) return;
    lastProcessedWebId = data.id;

    let text = '';
    if (data.kind === 'text') {
      text = data.text || '';
    } else if (data.kind === 'audio' && data.audioBase64) {
      if (!settings.apiKey) {
        await fetch(`${base}/web-reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ secret: settings.workerSecret, id: data.id,
            text: 'No tengo configurada mi llave de Groq, senor. Configuresela desde la app de la Mac para poder escuchar notas de voz.' })
        });
        await ackWorker(base, settings.workerSecret, 'web-ack');
        return;
      }
      const ext = (data.mimeType || '').includes('mp4') ? 'm4a' : 'webm';
      const tmpPath = path.join(os.tmpdir(), `jarvis-web-in-${Date.now()}.${ext}`);
      fs.writeFileSync(tmpPath, Buffer.from(data.audioBase64, 'base64'));
      text = await transcribeAudio(tmpPath, settings.apiKey, settings.language || 'es');
      try { fs.unlinkSync(tmpPath); } catch (e) { /* ignore */ }
    }

    if (!text.trim()) return;

    const reply = await processRemoteCommand(text);

    await fetch(`${base}/web-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: settings.workerSecret, id: data.id, text: reply })
    });

    // limpiar el comando ya respondido para no repetirlo tras un reinicio
    await ackWorker(base, settings.workerSecret, 'web-ack');
  } catch (err) {
    console.error('web bridge error:', err);
  } finally {
    bridgeBusy = false;
  }
}
