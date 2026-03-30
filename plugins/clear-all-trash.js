;(function () {
  const plugin = {
    id: 'clear-all-trash',
    name: 'Clear All Trash',
    version: '1.0.0',
    description:
      'Adds a Settings action to permanently clear trashed pages and tasks with a minimal confirmation modal.',
    install: installPlugin,
    dispose: disposePlugin,
  }

  let styleElement = null
  let sectionElement = null
  let modalOverlayElement = null
  let modalTitleElement = null
  let modalMessageElement = null
  let modalCountElement = null
  let modalStatusElement = null
  let clearButtonElement = null
  let summaryElement = null
  let pageCountElement = null
  let taskCountElement = null
  let badgeElement = null
  let inlineStatusElement = null
  let confirmButtonElement = null
  let cancelButtonElement = null
  let observer = null
  let cleanupFns = []
  let isClearing = false
  let activeSnapshot = null
  let refreshToken = 0
  let ensureScheduled = false

  function installPlugin() {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return plugin
    }

    if (window.__linkClearAllTrashPluginInstalled) {
      return plugin
    }

    window.__linkClearAllTrashPluginInstalled = true

    ensureStyles()
    ensureModal()
    ensureSettingsSection()

    const onKeyDown = (event) => {
      if (!modalOverlayElement || modalOverlayElement.dataset.open !== 'true') {
        return
      }

      if (event.key === 'Escape' && !isClearing) {
        event.preventDefault()
        closeModal()
      }
    }

    observer = new MutationObserver(() => {
      scheduleEnsureSettingsSection()
    })
    observer.observe(document.body, { childList: true, subtree: true })

    window.addEventListener('keydown', onKeyDown, true)

    cleanupFns = [
      () => observer && observer.disconnect(),
      () => window.removeEventListener('keydown', onKeyDown, true),
    ]

    return plugin
  }

  function disposePlugin() {
    cleanupFns.forEach((cleanup) => cleanup())
    cleanupFns = []

    observer && observer.disconnect()
    observer = null

    closeModal(true)

    if (sectionElement) {
      sectionElement.remove()
      sectionElement = null
    }

    if (modalOverlayElement) {
      modalOverlayElement.remove()
      modalOverlayElement = null
    }

    if (styleElement) {
      styleElement.remove()
      styleElement = null
    }

    modalTitleElement = null
    modalMessageElement = null
    modalCountElement = null
    modalStatusElement = null
    clearButtonElement = null
    summaryElement = null
    pageCountElement = null
    taskCountElement = null
    badgeElement = null
    inlineStatusElement = null
    confirmButtonElement = null
    cancelButtonElement = null
    activeSnapshot = null
    isClearing = false

    if (typeof window !== 'undefined') {
      window.__linkClearAllTrashPluginInstalled = false
    }
  }

  function ensureStyles() {
    if (styleElement) {
      return
    }

    styleElement = document.createElement('style')
    styleElement.id = 'link-clear-all-trash-plugin-styles'
    styleElement.textContent = `
      .link-clear-trash-section {
        position: relative;
      }

      .link-clear-trash-section__icon {
        width: 1rem;
        height: 1rem;
      }

      .link-clear-trash-section__badge,
      .link-clear-trash-section__pill {
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        border: 1px solid color-mix(in srgb, var(--border, #E5E7EB) 75%, transparent);
        border-radius: 999px;
        background: color-mix(in srgb, var(--card, #FFFFFF) 88%, transparent);
        color: var(--muted-foreground, #6B7280);
        padding: 0.45rem 0.85rem;
        font-size: 11px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }

      .link-clear-trash-section__pill strong {
        color: var(--foreground, #111827);
        font-size: 12px;
        letter-spacing: normal;
        text-transform: none;
      }

      .link-clear-trash-section__button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.65rem;
        min-height: 42px;
        border-radius: 999px;
        border: 1px solid color-mix(in srgb, var(--destructive, #DC2626) 18%, var(--border, #E5E7EB));
        background: color-mix(in srgb, var(--destructive, #DC2626) 7%, var(--background, #FFFFFF));
        color: color-mix(in srgb, var(--destructive, #DC2626) 80%, var(--foreground, #111827));
        padding: 0 1rem;
        font-size: 13px;
        font-weight: 600;
        transition: transform 160ms ease, border-color 160ms ease, background 160ms ease, opacity 160ms ease;
      }

      .link-clear-trash-section__button:hover:not([disabled]) {
        transform: translateY(-1px);
        border-color: color-mix(in srgb, var(--destructive, #DC2626) 28%, var(--border, #E5E7EB));
        background: color-mix(in srgb, var(--destructive, #DC2626) 10%, var(--background, #FFFFFF));
      }

      .link-clear-trash-section__button[disabled] {
        cursor: default;
        opacity: 0.58;
      }

      .link-clear-trash-section__inline-status {
        min-height: 20px;
        font-size: 12px;
        line-height: 1.5;
        color: var(--muted-foreground, #6B7280);
      }

      .link-clear-trash-section__inline-status[data-kind="error"] {
        color: var(--destructive, #DC2626);
      }

      .link-clear-trash-modal {
        position: fixed;
        inset: 0;
        z-index: 100000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: rgba(15, 23, 42, 0.36);
        backdrop-filter: blur(10px);
        opacity: 0;
        pointer-events: none;
        transition: opacity 180ms ease;
      }

      .link-clear-trash-modal[data-open="true"] {
        opacity: 1;
        pointer-events: auto;
      }

      .link-clear-trash-modal__card {
        width: min(460px, 100%);
        border-radius: 22px;
        border: 1px solid color-mix(in srgb, var(--border, #E5E7EB) 80%, transparent);
        background: color-mix(in srgb, var(--card, #FFFFFF) 94%, transparent);
        color: var(--foreground, #111827);
        box-shadow: 0 30px 70px rgba(15, 23, 42, 0.2);
        transform: translateY(12px) scale(0.98);
        transition: transform 180ms ease;
        overflow: hidden;
      }

      .link-clear-trash-modal[data-open="true"] .link-clear-trash-modal__card {
        transform: translateY(0) scale(1);
      }

      .link-clear-trash-modal__header {
        padding: 20px 22px 14px;
        border-bottom: 1px solid color-mix(in srgb, var(--border, #E5E7EB) 70%, transparent);
      }

      .link-clear-trash-modal__eyebrow {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--muted-foreground, #6B7280);
      }

      .link-clear-trash-modal__title {
        margin-top: 8px;
        font-size: 18px;
        font-weight: 600;
        line-height: 1.3;
      }

      .link-clear-trash-modal__body {
        padding: 18px 22px 22px;
      }

      .link-clear-trash-modal__message {
        font-size: 14px;
        line-height: 1.7;
        color: var(--muted-foreground, #6B7280);
      }

      .link-clear-trash-modal__counts {
        margin-top: 16px;
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .link-clear-trash-modal__status {
        min-height: 22px;
        margin-top: 16px;
        font-size: 13px;
        line-height: 1.6;
        color: var(--muted-foreground, #6B7280);
      }

      .link-clear-trash-modal__status[data-kind="error"] {
        color: var(--destructive, #DC2626);
      }

      .link-clear-trash-modal__status[data-kind="success"] {
        color: color-mix(in srgb, var(--foreground, #111827) 80%, var(--destructive, #DC2626) 20%);
      }

      .link-clear-trash-modal__footer {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 20px;
      }

      .link-clear-trash-modal__secondary,
      .link-clear-trash-modal__primary {
        min-height: 40px;
        border-radius: 999px;
        padding: 0 16px;
        font-size: 13px;
        font-weight: 600;
        transition: transform 160ms ease, opacity 160ms ease, border-color 160ms ease, background 160ms ease;
      }

      .link-clear-trash-modal__secondary {
        border: 1px solid color-mix(in srgb, var(--border, #E5E7EB) 85%, transparent);
        background: color-mix(in srgb, var(--background, #FFFFFF) 85%, transparent);
        color: var(--foreground, #111827);
      }

      .link-clear-trash-modal__primary {
        border: 1px solid color-mix(in srgb, var(--destructive, #DC2626) 18%, var(--border, #E5E7EB));
        background: color-mix(in srgb, var(--destructive, #DC2626) 7%, var(--background, #FFFFFF));
        color: color-mix(in srgb, var(--destructive, #DC2626) 80%, var(--foreground, #111827));
      }

      .link-clear-trash-modal__secondary:hover:not([disabled]),
      .link-clear-trash-modal__primary:hover:not([disabled]) {
        transform: translateY(-1px);
      }

      .link-clear-trash-modal__secondary[disabled],
      .link-clear-trash-modal__primary[disabled] {
        cursor: default;
        opacity: 0.58;
      }
    `

    document.head.appendChild(styleElement)
  }

  function ensureModal() {
    if (modalOverlayElement) {
      return
    }

    modalOverlayElement = document.createElement('div')
    modalOverlayElement.className = 'link-clear-trash-modal'
    modalOverlayElement.dataset.open = 'false'
    modalOverlayElement.innerHTML = `
      <div class="link-clear-trash-modal__card" role="dialog" aria-modal="true" aria-labelledby="link-clear-trash-modal-title">
        <div class="link-clear-trash-modal__header">
          <div class="link-clear-trash-modal__eyebrow">Trash</div>
          <div class="link-clear-trash-modal__title" id="link-clear-trash-modal-title">Clear all trash?</div>
        </div>
        <div class="link-clear-trash-modal__body">
          <div class="link-clear-trash-modal__message"></div>
          <div class="link-clear-trash-modal__counts"></div>
          <div class="link-clear-trash-modal__status" data-kind="idle"></div>
          <div class="link-clear-trash-modal__footer">
            <button type="button" class="link-clear-trash-modal__secondary">Cancel</button>
            <button type="button" class="link-clear-trash-modal__primary">Delete permanently</button>
          </div>
        </div>
      </div>
    `

    modalTitleElement = modalOverlayElement.querySelector('.link-clear-trash-modal__title')
    modalMessageElement = modalOverlayElement.querySelector('.link-clear-trash-modal__message')
    modalCountElement = modalOverlayElement.querySelector('.link-clear-trash-modal__counts')
    modalStatusElement = modalOverlayElement.querySelector('.link-clear-trash-modal__status')
    cancelButtonElement = modalOverlayElement.querySelector('.link-clear-trash-modal__secondary')
    confirmButtonElement = modalOverlayElement.querySelector('.link-clear-trash-modal__primary')

    modalOverlayElement.addEventListener('mousedown', (event) => {
      if (event.target === modalOverlayElement && !isClearing) {
        closeModal()
      }
    })

    cancelButtonElement.addEventListener('click', () => {
      if (!isClearing) {
        closeModal()
      }
    })

    confirmButtonElement.addEventListener('click', () => {
      if (!isClearing && activeSnapshot) {
        void clearTrash(activeSnapshot)
      }
    })

    document.body.appendChild(modalOverlayElement)
  }

  function scheduleEnsureSettingsSection() {
    if (ensureScheduled) {
      return
    }

    ensureScheduled = true
    window.requestAnimationFrame(() => {
      ensureScheduled = false
      ensureSettingsSection()
    })
  }

  function ensureSettingsSection() {
    const settingsContainer = findSettingsContainer()

    if (!settingsContainer) {
      return
    }

    if (!sectionElement) {
      sectionElement = createSettingsSection()
    }

    if (sectionElement.parentElement !== settingsContainer) {
      settingsContainer.appendChild(sectionElement)
    }

    void refreshSection()
  }

  function findSettingsContainer() {
    const title = Array.from(document.querySelectorAll('h1')).find(
      (element) => normalizeText(element.textContent) === 'workspace preferences'
    )

    if (!title) {
      return null
    }

    const introBlock = title.closest('div.max-w-3xl') || title.parentElement
    return introBlock && introBlock.parentElement ? introBlock.parentElement : null
  }

  function normalizeText(value) {
    return String(value || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase()
  }

  function createSettingsSection() {
    const section = document.createElement('section')
    section.className = 'link-clear-trash-section rounded-xl border border-border/70 bg-card/70 p-6'
    section.innerHTML = `
      <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div class="flex items-center gap-3">
          <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground">
            ${getTrashIconSvg('link-clear-trash-section__icon')}
          </div>
          <div>
            <h2 class="text-base font-medium text-foreground">Clear all trash</h2>
            <p class="text-sm text-muted-foreground">Permanently delete archived pages and deleted tasks in one step.</p>
          </div>
        </div>
        <div class="link-clear-trash-section__badge">
          <span>Trash</span>
          <strong class="text-foreground" data-role="badge-count">0 items</strong>
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div class="rounded-xl border border-border/60 bg-background/60 p-5">
          <p class="text-sm leading-6 text-muted-foreground" data-role="summary">
            Nothing is waiting in trash right now.
          </p>

          <div class="mt-4 flex flex-wrap gap-2">
            <div class="link-clear-trash-section__pill">
              <span>Pages</span>
              <strong data-role="page-count">0</strong>
            </div>
            <div class="link-clear-trash-section__pill">
              <span>Tasks</span>
              <strong data-role="task-count">0</strong>
            </div>
          </div>
        </div>

        <div class="rounded-xl border border-border/60 bg-background/60 p-5">
          <button type="button" class="link-clear-trash-section__button" data-role="clear-button">
            ${getTrashIconSvg('link-clear-trash-section__icon')}
            <span>Clear all trash</span>
          </button>
          <p class="link-clear-trash-section__inline-status mt-3" data-role="inline-status" data-kind="idle">
            This permanently removes only items that are already in trash.
          </p>
        </div>
      </div>
    `

    clearButtonElement = section.querySelector('[data-role="clear-button"]')
    summaryElement = section.querySelector('[data-role="summary"]')
    pageCountElement = section.querySelector('[data-role="page-count"]')
    taskCountElement = section.querySelector('[data-role="task-count"]')
    badgeElement = section.querySelector('[data-role="badge-count"]')
    inlineStatusElement = section.querySelector('[data-role="inline-status"]')

    clearButtonElement.addEventListener('click', () => {
      void handleClearButtonClick()
    })

    return section
  }

  async function handleClearButtonClick() {
    if (isClearing) {
      return
    }

    try {
      const snapshot = await getTrashSnapshot()
      updateSection(snapshot)

      if (snapshot.totalItemCount === 0) {
        setInlineStatus('Trash is already empty.', 'idle')
        return
      }

      openModal(snapshot)
    } catch (error) {
      setInlineStatus(
        error instanceof Error ? error.message : 'Could not load trashed items.',
        'error'
      )
    }
  }

  async function refreshSection() {
    const token = ++refreshToken

    try {
      const snapshot = await getTrashSnapshot()
      if (token !== refreshToken) {
        return
      }

      updateSection(snapshot)
    } catch (error) {
      if (token !== refreshToken) {
        return
      }

      setInlineStatus(
        error instanceof Error ? error.message : 'Could not load trashed items.',
        'error'
      )
    }
  }

  async function getTrashSnapshot() {
    if (!window.db || typeof window.db.getTasks !== 'function' || typeof window.db.getPages !== 'function') {
      throw new Error('The trash database API is not available in this build.')
    }

    const [tasks, pages] = await Promise.all([window.db.getTasks(), window.db.getPages()])

    const deletedTasks = Array.isArray(tasks) ? tasks.filter((task) => !!task && !!task.isDeleted) : []
    const archivedPages = Array.isArray(pages) ? pages.filter((page) => !!page && !!page.isArchived) : []
    const archivedPageIds = new Set(archivedPages.map((page) => String(page.id)))
    const archivedRootPages = archivedPages.filter(
      (page) => !page.parentId || !archivedPageIds.has(String(page.parentId))
    )

    return {
      deletedTasks,
      archivedPages,
      archivedRootPages,
      deletedTaskCount: deletedTasks.length,
      archivedPageCount: archivedPages.length,
      totalItemCount: deletedTasks.length + archivedPages.length,
    }
  }

  function updateSection(snapshot) {
    if (!sectionElement) {
      return
    }

    const { archivedPageCount, deletedTaskCount, totalItemCount } = snapshot
    const pageLabel = archivedPageCount === 1 ? 'page' : 'pages'
    const taskLabel = deletedTaskCount === 1 ? 'task' : 'tasks'
    const totalLabel = totalItemCount === 1 ? 'item' : 'items'

    if (badgeElement) {
      badgeElement.textContent = `${totalItemCount} ${totalLabel}`
    }

    if (pageCountElement) {
      pageCountElement.textContent = String(archivedPageCount)
    }

    if (taskCountElement) {
      taskCountElement.textContent = String(deletedTaskCount)
    }

    if (summaryElement) {
      if (totalItemCount === 0) {
        summaryElement.textContent = 'Nothing is waiting in trash right now.'
      } else {
        summaryElement.textContent =
          `${archivedPageCount} archived ${pageLabel} and ${deletedTaskCount} deleted ${taskLabel} ` +
          'can be removed permanently. This cannot be undone.'
      }
    }

    if (clearButtonElement) {
      clearButtonElement.disabled = isClearing || totalItemCount === 0
      clearButtonElement.querySelector('span').textContent =
        totalItemCount === 0 ? 'Trash is empty' : isClearing ? 'Clearing trash...' : 'Clear all trash'
    }

    if (!isClearing) {
      setInlineStatus(
        totalItemCount === 0
          ? 'This permanently removes only items that are already in trash.'
          : 'Use this when you want to empty every trash bucket at once.',
        'idle'
      )
    }
  }

  function openModal(snapshot) {
    if (!modalOverlayElement) {
      return
    }

    activeSnapshot = snapshot
    setModalStatus('', 'idle')

    const pageLabel = snapshot.archivedPageCount === 1 ? 'page' : 'pages'
    const taskLabel = snapshot.deletedTaskCount === 1 ? 'task' : 'tasks'

    if (modalTitleElement) {
      modalTitleElement.textContent = 'Clear all trash?'
    }

    if (modalMessageElement) {
      modalMessageElement.textContent =
        'This permanently deletes everything already moved to trash, including archived pages and deleted tasks. This action cannot be undone.'
    }

    if (modalCountElement) {
      modalCountElement.innerHTML = `
        <div class="link-clear-trash-section__pill"><span>Pages</span><strong>${snapshot.archivedPageCount} ${pageLabel}</strong></div>
        <div class="link-clear-trash-section__pill"><span>Tasks</span><strong>${snapshot.deletedTaskCount} ${taskLabel}</strong></div>
      `
    }

    if (confirmButtonElement) {
      confirmButtonElement.disabled = false
      confirmButtonElement.textContent = 'Delete permanently'
    }

    if (cancelButtonElement) {
      cancelButtonElement.disabled = false
    }

    modalOverlayElement.dataset.open = 'true'
  }

  function closeModal(force) {
    if (!modalOverlayElement) {
      return
    }

    if (isClearing && !force) {
      return
    }

    modalOverlayElement.dataset.open = 'false'
    activeSnapshot = null
    setModalStatus('', 'idle')
  }

  async function clearTrash(snapshot) {
    if (!snapshot || isClearing) {
      return
    }

    isClearing = true
    updateSection(snapshot)
    setInlineStatus('Clearing trash...', 'idle')
    setModalStatus('Deleting trashed items and syncing the workspace...', 'idle')

    if (confirmButtonElement) {
      confirmButtonElement.disabled = true
      confirmButtonElement.textContent = 'Deleting...'
    }

    if (cancelButtonElement) {
      cancelButtonElement.disabled = true
    }

    try {
      for (const page of snapshot.archivedRootPages) {
        const ok = await window.db.deletePagePermanently(page.id)
        if (!ok) {
          throw new Error(`Could not permanently delete the page "${page.title || 'Untitled'}".`)
        }
      }

      for (const task of snapshot.deletedTasks) {
        const ok = await window.db.deleteTaskPermanently(task.id)
        if (!ok) {
          throw new Error(`Could not permanently delete the task "${task.title || 'Untitled'}".`)
        }
      }

      const clearedPageLabel = snapshot.archivedPageCount === 1 ? 'page' : 'pages'
      const clearedTaskLabel = snapshot.deletedTaskCount === 1 ? 'task' : 'tasks'
      const successMessage =
        `Removed ${snapshot.archivedPageCount} ${clearedPageLabel} and ${snapshot.deletedTaskCount} ${clearedTaskLabel}. Refreshing the workspace...`

      setInlineStatus(successMessage, 'idle')
      setModalStatus(successMessage, 'success')

      if (modalTitleElement) {
        modalTitleElement.textContent = 'Trash cleared'
      }

      if (modalMessageElement) {
        modalMessageElement.textContent = 'The renderer will reload once so every sidebar count and trash list stays in sync.'
      }

      const nextSnapshot = {
        deletedTasks: [],
        archivedPages: [],
        archivedRootPages: [],
        deletedTaskCount: 0,
        archivedPageCount: 0,
        totalItemCount: 0,
      }
      updateSection(nextSnapshot)

      window.setTimeout(() => {
        window.location.reload()
      }, 700)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not clear trash.'
      setInlineStatus(message, 'error')
      setModalStatus(message, 'error')
      isClearing = false

      if (confirmButtonElement) {
        confirmButtonElement.disabled = false
        confirmButtonElement.textContent = 'Delete permanently'
      }

      if (cancelButtonElement) {
        cancelButtonElement.disabled = false
      }

      await refreshSection()
      return
    }
  }

  function setInlineStatus(message, kind) {
    if (!inlineStatusElement) {
      return
    }

    inlineStatusElement.textContent = message || ''
    inlineStatusElement.dataset.kind = kind || 'idle'
  }

  function setModalStatus(message, kind) {
    if (!modalStatusElement) {
      return
    }

    modalStatusElement.textContent = message || ''
    modalStatusElement.dataset.kind = kind || 'idle'
  }

  function getTrashIconSvg(className) {
    return `
      <svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 6h18"></path>
        <path d="M8 6V4.75C8 3.78 8.78 3 9.75 3h4.5C15.22 3 16 3.78 16 4.75V6"></path>
        <path d="M18 6l-1 12.25A2 2 0 0 1 15.01 20H8.99A2 2 0 0 1 7 18.25L6 6"></path>
        <path d="M10 10.25v5.5"></path>
        <path d="M14 10.25v5.5"></path>
      </svg>
    `
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = plugin
  } else {
    globalThis.LinkClearAllTrashPlugin = plugin
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function onReady() {
        document.removeEventListener('DOMContentLoaded', onReady)
        installPlugin()
      })
    } else {
      installPlugin()
    }
  }
})()
