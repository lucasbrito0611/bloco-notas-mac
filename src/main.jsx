import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

// Fora do Electron (ex.: abrindo o Vite no navegador), salva no localStorage
// e guarda os anexos dentro da própria nota, como data URL.
if (!window.notesApi) {
  window.notesApi = {
    load: async () => JSON.parse(localStorage.getItem('notes') || 'null'),
    save: async (data) => localStorage.setItem('notes', JSON.stringify(data)),
    saveAttachment: async ({ name, type, bytes }) => {
      const url = await new Promise((ok) => {
        const reader = new FileReader()
        reader.onload = () => ok(reader.result)
        reader.readAsDataURL(new Blob([bytes], { type }))
      })
      return { url, name, size: bytes.byteLength, mime: type }
    },
    openAttachment: async (url) => window.open(url),
    cleanupAttachments: async () => 0,
    version: async () => 'web',
    getUpdate: async () => null,
    downloadUpdate: async () => {},
    installUpdate: async () => {},
    onUpdate: () => () => {},
  }
}

createRoot(document.getElementById('root')).render(<App />)
