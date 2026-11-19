const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('notesApi', {
  load: () => ipcRenderer.invoke('notes:load'),
  save: (data) => ipcRenderer.invoke('notes:save', data),
  exportNotes: (data, referencedUrls) => ipcRenderer.invoke('notes:export', data, referencedUrls),
  importNotes: () => ipcRenderer.invoke('notes:import'),
  saveAttachment:(file) => ipcRenderer.invoke('attachments:save', file),
  openAttachment: (url) => ipcRenderer.invoke('attachments:open', url),
  cleanupAttachments: (referencedUrls) => ipcRenderer.invoke('attachments:cleanup', referencedUrls),
  version: () => ipcRenderer.invoke('app:version'),
  getUpdate: () => ipcRenderer.invoke('update:get'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdate: (callback) => {
    const listener = (_e, status) => callback(status)
    ipcRenderer.on('update:status', listener)
    return () => ipcRenderer.removeListener('update:status', listener)
  },
  // Antes de fechar a janela, o processo principal pede para gravar; confirmClose() avisa que já gravou.
  onBeforeClose: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('app:before-close', listener)
    return () => ipcRenderer.removeListener('app:before-close', listener)
  },
  confirmClose: () => ipcRenderer.invoke('app:close-ready'),
})
