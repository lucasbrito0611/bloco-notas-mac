const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('notesApi', {
  load: () => ipcRenderer.invoke('notes:load'),
  save: (data) => ipcRenderer.invoke('notes:save', data),
})
