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
})
