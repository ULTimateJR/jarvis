const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('jarvis', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  chat: (payload) => ipcRenderer.invoke('groq-chat', payload),
  listModels: (apiKey) => ipcRenderer.invoke('groq-list-models', apiKey),
  openApp: (name) => ipcRenderer.invoke('open-app', name),
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
  listApps: () => ipcRenderer.invoke('list-apps'),
  listFiles: (folder) => ipcRenderer.invoke('list-files', folder),
  searchFile: (query) => ipcRenderer.invoke('search-file', query),
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
  getCalendarEvents: () => ipcRenderer.invoke('get-calendar-events'),
  playSpotify: (query) => ipcRenderer.invoke('spotify-play', query),
  getBriefing: () => ipcRenderer.invoke('get-briefing'),
  boostMic: (level) => ipcRenderer.invoke('boost-mic', level),
  transcribeAudio: (payload) => ipcRenderer.invoke('transcribe-audio', payload),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  copyFile: (src, dest) => ipcRenderer.invoke('copy-file', src, dest),
  moveFile: (src, dest) => ipcRenderer.invoke('move-file', src, dest),
  deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  listPrinters: () => ipcRenderer.invoke('list-printers'),
  printerStatus: () => ipcRenderer.invoke('printer-status'),
  printFile: (filePath, colorMode, pageRange) => ipcRenderer.invoke('print-file', filePath, colorMode, pageRange),
  previewFile: (filePath) => ipcRenderer.invoke('preview-file', filePath)
});
