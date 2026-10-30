import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

// Fora do Electron (ex.: abrindo o Vite no navegador), salva no localStorage.
if (!window.notesApi) {
  window.notesApi = {
    load: async () => JSON.parse(localStorage.getItem('notes') || 'null'),
    save: async (data) => localStorage.setItem('notes', JSON.stringify(data)),
  }
}

createRoot(document.getElementById('root')).render(<App />)
