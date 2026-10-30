// Estados da atualização, sem React e sem Electron, para poder ser testado.
//
// idle         nenhuma versão nova
// available    existe versão nova; o modal aparece, a menos que o usuário tenha clicado em "Agora não"
// downloading  o usuário aceitou e o instalador está sendo baixado
// installing   baixou; o app salva as notas, fecha, instala e reabre sozinho
// error        o download ou a instalação falhou

export const initialUpdate = { phase: 'idle', version: null, percent: 0, dismissed: false, error: null }

export function updateReducer(state, event) {
  switch (event.type) {
    case 'available':
      // Uma versão ainda mais nova que a recusada volta a mostrar o modal.
      if (state.phase === 'downloading' || state.phase === 'installing') return state
      return { ...state, phase: 'available', version: event.version, dismissed: state.version === event.version && state.dismissed }
    case 'dismiss':
      return { ...state, dismissed: true }
    case 'start':
      return { ...state, phase: 'downloading', percent: 0, dismissed: false, error: null }
    case 'progress':
      return { ...state, phase: 'downloading', percent: Math.round(event.percent) }
    case 'downloaded':
      return { ...state, phase: 'installing', percent: 100 }
    case 'error':
      // Erro ao só verificar (ex.: sem internet) não deve incomodar o usuário.
      if (state.phase !== 'downloading' && state.phase !== 'installing') return state
      return { ...state, phase: 'error', error: event.message || 'Erro desconhecido' }
    case 'close':
      // Fechar o modal de erro volta para "versão disponível", com o botão de atualizar no topo.
      return { ...state, phase: 'available', dismissed: true, error: null }
    default:
      return state
  }
}

export const showUpdateModal = (s) =>
  (s.phase === 'available' && !s.dismissed) || s.phase === 'downloading' || s.phase === 'installing' || s.phase === 'error'

export const showUpdateButton = (s) => s.phase === 'available' && s.dismissed
