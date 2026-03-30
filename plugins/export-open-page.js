;(function () {
  const plugin = {
    id: 'export-open-page',
    name: 'Export Open Page',
    version: '1.0.0',
    description:
      'Adds a minimal export button to the top bar so the currently opened page can be exported as TXT, PDF, DOCX, Markdown, HTML, or ZIP when images are present.',
    install: installPlugin,
    dispose: disposePlugin,
  }

  const EXPORT_FORMATS = [
    { id: 'txt', label: '.txt', hint: 'Plain text document' },
    { id: 'pdf', label: '.pdf', hint: 'Simple printable PDF' },
    { id: 'docx', label: '.docx', hint: 'Word document' },
    { id: 'md', label: '.md', hint: 'Markdown with structure' },
    { id: 'html', label: '.html', hint: 'Styled web page export' },
    { id: 'zip', label: '.zip', hint: 'HTML + text + image assets', requiresImages: true },
  ]

  let styleElement = null
  let buttonElement = null
  let modalOverlayElement = null
  let modalCardElement = null
  let modalMetaElement = null
  let modalFormatsElement = null
  let modalStatusElement = null
  let observer = null
  let cleanupFns = []
  let exportBusy = false
  let syncScheduled = false
  let currentSnapshot = null

  function installPlugin() {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return plugin
    }

    if (window.__linkExportOpenPagePluginInstalled) {
      return plugin
    }

    window.__linkExportOpenPagePluginInstalled = true

    syncPluginUi()

    const onKeyDown = (event) => {
      if (!modalOverlayElement || modalOverlayElement.dataset.open !== 'true') {
        return
      }

      if (event.key === 'Escape' && !exportBusy) {
        event.preventDefault()
        closeModal()
      }
    }

    observer = new MutationObserver(() => {
      scheduleUiSync()
    })
    observer.observe(document.body, { childList: true, subtree: true })

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('focus', scheduleUiSync, true)
    window.addEventListener('storage', scheduleUiSync, true)

    cleanupFns = [
      () => observer && observer.disconnect(),
      () => window.removeEventListener('keydown', onKeyDown, true),
      () => window.removeEventListener('focus', scheduleUiSync, true),
      () => window.removeEventListener('storage', scheduleUiSync, true),
    ]

    return plugin
  }

  function disposePlugin() {
    cleanupFns.forEach((cleanup) => cleanup())
    cleanupFns = []

    observer && observer.disconnect()
    observer = null

    if (buttonElement) {
      buttonElement.remove()
      buttonElement = null
    }

    if (modalOverlayElement) {
      modalOverlayElement.remove()
      modalOverlayElement = null
      modalCardElement = null
      modalMetaElement = null
      modalFormatsElement = null
      modalStatusElement = null
    }

    if (styleElement) {
      styleElement.remove()
      styleElement = null
    }

    currentSnapshot = null
    exportBusy = false

    delete window.__linkExportOpenPagePluginInstalled
  }

  function scheduleUiSync() {
    if (syncScheduled) {
      return
    }

    syncScheduled = true
    window.requestAnimationFrame(() => {
      syncScheduled = false
      syncPluginUi()
    })
  }

  function syncPluginUi() {
    ensureStyles()
    ensureModal()
    ensureExportButton()
    updateButtonVisibility()
  }

  function ensureStyles() {
    if (styleElement) {
      return
    }

    styleElement = document.createElement('style')
    styleElement.dataset.linkExportOpenPage = 'true'
    styleElement.textContent = `
.link-export-topbar-button {
  position: relative;
}

.link-export-topbar-button[data-hidden="true"] {
  display: none !important;
}

.link-export-topbar-icon {
  width: 14px;
  height: 14px;
  color: hsl(var(--muted-foreground));
  transition: color 160ms ease, transform 180ms ease;
}

.link-export-topbar-button:hover .link-export-topbar-icon,
.link-export-topbar-button:focus-visible .link-export-topbar-icon {
  color: hsl(var(--foreground));
  transform: translateY(-0.5px);
}

.link-export-overlay {
  position: fixed;
  inset: 0;
  z-index: 260;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: color-mix(in srgb, hsl(var(--background)) 74%, transparent);
  backdrop-filter: blur(14px);
  opacity: 0;
  pointer-events: none;
  transition: opacity 180ms ease;
}

.link-export-overlay[data-open="true"] {
  opacity: 1;
  pointer-events: auto;
}

.link-export-modal {
  width: min(460px, calc(100vw - 32px));
  border: 1px solid hsl(var(--border) / 0.9);
  background: color-mix(in srgb, hsl(var(--card)) 92%, transparent);
  color: hsl(var(--foreground));
  border-radius: 20px;
  box-shadow: 0 22px 70px hsl(var(--background) / 0.42);
  padding: 18px;
  transform: translateY(10px) scale(0.985);
  opacity: 0;
  transition: transform 180ms ease, opacity 180ms ease;
}

.link-export-overlay[data-open="true"] .link-export-modal {
  transform: translateY(0) scale(1);
  opacity: 1;
}

.link-export-eyebrow {
  font-size: 11px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
}

.link-export-title {
  margin-top: 8px;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.3;
}

.link-export-meta {
  margin-top: 8px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  line-height: 1.55;
}

.link-export-grid {
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.link-export-option {
  border: 1px solid hsl(var(--border) / 0.88);
  background: color-mix(in srgb, hsl(var(--muted)) 75%, transparent);
  color: inherit;
  border-radius: 14px;
  padding: 12px 13px;
  text-align: left;
  transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
}

.link-export-option:hover,
.link-export-option:focus-visible {
  outline: none;
  transform: translateY(-1px);
  border-color: hsl(var(--foreground) / 0.18);
  background: color-mix(in srgb, hsl(var(--accent)) 82%, transparent);
}

.link-export-option[disabled] {
  opacity: 0.58;
  cursor: wait;
  transform: none;
}

.link-export-option-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
}

.link-export-option-hint {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}

.link-export-footer {
  margin-top: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.link-export-status {
  min-height: 18px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.link-export-close {
  border: 1px solid hsl(var(--border) / 0.88);
  background: transparent;
  color: hsl(var(--foreground));
  border-radius: 999px;
  padding: 7px 12px;
  font-size: 12px;
  transition: background 160ms ease, border-color 160ms ease;
}

.link-export-close:hover,
.link-export-close:focus-visible {
  outline: none;
  background: hsl(var(--muted) / 0.7);
  border-color: hsl(var(--foreground) / 0.18);
}

@media (max-width: 560px) {
  .link-export-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
`
    document.head.appendChild(styleElement)
  }

  function ensureModal() {
    if (modalOverlayElement) {
      return
    }

    modalOverlayElement = document.createElement('div')
    modalOverlayElement.className = 'link-export-overlay no-drag'
    modalOverlayElement.dataset.open = 'false'

    modalOverlayElement.innerHTML = `
      <div class="link-export-modal" role="dialog" aria-modal="true" aria-labelledby="link-export-modal-title">
        <div class="link-export-eyebrow">Export page</div>
        <div class="link-export-title" id="link-export-modal-title">Export the opened page</div>
        <div class="link-export-meta"></div>
        <div class="link-export-grid"></div>
        <div class="link-export-footer">
          <div class="link-export-status"></div>
          <button class="link-export-close" type="button">Close</button>
        </div>
      </div>
    `

    modalCardElement = modalOverlayElement.querySelector('.link-export-modal')
    modalMetaElement = modalOverlayElement.querySelector('.link-export-meta')
    modalFormatsElement = modalOverlayElement.querySelector('.link-export-grid')
    modalStatusElement = modalOverlayElement.querySelector('.link-export-status')

    const closeButton = modalOverlayElement.querySelector('.link-export-close')
    closeButton.addEventListener('click', () => {
      if (!exportBusy) {
        closeModal()
      }
    })

    modalOverlayElement.addEventListener('click', (event) => {
      if (event.target === modalOverlayElement && !exportBusy) {
        closeModal()
      }
    })

    document.body.appendChild(modalOverlayElement)
  }

  function ensureExportButton() {
    const controlsRow = findTopBarControlsRow()
    if (!controlsRow) {
      return
    }

    if (!buttonElement) {
      buttonElement = document.createElement('button')
      buttonElement.type = 'button'
      buttonElement.className =
        'h-full px-3 hover:bg-muted transition-colors flex items-center justify-center group no-drag link-export-topbar-button'
      buttonElement.title = 'Export current page'
      buttonElement.setAttribute('aria-label', 'Export current page')
      buttonElement.innerHTML = `
        <svg class="link-export-topbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 3v11"></path>
          <path d="M8.25 10.25 12 14l3.75-3.75"></path>
          <path d="M5 16.75v1.1A2.15 2.15 0 0 0 7.15 20h9.7A2.15 2.15 0 0 0 19 17.85v-1.1"></path>
        </svg>
      `
      buttonElement.addEventListener('click', () => {
        void openModal()
      })
    }

    if (buttonElement.parentElement !== controlsRow) {
      const pluginsButton = controlsRow.querySelector('button')
      if (pluginsButton) {
        controlsRow.insertBefore(buttonElement, pluginsButton)
      } else {
        controlsRow.appendChild(buttonElement)
      }
    }
  }

  function findTopBarControlsRow() {
    const topBar = document.querySelector('.drag-region')
    if (!topBar || !topBar.lastElementChild) {
      return null
    }

    const rightContainer = topBar.lastElementChild
    const controlsRow = rightContainer.lastElementChild
    return controlsRow && controlsRow.tagName === 'DIV' ? controlsRow : null
  }

  function updateButtonVisibility() {
    if (!buttonElement) {
      return
    }

    buttonElement.dataset.hidden = isPageViewActive() ? 'false' : 'true'
  }

  function isPageViewActive() {
    const pageId = getActivePageId()
    const titleInput = document.querySelector('.editor-padding-area input[placeholder="Untitled"]')
    return Boolean(pageId && titleInput)
  }

  async function openModal() {
    if (exportBusy) {
      return
    }

    ensureModal()
    modalOverlayElement.dataset.open = 'true'
    setStatus('Loading current page...')

    try {
      currentSnapshot = await loadCurrentPageSnapshot()
      updateModalMeta(currentSnapshot)
      renderFormatOptions(currentSnapshot)
      setStatus('Choose a format.')
    } catch (error) {
      currentSnapshot = null
      updateModalMeta(null)
      renderFormatOptions(null)
      setStatus(getErrorMessage(error))
    }
  }

  function closeModal() {
    if (!modalOverlayElement) {
      return
    }

    modalOverlayElement.dataset.open = 'false'
    setStatus('')
  }

  function updateModalMeta(snapshot) {
    if (!modalMetaElement) {
      return
    }

    if (!snapshot) {
      modalMetaElement.textContent = 'Open a page to export its current block content.'
      return
    }

    const imageLabel = snapshot.images.length === 1 ? '1 image' : `${snapshot.images.length} images`
    const blockLabel = snapshot.blockCount === 1 ? '1 block' : `${snapshot.blockCount} blocks`
    modalMetaElement.textContent = `${snapshot.title || 'Untitled'} - ${blockLabel} - ${imageLabel}`
  }

  function renderFormatOptions(snapshot) {
    if (!modalFormatsElement) {
      return
    }

    modalFormatsElement.innerHTML = ''

    EXPORT_FORMATS.filter((format) => !format.requiresImages || (snapshot && snapshot.images.length > 0)).forEach(
      (format) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'link-export-option'
        button.disabled = !snapshot || exportBusy
        button.innerHTML = `
          <span class="link-export-option-label">${format.label}</span>
          <span class="link-export-option-hint">${format.hint}</span>
        `
        button.addEventListener('click', () => {
          void handleFormatExport(format.id)
        })
        modalFormatsElement.appendChild(button)
      }
    )
  }

  async function handleFormatExport(formatId) {
    if (exportBusy) {
      return
    }

    exportBusy = true
    renderFormatOptions(currentSnapshot)
    setStatus(`Preparing ${formatId.toUpperCase()} export...`)

    try {
      const snapshot = await loadCurrentPageSnapshot()
      currentSnapshot = snapshot
      const exported = await exportCurrentPage(formatId, snapshot)
      downloadBlob(exported.filename, exported.blob)
      setStatus(`Saved ${exported.filename}`)
    } catch (error) {
      setStatus(getErrorMessage(error))
    } finally {
      exportBusy = false
      renderFormatOptions(currentSnapshot)
    }
  }

  async function exportCurrentPage(formatId, snapshot) {
    const items = buildExportItems(snapshot.blocks, snapshot.pagesById)
    const baseName = sanitizeFileName(snapshot.title || 'untitled-page')

    if (formatId === 'txt') {
      return {
        filename: `${baseName}.txt`,
        blob: new Blob([renderTextDocument(snapshot, items)], { type: 'text/plain;charset=utf-8' }),
      }
    }

    if (formatId === 'md') {
      return {
        filename: `${baseName}.md`,
        blob: new Blob([renderMarkdownDocument(snapshot, items)], { type: 'text/markdown;charset=utf-8' }),
      }
    }

    if (formatId === 'html') {
      return {
        filename: `${baseName}.html`,
        blob: new Blob([renderHtmlDocument(snapshot, items)], { type: 'text/html;charset=utf-8' }),
      }
    }

    if (formatId === 'pdf') {
      return buildPdfDocument(snapshot, items)
    }

    if (formatId === 'docx') {
      return buildDocxDocument(snapshot, items)
    }

    if (formatId === 'zip') {
      return buildZipExport(snapshot, items)
    }

    throw new Error(`Unsupported export format: ${formatId}`)
  }

  async function loadCurrentPageSnapshot() {
    if (!window.db || typeof window.db.getPages !== 'function' || typeof window.db.getBlocks !== 'function') {
      throw new Error('Export plugin could not access the page database.')
    }

    const pageId = getActivePageId()
    if (!pageId) {
      throw new Error('Open a page before exporting.')
    }

    const [pages, blocks] = await Promise.all([window.db.getPages(), window.db.getBlocks(pageId)])
    const pagesById = buildPagesById(pages || [])
    const page = pagesById[pageId]

    if (!page) {
      throw new Error('The current page could not be found.')
    }

    const title = getEditorTitle() || page.title || 'Untitled'
    const imageBlocks = collectImageBlocks(blocks || [])

    return {
      pageId,
      page,
      pages,
      pagesById,
      blocks: Array.isArray(blocks) ? blocks : [],
      title,
      images: imageBlocks,
      blockCount: countBlocks(blocks || []),
      exportedAt: new Date(),
    }
  }

  function getActivePageId() {
    try {
      return localStorage.getItem('lastOpenedPageId') || ''
    } catch (_error) {
      return ''
    }
  }

  function getEditorTitle() {
    const titleInput = document.querySelector('.editor-padding-area input[placeholder="Untitled"]')
    return titleInput && typeof titleInput.value === 'string' ? titleInput.value.trim() : ''
  }

  function buildPagesById(pages) {
    const pagesById = {}
    ;(function visit(nodes) {
      nodes.forEach((page) => {
        pagesById[page.id] = page
        if (Array.isArray(page.children) && page.children.length > 0) {
          visit(page.children)
        }
      })
    })(Array.isArray(pages) ? pages : [])
    return pagesById
  }

  function countBlocks(blocks) {
    let total = 0
    ;(function visit(nodes) {
      nodes.forEach((block) => {
        total += 1
        if (Array.isArray(block.children) && block.children.length > 0) {
          visit(block.children)
        }
      })
    })(Array.isArray(blocks) ? blocks : [])
    return total
  }

  function collectImageBlocks(blocks) {
    const items = []
    ;(function visit(nodes) {
      nodes.forEach((block) => {
        if (block && block.type === 'image' && typeof block.content === 'string' && block.content.trim()) {
          items.push(block)
        }
        if (Array.isArray(block.children) && block.children.length > 0) {
          visit(block.children)
        }
      })
    })(Array.isArray(blocks) ? blocks : [])
    return items
  }

  function buildExportItems(blocks, pagesById) {
    const items = []
    appendBlocksToItems(Array.isArray(blocks) ? blocks : [], items, pagesById, 0)
    return items
  }

  function appendBlocksToItems(blocks, items, pagesById, depth) {
    let numberedIndex = 0

    blocks.forEach((block, index) => {
      if (!block || typeof block !== 'object') {
        return
      }

      if (block.type === 'column_group') {
        const columns = Array.isArray(block.children) ? block.children : []
        columns.forEach((column, columnIndex) => {
          items.push({
            type: 'column_label',
            depth,
            text: `Column ${columnIndex + 1}`,
          })
          appendBlocksToItems(Array.isArray(column.children) ? column.children : [], items, pagesById, depth + 1)
        })
        numberedIndex = 0
        return
      }

      if (block.type === 'numbered') {
        numberedIndex += 1
      } else {
        numberedIndex = 0
      }

      const text = typeof block.content === 'string' ? block.content : ''
      const normalizedType = block.type || 'text'

      items.push({
        type: normalizedType,
        depth,
        text,
        checked: Boolean(block.checked),
        number: normalizedType === 'numbered' ? numberedIndex : null,
        href: normalizedType === 'page_link' && block.refId ? `link://page/${block.refId}` : '',
        label: normalizedType === 'page_link' ? resolvePageLinkLabel(block, pagesById) : '',
        src: normalizedType === 'image' ? text : '',
      })

      if (Array.isArray(block.children) && block.children.length > 0) {
        appendBlocksToItems(block.children, items, pagesById, depth + 1)
      }

      if (normalizedType !== 'numbered' && index < blocks.length - 1) {
        numberedIndex = 0
      }
    })
  }

  function resolvePageLinkLabel(block, pagesById) {
    if (typeof block.content === 'string' && block.content.trim()) {
      return block.content.trim()
    }

    if (block.refId && pagesById[block.refId] && pagesById[block.refId].title) {
      return pagesById[block.refId].title
    }

    return 'Untitled page'
  }

  function renderTextDocument(snapshot, items) {
    const lines = [snapshot.title || 'Untitled', '', `Exported: ${snapshot.exportedAt.toLocaleString()}`, '']

    items.forEach((item) => {
      const indent = '  '.repeat(item.depth || 0)
      const text = item.label || item.text || ''

      if (item.type === 'divider') {
        lines.push(`${indent}${'-'.repeat(36)}`)
        return
      }

      if (item.type === 'h1') {
        lines.push(`${indent}${text.toUpperCase()}`)
        lines.push(`${indent}${'='.repeat(Math.max(8, text.length || 8))}`)
        lines.push('')
        return
      }

      if (item.type === 'h2') {
        lines.push(`${indent}${text}`)
        lines.push(`${indent}${'-'.repeat(Math.max(6, text.length || 6))}`)
        lines.push('')
        return
      }

      if (item.type === 'h3') {
        lines.push(`${indent}${text}`)
        lines.push('')
        return
      }

      if (item.type === 'list') {
        lines.push(...prefixMultiline(text, `${indent}- `))
        return
      }

      if (item.type === 'numbered') {
        lines.push(...prefixMultiline(text, `${indent}${item.number || 1}. `))
        return
      }

      if (item.type === 'checklist') {
        lines.push(...prefixMultiline(text, `${indent}[${item.checked ? 'x' : ' '}] `))
        return
      }

      if (item.type === 'quote') {
        lines.push(...prefixMultiline(text, `${indent}> `))
        lines.push('')
        return
      }

      if (item.type === 'code') {
        lines.push(`${indent}\`\`\``)
        lines.push(...String(text || '').split(/\r?\n/).map((line) => `${indent}${line}`))
        lines.push(`${indent}\`\`\``)
        lines.push('')
        return
      }

      if (item.type === 'page_link') {
        lines.push(`${indent}${item.label || 'Untitled page'} (${item.href || ''})`)
        return
      }

      if (item.type === 'image') {
        lines.push(`${indent}[Image] ${item.src || 'Embedded image'}`)
        return
      }

      if (item.type === 'column_label') {
        lines.push(`${indent}[${item.text}]`)
        return
      }

      lines.push(...prefixMultiline(text, indent))
      if (item.type === 'text') {
        lines.push('')
      }
    })

    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
  }

  function renderMarkdownDocument(snapshot, items, options) {
    const imageMap = (options && options.imageMap) || {}
    const lines = [`# ${escapeMarkdown(snapshot.title || 'Untitled')}`, '', `Exported: ${snapshot.exportedAt.toLocaleString()}`, '']

    items.forEach((item) => {
      const indent = '  '.repeat(item.depth || 0)
      const text = item.label || item.text || ''

      if (item.type === 'divider') {
        lines.push('---', '')
        return
      }

      if (item.type === 'h1' || item.type === 'h2' || item.type === 'h3') {
        const hashes = item.type === 'h1' ? '##' : item.type === 'h2' ? '###' : '####'
        lines.push(`${hashes} ${escapeMarkdown(text || 'Untitled')}`, '')
        return
      }

      if (item.type === 'list') {
        lines.push(...prefixMultiline(escapeMarkdown(text), `${indent}- `))
        return
      }

      if (item.type === 'numbered') {
        lines.push(...prefixMultiline(escapeMarkdown(text), `${indent}${item.number || 1}. `))
        return
      }

      if (item.type === 'checklist') {
        lines.push(...prefixMultiline(escapeMarkdown(text), `${indent}- [${item.checked ? 'x' : ' '}] `))
        return
      }

      if (item.type === 'quote') {
        lines.push(...prefixMultiline(escapeMarkdown(text), `${indent}> `))
        lines.push('')
        return
      }

      if (item.type === 'code') {
        lines.push(`${indent}\`\`\``)
        lines.push(...String(text || '').split(/\r?\n/))
        lines.push(`${indent}\`\`\``)
        lines.push('')
        return
      }

      if (item.type === 'page_link') {
        lines.push(`${indent}[${escapeMarkdown(item.label || 'Untitled page')}](${item.href || '#'})`)
        return
      }

      if (item.type === 'image') {
        const src = imageMap[item.src] || item.src
        lines.push(`${indent}![Image](${src || ''})`)
        return
      }

      if (item.type === 'column_label') {
        lines.push(`${'  '.repeat(Math.max(0, (item.depth || 0) - 1))}#### ${escapeMarkdown(item.text || 'Column')}`, '')
        return
      }

      lines.push(...prefixMultiline(escapeMarkdown(text), indent))
      lines.push('')
    })

    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
  }

  function renderHtmlDocument(snapshot, items, options) {
    const imageMap = (options && options.imageMap) || {}
    const body = items
      .map((item) => renderHtmlItem(item, imageMap))
      .filter(Boolean)
      .join('\n')

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(snapshot.title || 'Untitled')}</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #fafaf8;
      --card: rgba(255,255,255,0.84);
      --text: #171717;
      --muted: #666;
      --border: rgba(0,0,0,0.1);
      --accent: #f0ece4;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #121212;
        --card: rgba(28,28,28,0.88);
        --text: #f7f7f4;
        --muted: #a4a4a0;
        --border: rgba(255,255,255,0.1);
        --accent: #23221d;
      }
    }
    body {
      margin: 0;
      padding: 48px 20px 72px;
      background:
        radial-gradient(circle at top left, rgba(208,196,172,0.16), transparent 36%),
        radial-gradient(circle at bottom right, rgba(143,180,171,0.12), transparent 28%),
        var(--bg);
      color: var(--text);
      font: 16px/1.7 Georgia, "Times New Roman", serif;
    }
    .page {
      width: min(860px, calc(100vw - 40px));
      margin: 0 auto;
      border: 1px solid var(--border);
      background: var(--card);
      backdrop-filter: blur(18px);
      border-radius: 28px;
      padding: 36px clamp(20px, 4vw, 48px);
      box-shadow: 0 30px 90px rgba(0,0,0,0.08);
    }
    .meta {
      margin: 0 0 24px;
      font-size: 12px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--muted);
    }
    h1, h2, h3, p, pre, blockquote, figure, hr, .row, .column-label {
      margin-top: 0;
      margin-bottom: 14px;
    }
    h1 { font-size: clamp(2.2rem, 6vw, 3.2rem); line-height: 1.06; margin-bottom: 20px; }
    h2 { font-size: 1.75rem; line-height: 1.18; margin-top: 26px; }
    h3 { font-size: 1.22rem; line-height: 1.24; margin-top: 20px; }
    p { white-space: pre-wrap; }
    .row { display: flex; align-items: flex-start; gap: 10px; white-space: pre-wrap; }
    .marker { width: 22px; flex: 0 0 22px; color: var(--muted); }
    .quote { border-left: 4px solid var(--border); padding-left: 16px; color: var(--muted); font-style: italic; }
    pre { white-space: pre-wrap; padding: 16px; border-radius: 16px; background: var(--accent); border: 1px solid var(--border); overflow-wrap: anywhere; }
    hr { border: 0; border-top: 1px solid var(--border); margin: 26px 0; }
    figure { margin: 22px 0; }
    img { max-width: 100%; border-radius: 18px; border: 1px solid var(--border); display: block; }
    .link { color: inherit; text-decoration: underline; text-underline-offset: 3px; }
    .column-label {
      display: inline-flex;
      align-items: center;
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 6px 10px;
      font-size: 12px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <article class="page">
    <p class="meta">Exported ${escapeHtml(snapshot.exportedAt.toLocaleString())}</p>
    <h1>${escapeHtml(snapshot.title || 'Untitled')}</h1>
    ${body}
  </article>
</body>
</html>`
  }

  function renderHtmlItem(item, imageMap) {
    const margin = (item.depth || 0) * 24
    const text = item.label || item.text || ''
    const style = margin ? ` style="margin-left:${margin}px"` : ''

    if (item.type === 'divider') {
      return `<hr${style} />`
    }

    if (item.type === 'h1' || item.type === 'h2' || item.type === 'h3') {
      const tag = item.type
      return `<${tag}${style}>${formatHtmlText(text)}</${tag}>`
    }

    if (item.type === 'list') {
      return `<div class="row"${style}><span class="marker">&#8226;</span><span>${formatHtmlText(text)}</span></div>`
    }

    if (item.type === 'numbered') {
      return `<div class="row"${style}><span class="marker">${item.number || 1}.</span><span>${formatHtmlText(text)}</span></div>`
    }

    if (item.type === 'checklist') {
      return `<div class="row"${style}><span class="marker">${item.checked ? '&#10003;' : '&#9633;'}</span><span>${formatHtmlText(text)}</span></div>`
    }

    if (item.type === 'quote') {
      return `<blockquote class="quote"${style}>${formatHtmlText(text)}</blockquote>`
    }

    if (item.type === 'code') {
      return `<pre${style}><code>${escapeHtml(text)}</code></pre>`
    }

    if (item.type === 'page_link') {
      const href = item.href || '#'
      return `<p${style}><a class="link" href="${escapeHtml(href)}">${formatHtmlText(item.label || 'Untitled page')}</a></p>`
    }

    if (item.type === 'image') {
      const src = imageMap[item.src] || item.src
      return `<figure${style}><img src="${escapeHtml(src || '')}" alt="Exported image" /></figure>`
    }

    if (item.type === 'column_label') {
      return `<div class="column-label"${style}>${escapeHtml(item.text || 'Column')}</div>`
    }

    return `<p${style}>${formatHtmlText(text)}</p>`
  }

  async function buildDocxDocument(snapshot, items) {
    const documentXml = buildDocxDocumentXml(snapshot, items)
    const coreXml = buildDocxCoreXml(snapshot)
    const appXml = buildDocxAppXml()
    const stylesXml = buildDocxStylesXml()
    const relsXml = buildDocxRelsXml()
    const documentRelsXml = buildDocxDocumentRelsXml()
    const contentTypesXml = buildDocxContentTypesXml()

    const zipBuffer = createZipArchive([
      { name: '[Content_Types].xml', data: encodeText(contentTypesXml) },
      { name: '_rels/.rels', data: encodeText(relsXml) },
      { name: 'docProps/core.xml', data: encodeText(coreXml) },
      { name: 'docProps/app.xml', data: encodeText(appXml) },
      { name: 'word/document.xml', data: encodeText(documentXml) },
      { name: 'word/styles.xml', data: encodeText(stylesXml) },
      { name: 'word/_rels/document.xml.rels', data: encodeText(documentRelsXml) },
    ])

    return {
      filename: `${sanitizeFileName(snapshot.title || 'untitled-page')}.docx`,
      blob: new Blob([zipBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    }
  }

  function buildDocxDocumentXml(snapshot, items) {
    const paragraphs = [
      buildDocxParagraph(snapshot.title || 'Untitled', { style: 'Title' }),
      buildDocxParagraph(`Exported ${snapshot.exportedAt.toLocaleString()}`, { style: 'ExportMeta' }),
      ...items.flatMap((item) => buildDocxParagraphsForItem(item)),
    ]

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" mc:Ignorable="w14 w15 wp14">
  <w:body>
    ${paragraphs.join('')}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1080" w:bottom="1440" w:left="1080" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`
  }

  function buildDocxParagraphsForItem(item) {
    const text = item.label || item.text || ''
    const indent = (item.depth || 0) * 420

    if (item.type === 'divider') {
      return [buildDocxParagraph(' ', { style: 'Divider', indent })]
    }

    if (item.type === 'code') {
      return String(text || '')
        .split(/\r?\n/)
        .map((line) => buildDocxParagraph(line || ' ', { style: 'Code', indent }))
    }

    if (item.type === 'image') {
      return [buildDocxParagraph(`[Image] ${item.src || 'Embedded image'}`, { style: 'ImageText', indent })]
    }

    if (item.type === 'page_link') {
      return [buildDocxParagraph(`${item.label || 'Untitled page'} (${item.href || ''})`, { style: 'LinkText', indent })]
    }

    if (item.type === 'column_label') {
      return [buildDocxParagraph(item.text || 'Column', { style: 'ColumnLabel', indent })]
    }

    const prefix =
      item.type === 'list'
        ? '- '
        : item.type === 'numbered'
          ? `${item.number || 1}. `
          : item.type === 'checklist'
            ? `[${item.checked ? 'x' : ' '}] `
            : item.type === 'quote'
              ? '> '
              : ''

    const style =
      item.type === 'h1'
        ? 'Heading1'
        : item.type === 'h2'
          ? 'Heading2'
          : item.type === 'h3'
            ? 'Heading3'
            : item.type === 'quote'
              ? 'Quote'
              : 'BodyText'

    return String(prefix + text)
      .split(/\r?\n/)
      .map((line) => buildDocxParagraph(line || ' ', { style, indent }))
  }

  function buildDocxParagraph(text, options) {
    const style = options && options.style ? `<w:pStyle w:val="${escapeXml(options.style)}"/>` : ''
    const indent =
      options && options.indent
        ? `<w:ind w:left="${Math.max(0, Number(options.indent) || 0)}"/>`
        : ''

    return `<w:p><w:pPr>${style}${indent}</w:pPr><w:r><w:t xml:space="preserve">${escapeXml(text || '')}</w:t></w:r></w:p>`
  }

  function buildDocxStylesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="BodyText"><w:name w:val="Body Text"/><w:qFormat/><w:rPr><w:sz w:val="22"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="BodyText"/><w:qFormat/><w:rPr><w:b/><w:sz w:val="34"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="ExportMeta"><w:name w:val="Export Meta"/><w:basedOn w:val="BodyText"/><w:rPr><w:sz w:val="18"/><w:color w:val="6B7280"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/><w:basedOn w:val="BodyText"/><w:qFormat/><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="Heading 2"/><w:basedOn w:val="BodyText"/><w:qFormat/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="Heading 3"/><w:basedOn w:val="BodyText"/><w:qFormat/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="BodyText"/><w:rPr><w:i/><w:color w:val="5F6368"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="BodyText"/><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="20"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="LinkText"><w:name w:val="Link Text"/><w:basedOn w:val="BodyText"/><w:rPr><w:color w:val="2563EB"/><w:u w:val="single"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="ColumnLabel"><w:name w:val="Column Label"/><w:basedOn w:val="BodyText"/><w:rPr><w:b/><w:caps/><w:sz w:val="18"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="ImageText"><w:name w:val="Image Text"/><w:basedOn w:val="BodyText"/><w:rPr><w:i/><w:color w:val="6B7280"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Divider"><w:name w:val="Divider"/><w:basedOn w:val="BodyText"/><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="D4D4D8"/></w:pBdr></w:pPr></w:style>
</w:styles>`
  }

  function buildDocxContentTypesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`
  }

  function buildDocxRelsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`
  }

  function buildDocxDocumentRelsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
  }

  function buildDocxCoreXml(snapshot) {
    const created = snapshot.exportedAt.toISOString()
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(snapshot.title || 'Untitled')}</dc:title>
  <dc:creator>Link Export Plugin</dc:creator>
  <cp:lastModifiedBy>Link Export Plugin</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${escapeXml(created)}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${escapeXml(created)}</dcterms:modified>
</cp:coreProperties>`
  }

  function buildDocxAppXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Link</Application>
