import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import { TableKit } from '@tiptap/extension-table'
import FileHandler from '@tiptap/extension-file-handler'
import { Attachment } from './attachment.js'

// Lista de extensões do editor, compartilhada entre o app e os testes.
// onFiles(editor, files, pos) é chamado quando o usuário cola ou arrasta arquivos.
export function buildExtensions({ onFiles } = {}) {
  const extensions = [
    StarterKit,
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder: ({ pos }) => (pos === 0 ? 'Título' : '') }),
    Image.configure({ allowBase64: true }),
    TableKit.configure({ table: { resizable: false } }),
    Attachment,
  ]
  if (onFiles) {
    extensions.push(
      FileHandler.configure({
        onPaste: (editor, files) => onFiles(editor, files),
        onDrop: (editor, files, pos) => onFiles(editor, files, pos),
      }),
    )
  }
  return extensions
}

// Transforma o anexo já salvo no conteúdo que vai para a nota: imagem aparece inline, o resto vira cartão.
export function nodeForAttachment(saved) {
  if (saved.mime?.startsWith('image/')) return { type: 'image', attrs: { src: saved.url, alt: saved.name } }
  return { type: 'attachment', attrs: { src: saved.url, name: saved.name, size: saved.size } }
}