</Properties>`
  }

  function buildPdfDocument(snapshot, items) {
    const pages = paginatePdfLines(snapshot, items)
    const objects = []
    const pageObjectNumbers = []
    const fontObjectNumber = 3
    let nextObjectNumber = 4

    objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`
    objects[2] = ''
    objects[fontObjectNumber] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`

    pages.forEach((pageLines) => {
      const contentObjectNumber = nextObjectNumber++
      const pageObjectNumber = nextObjectNumber++
      const stream = pageLines
        .map(
          (line) =>
            `BT /F1 ${line.size} Tf 1 0 0 1 ${line.x.toFixed(2)} ${line.y.toFixed(2)} Tm (${escapePdfText(line.text)}) Tj ET`
        )
        .join('\n')
      objects[contentObjectNumber] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
      objects[pageObjectNumber] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Contents ${contentObjectNumber} 0 R /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> >>`
      pageObjectNumbers.push(pageObjectNumber)
    })

    objects[2] = `<< /Type /Pages /Count ${pageObjectNumbers.length} /Kids [${pageObjectNumbers.map((num) => `${num} 0 R`).join(' ')}] >>`

    const pdf = buildPdfFile(objects)
    return {
      filename: `${sanitizeFileName(snapshot.title || 'untitled-page')}.pdf`,
      blob: new Blob([pdf], { type: 'application/pdf' }),
    }
  }

  function paginatePdfLines(snapshot, items) {
    const specs = [
      { text: snapshot.title || 'Untitled', size: 24, indent: 0, gap: 12 },
      { text: `Exported ${snapshot.exportedAt.toLocaleString()}`, size: 10, indent: 0, gap: 16 },
      ...items.flatMap((item) => getPdfLineSpecs(item)),
    ]
    const pageWidth = 595.28
    const pageHeight = 841.89
    const margin = 56
    const pages = [[]]
    let y = pageHeight - margin

    specs.forEach((spec) => {
      const indent = margin + (spec.indent || 0) * 18
      const maxWidth = pageWidth - indent - margin
      const wrapped = wrapText(spec.text || ' ', maxWidth, spec.size || 12)
      const leading = spec.leading || (spec.size || 12) * 1.4

      wrapped.forEach((line) => {
        if (y < margin + leading) {
          pages.push([])
          y = pageHeight - margin
        }

        pages[pages.length - 1].push({
          text: line,
          size: spec.size || 12,
          x: indent,
          y,
        })

        y -= leading
      })

      y -= spec.gap || 0
    })

    return pages
  }

  function getPdfLineSpecs(item) {
    const text = item.label || item.text || ''
    const indent = item.depth || 0
    if (item.type === 'divider') {
      return [{ text: '----------------------------------------', size: 10, indent, gap: 8 }]
    }

    if (item.type === 'code') {
      return String(text || '')
        .split(/\r?\n/)
        .map((line) => ({ text: line || ' ', size: 10, indent: indent + 0.5, gap: 1, leading: 14 }))
    }

    if (item.type === 'h1') {
      return [{ text: text || 'Untitled', size: 20, indent, gap: 8 }]
    }

    if (item.type === 'h2') {
      return [{ text: text || 'Untitled', size: 17, indent, gap: 6 }]
    }

    if (item.type === 'h3') {
      return [{ text: text || 'Untitled', size: 14, indent, gap: 4 }]
    }

    const prefix =
      item.type === 'list'
        ? '- '
        : item.type === 'numbered'
          ? `${item.number || 1}. `
          : item.type === 'checklist'
            ? `[${item.checked ? 'x' : ' '}] `
            : item.type === 'quote'
              ? '> '
              : item.type === 'image'
                ? '[Image] '
                : item.type === 'page_link'
                  ? ''
                  : item.type === 'column_label'
                    ? ''
                    : ''

    const bodyText =
      item.type === 'page_link'
        ? `${item.label || 'Untitled page'} (${item.href || ''})`
        : item.type === 'column_label'
          ? `[${item.text || 'Column'}]`
          : prefix + text

    return [{ text: bodyText || ' ', size: 12, indent, gap: 4 }]
  }

  async function buildZipExport(snapshot, items) {
    const baseName = sanitizeFileName(snapshot.title || 'untitled-page')
    const assetDir = `${baseName}-assets`
    const imageMap = {}
    const assetEntries = []
    const manifestAssets = []

    for (let index = 0; index < snapshot.images.length; index += 1) {
      const imageBlock = snapshot.images[index]
      const imagePayload = await buildImagePayload(imageBlock.content, index + 1, assetDir)

      if (!imagePayload) {
        manifestAssets.push({
          source: imageBlock.content,
          status: 'skipped',
        })
        continue
      }

      imageMap[imageBlock.content] = imagePayload.path
      assetEntries.push({
        name: imagePayload.path,
        data: imagePayload.bytes,
      })
      manifestAssets.push({
        source: imageBlock.content,
        status: 'embedded',
        path: imagePayload.path,
        mime: imagePayload.mime,
      })
    }

    const textDocument = renderTextDocument(snapshot, items)
    const markdownDocument = renderMarkdownDocument(snapshot, items, { imageMap })
    const htmlDocument = renderHtmlDocument(snapshot, items, { imageMap })
    const manifestDocument = JSON.stringify(
      {
        pageId: snapshot.pageId,
        title: snapshot.title,
        exportedAt: snapshot.exportedAt.toISOString(),
        blockCount: snapshot.blockCount,
        imageCount: snapshot.images.length,
        assets: manifestAssets,
      },
      null,
      2
    )

    const archive = createZipArchive([
      { name: `${baseName}.txt`, data: encodeText(textDocument) },
      { name: `${baseName}.md`, data: encodeText(markdownDocument) },
      { name: `${baseName}.html`, data: encodeText(htmlDocument) },
      { name: 'manifest.json', data: encodeText(manifestDocument) },
      ...assetEntries,
    ])

    return {
      filename: `${baseName}.zip`,
      blob: new Blob([archive], { type: 'application/zip' }),
    }
  }

  async function buildImagePayload(source, index, assetDir) {
    if (typeof source !== 'string' || !source.trim()) {
      return null
    }

    try {
      const payload = await readImageSource(source.trim())
      if (!payload) {
        return null
      }

      const extension = payload.extension || 'bin'
      const filename = `image-${String(index).padStart(2, '0')}.${extension}`
      return {
        path: `${assetDir}/${filename}`,
        bytes: payload.bytes,
        mime: payload.mime,
      }
    } catch (_error) {
      return null
    }
  }

  async function readImageSource(source) {
    if (source.startsWith('data:image')) {
      return parseDataUrl(source)
    }

    if (/^https?:\/\//i.test(source) && typeof fetch === 'function') {
      const response = await fetch(source)
      if (!response.ok) {
        throw new Error(`Image download failed with ${response.status}`)
      }

      const buffer = await response.arrayBuffer()
      const contentType = response.headers.get('content-type') || ''
      return {
        bytes: new Uint8Array(buffer),
        mime: contentType || 'application/octet-stream',
        extension: guessImageExtension(contentType, source),
      }
    }

    return null
  }

  function parseDataUrl(source) {
    const match = source.match(/^data:([^;,]+)?(;base64)?,(.*)$/)
    if (!match) {
      return null
    }

    const mime = match[1] || 'application/octet-stream'
    const isBase64 = Boolean(match[2])
    const payload = match[3] || ''
    let bytes

    if (isBase64) {
      const binary = atob(payload)
      bytes = new Uint8Array(binary.length)
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index)
      }
    } else {
      bytes = encodeText(decodeURIComponent(payload))
    }

    return {
      bytes,
      mime,
      extension: guessImageExtension(mime, ''),
    }
  }

  function guessImageExtension(contentType, source) {
    const normalizedType = String(contentType || '').toLowerCase()
    if (normalizedType.includes('png')) return 'png'
    if (normalizedType.includes('jpeg') || normalizedType.includes('jpg')) return 'jpg'
    if (normalizedType.includes('webp')) return 'webp'
    if (normalizedType.includes('gif')) return 'gif'
    if (normalizedType.includes('svg')) return 'svg'
    if (normalizedType.includes('bmp')) return 'bmp'

    const pathMatch = String(source || '').match(/\.([a-z0-9]+)(?:[?#].*)?$/i)
    if (pathMatch) {
      return pathMatch[1].toLowerCase()
    }

    return 'bin'
  }

  function setStatus(message) {
    if (modalStatusElement) {
      modalStatusElement.textContent = message || ''
    }
  }

  function getErrorMessage(error) {
    if (error instanceof Error && error.message) {
      return error.message
    }

    return typeof error === 'string' ? error : 'Export failed.'
  }

  function downloadBlob(filename, blob) {
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = filename
    anchor.rel = 'noopener'
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    window.setTimeout(() => {
      anchor.remove()
      URL.revokeObjectURL(objectUrl)
    }, 2000)
  }

  function prefixMultiline(text, prefix) {
    const lines = String(text || '').split(/\r?\n/)
    const continuation = prefix ? ' '.repeat(prefix.length) : ''
    return lines.map((line, index) => `${index === 0 ? prefix : continuation}${line}`)
  }

  function escapeMarkdown(value) {
    return String(value || '').replace(/([\\`*_{}\[\]()#+.!|>~-])/g, '\\$1')
  }

  function formatHtmlText(value) {
    return escapeHtml(value).replace(/\r?\n/g, '<br />')
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function escapeXml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }

  function escapePdfText(value) {
    return String(value || '')
      .replace(/[^\x20-\x7e]/g, '?')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/\r?\n/g, ' ')
  }

  function sanitizeFileName(value) {
    const normalized = String(value || 'untitled-page')
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
      .replace(/\s+/g, ' ')
      .slice(0, 100)

    return normalized || 'untitled-page'
  }

  function wrapText(text, maxWidth, fontSize) {
    const averageWidth = Math.max(4, (fontSize || 12) * 0.54)
    const maxChars = Math.max(12, Math.floor(maxWidth / averageWidth))
    const paragraphs = String(text || '').split(/\r?\n/)
    const lines = []

    paragraphs.forEach((paragraph) => {
      if (!paragraph) {
        lines.push(' ')
        return
      }

      const words = paragraph.split(/\s+/)
      let line = ''

      words.forEach((word) => {
        if (!line) {
          line = word
          return
        }

        if ((line + ' ' + word).length > maxChars) {
          lines.push(line)
          line = word
        } else {
          line += ' ' + word
        }
      })

      if (line) {
        lines.push(line)
      }
    })

    return lines.length > 0 ? lines : [' ']
  }

  function buildPdfFile(objects) {
    let output = '%PDF-1.4\n%1234\n'
    const offsets = new Array(objects.length).fill(0)

    for (let index = 1; index < objects.length; index += 1) {
      if (!objects[index]) {
        continue
      }

      offsets[index] = output.length
      output += `${index} 0 obj\n${objects[index]}\nendobj\n`
    }

    const xrefOffset = output.length
    output += `xref\n0 ${objects.length}\n`
    output += '0000000000 65535 f \n'

    for (let index = 1; index < objects.length; index += 1) {
      output += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`
    }

    output += `trailer << /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
    return encodeText(output)
  }

  function createZipArchive(entries) {
    const files = Array.isArray(entries) ? entries : []
    const localParts = []
    const centralParts = []
    let offset = 0
    const now = new Date()
    const dosTime = getDosTime(now)
    const dosDate = getDosDate(now)

    files.forEach((entry) => {
      const nameBytes = encodeText(entry.name)
      const dataBytes = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data)
      const checksum = crc32(dataBytes)

      const localHeader = concatUint8Arrays([
        u32(0x04034b50),
        u16(20),
        u16(0),
        u16(0),
        u16(dosTime),
        u16(dosDate),
        u32(checksum),
        u32(dataBytes.length),
        u32(dataBytes.length),
        u16(nameBytes.length),
        u16(0),
        nameBytes,
        dataBytes,
      ])

      localParts.push(localHeader)

      const centralHeader = concatUint8Arrays([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0),
        u16(0),
        u16(dosTime),
        u16(dosDate),
        u32(checksum),
        u32(dataBytes.length),
        u32(dataBytes.length),
        u16(nameBytes.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        nameBytes,
      ])

      centralParts.push(centralHeader)
      offset += localHeader.length
    })

    const centralDirectory = concatUint8Arrays(centralParts)
    const localDirectory = concatUint8Arrays(localParts)
    const endOfDirectory = concatUint8Arrays([
      u32(0x06054b50),
      u16(0),
      u16(0),
      u16(files.length),
      u16(files.length),
      u32(centralDirectory.length),
      u32(localDirectory.length),
      u16(0),
    ])

    return concatUint8Arrays([localDirectory, centralDirectory, endOfDirectory])
  }

  function encodeText(value) {
    return new TextEncoder().encode(String(value || ''))
  }

  function concatUint8Arrays(chunks) {
    const parts = Array.isArray(chunks) ? chunks : []
    const totalLength = parts.reduce((sum, part) => sum + (part ? part.length : 0), 0)
    const result = new Uint8Array(totalLength)
    let offset = 0

    parts.forEach((part) => {
      if (!part) {
        return
      }

      result.set(part, offset)
      offset += part.length
    })

    return result
  }

  function u16(value) {
    const bytes = new Uint8Array(2)
    const view = new DataView(bytes.buffer)
    view.setUint16(0, value, true)
    return bytes
  }

  function u32(value) {
    const bytes = new Uint8Array(4)
    const view = new DataView(bytes.buffer)
    view.setUint32(0, value >>> 0, true)
    return bytes
  }

  function getDosTime(date) {
    const hours = Math.max(0, Math.min(23, date.getHours()))
    const minutes = Math.max(0, Math.min(59, date.getMinutes()))
    const seconds = Math.max(0, Math.min(59, date.getSeconds()))
    return (hours << 11) | (minutes << 5) | Math.floor(seconds / 2)
  }

  function getDosDate(date) {
    const year = Math.max(1980, date.getFullYear())
    const month = Math.max(1, Math.min(12, date.getMonth() + 1))
    const day = Math.max(1, Math.min(31, date.getDate()))
    return ((year - 1980) << 9) | (month << 5) | day
  }

  const CRC32_TABLE = (() => {
    const table = new Uint32Array(256)
    for (let index = 0; index < 256; index += 1) {
      let value = index
      for (let bit = 0; bit < 8; bit += 1) {
        value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
      }
      table[index] = value >>> 0
    }
    return table
  })()

  function crc32(bytes) {
    let crc = 0xffffffff
    for (let index = 0; index < bytes.length; index += 1) {
      crc = CRC32_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8)
    }
    return (crc ^ 0xffffffff) >>> 0
  }

  function renderHtmlItem(item, imageMap) {
    const margin = (item.depth || 0) * 24
    const text = item.label || item.text || ''
    const style = margin ? ` style="margin-left:${margin}px"` : ''

    if (item.type === 'divider') {
      return `<hr${style} />`
    }

    if (item.type === 'h1' || item.type === 'h2' || item.type === 'h3') {
      const tag = item.type
      return `<${tag}${style}>${formatHtmlText(text)}</${tag}>`
    }

    if (item.type === 'list') {
      return `<div class="row"${style}><span class="marker">&#8226;</span><span>${formatHtmlText(text)}</span></div>`
    }

    if (item.type === 'numbered') {
      return `<div class="row"${style}><span class="marker">${item.number || 1}.</span><span>${formatHtmlText(text)}</span></div>`
    }

    if (item.type === 'checklist') {
      return `<div class="row"${style}><span class="marker">${item.checked ? '&#10003;' : '&#9633;'}</span><span>${formatHtmlText(text)}</span></div>`
    }

    if (item.type === 'quote') {
      return `<blockquote class="quote"${style}>${formatHtmlText(text)}</blockquote>`
    }

    if (item.type === 'code') {
      return `<pre${style}><code>${escapeHtml(text)}</code></pre>`
    }

    if (item.type === 'page_link') {
      const href = item.href || '#'
      return `<p${style}><a class="link" href="${escapeHtml(href)}">${formatHtmlText(item.label || 'Untitled page')}</a></p>`
    }

    if (item.type === 'image') {
      const src = imageMap[item.src] || item.src
      return `<figure${style}><img src="${escapeHtml(src || '')}" alt="Exported image" /></figure>`
    }

    if (item.type === 'column_label') {
      return `<div class="column-label"${style}>${escapeHtml(item.text || 'Column')}</div>`
    }

    return `<p${style}>${formatHtmlText(text)}</p>`
  }

  function getPdfLineSpecs(item) {
    const text = item.label || item.text || ''
    const indent = item.depth || 0
    if (item.type === 'divider') {
      return [{ text: '----------------------------------------', size: 10, indent, gap: 8 }]
    }

    if (item.type === 'code') {
      return String(text || '')
        .split(/\r?\n/)
        .map((line) => ({ text: line || ' ', size: 10, indent: indent + 0.5, gap: 1, leading: 14 }))
    }

    if (item.type === 'h1') {
      return [{ text: text || 'Untitled', size: 20, indent, gap: 8 }]
    }

    if (item.type === 'h2') {
      return [{ text: text || 'Untitled', size: 17, indent, gap: 6 }]
    }

    if (item.type === 'h3') {
      return [{ text: text || 'Untitled', size: 14, indent, gap: 4 }]
    }

    const prefix =
      item.type === 'list'
        ? '- '
        : item.type === 'numbered'
          ? `${item.number || 1}. `
          : item.type === 'checklist'
            ? `[${item.checked ? 'x' : ' '}] `
            : item.type === 'quote'
              ? '> '
              : item.type === 'image'
                ? '[Image] '
                : item.type === 'page_link'
                  ? ''
                  : item.type === 'column_label'
                    ? ''
                    : ''

    const bodyText =
      item.type === 'page_link'
        ? `${item.label || 'Untitled page'} (${item.href || ''})`
        : item.type === 'column_label'
          ? `[${item.text || 'Column'}]`
          : prefix + text

    return [{ text: bodyText || ' ', size: 12, indent, gap: 4 }]
  }

  function buildDocxParagraphsForItem(item) {
    const text = item.label || item.text || ''
    const indent = (item.depth || 0) * 420

    if (item.type === 'divider') {
      return [buildDocxParagraph(' ', { style: 'Divider', indent })]
    }

    if (item.type === 'code') {
      return String(text || '')
        .split(/\r?\n/)
        .map((line) => buildDocxParagraph(line || ' ', { style: 'Code', indent }))
    }

    if (item.type === 'image') {
      return [buildDocxParagraph(`[Image] ${item.src || 'Embedded image'}`, { style: 'ImageText', indent })]
    }

    if (item.type === 'page_link') {
      return [buildDocxParagraph(`${item.label || 'Untitled page'} (${item.href || ''})`, { style: 'LinkText', indent })]
    }

    if (item.type === 'column_label') {
      return [buildDocxParagraph(item.text || 'Column', { style: 'ColumnLabel', indent })]
    }

    const prefix =
      item.type === 'list'
        ? '- '
        : item.type === 'numbered'
          ? `${item.number || 1}. `
          : item.type === 'checklist'
            ? `[${item.checked ? 'x' : ' '}] `
            : item.type === 'quote'
              ? '> '
              : ''

    const style =
      item.type === 'h1'
        ? 'Heading1'
        : item.type === 'h2'
          ? 'Heading2'
          : item.type === 'h3'
            ? 'Heading3'
            : item.type === 'quote'
              ? 'Quote'
              : 'BodyText'

    return String(prefix + text)
      .split(/\r?\n/)
      .map((line) => buildDocxParagraph(line || ' ', { style, indent }))
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener(
        'DOMContentLoaded',
        () => {
          plugin.install()
        },
        { once: true }
      )
    } else {
      plugin.install()
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = plugin
  } else {
    globalThis.LinkExportOpenPagePlugin = plugin
  }
})()
