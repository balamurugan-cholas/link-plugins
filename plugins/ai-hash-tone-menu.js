;(function () {
  const TONE_GROUPS = [
    {
      id: 'core',
      title: 'Core Voices',
      subtitle: 'Balanced defaults',
      tones: [
        { id: 'professional', label: 'Professional', description: 'Formal and polished' },
        { id: 'friendly', label: 'Friendly', description: 'Warm and approachable' },
        { id: 'concise', label: 'Concise', description: 'Short and to-the-point' },
        { id: 'simple', label: 'Simple', description: 'Easy to understand, no jargon' },
      ],
    },
    {
      id: 'work',
      title: 'The "Work" Pack',
      subtitle: 'Productivity focused',
      tones: [
        { id: 'authoritative', label: 'Authoritative', description: 'Confident and expert' },
        { id: 'diplomatic', label: 'Diplomatic', description: 'Tactful and polite' },
        { id: 'urgent', label: 'Urgent', description: 'Action-oriented and fast-paced' },
        { id: 'persuasive', label: 'Persuasive', description: 'Convincing and logical' },
      ],
    },
    {
      id: 'creative',
      title: 'The "Creative" Pack',
      subtitle: 'Personality focused',
      tones: [
        { id: 'enthusiastic', label: 'Enthusiastic', description: 'High energy and positive' },
        { id: 'casual', label: 'Casual', description: 'Relaxed and informal' },
        { id: 'humorous', label: 'Humorous', description: 'Witty and lighthearted' },
        { id: 'empathetic', label: 'Empathetic', description: 'Understanding and supportive' },
      ],
    },
    {
      id: 'technical',
      title: 'The "Technical" Pack',
      subtitle: 'Information focused',
      tones: [
        { id: 'academic', label: 'Academic', description: 'Sophisticated and structured' },
        { id: 'objective', label: 'Objective', description: 'Neutral and factual' },
        { id: 'detailed', label: 'Detailed', description: 'Thorough and explanatory' },
        { id: 'sarcastic', label: 'Sarcastic', description: 'For a snarky AI personality' },
      ],
    },
  ]

  const FLAT_TONES = TONE_GROUPS.flatMap((group) =>
    group.tones.map((tone) => ({
      ...tone,
      groupId: group.id,
      groupTitle: group.title,
      groupSubtitle: group.subtitle,
    }))
  )

  const plugin = {
    id: 'ai-hash-tone-menu',
    name: 'AI Hash Tone Menu',
    version: '1.0.0',
    description:
      'Shows an AI tone dropdown when users type # inside editor blocks, with grouped voice presets.',
    install: installPlugin,
    dispose: disposePlugin,
  }

  let styleElement = null
  let menuElement = null
  let listElement = null
  let helperElement = null
  let activeTextarea = null
  let activeMatch = null
  let groupedResults = []
  let flatResults = []
  let selectedIndex = 0
  let cleanupFns = []

  function installPlugin() {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return plugin
    }

    if (window.__linkAiHashToneMenuInstalled) {
      return plugin
    }

    window.__linkAiHashToneMenuInstalled = true

    ensureStyles()
    ensureMenu()

    const onFocusIn = (event) => {
      if (isEditorTextarea(event.target)) {
        activeTextarea = event.target
        updateMenuFromTextarea(activeTextarea)
      }
    }

    const onInput = (event) => {
      if (isEditorTextarea(event.target)) {
        activeTextarea = event.target
        updateMenuFromTextarea(activeTextarea)
      }
    }

    const onClick = (event) => {
      if (isEditorTextarea(event.target)) {
        activeTextarea = event.target
        window.setTimeout(() => updateMenuFromTextarea(activeTextarea), 0)
        return
      }

      if (menuElement && !menuElement.contains(event.target)) {
        closeMenu()
      }
    }

    const onSelectionChange = () => {
      if (!activeTextarea || document.activeElement !== activeTextarea) {
        closeMenu()
        return
      }

      updateMenuFromTextarea(activeTextarea)
    }

    const onKeyDown = (event) => {
      if (!activeTextarea || !flatResults.length || event.target !== activeTextarea) {
        return
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        selectedIndex = (selectedIndex + 1) % flatResults.length
        renderMenu()
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        selectedIndex = (selectedIndex - 1 + flatResults.length) % flatResults.length
        renderMenu()
        return
      }

      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        applyTone(flatResults[selectedIndex])
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        closeMenu()
      }
    }

    const onViewportChange = () => {
      if (menuElement && menuElement.dataset.open === 'true') {
        positionMenu()
      }
    }

    document.addEventListener('focusin', onFocusIn, true)
    document.addEventListener('input', onInput, true)
    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('selectionchange', onSelectionChange, true)
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, true)

    cleanupFns = [
      () => document.removeEventListener('focusin', onFocusIn, true),
      () => document.removeEventListener('input', onInput, true),
      () => document.removeEventListener('click', onClick, true),
      () => document.removeEventListener('keydown', onKeyDown, true),
      () => document.removeEventListener('selectionchange', onSelectionChange, true),
      () => window.removeEventListener('resize', onViewportChange),
      () => window.removeEventListener('scroll', onViewportChange, true),
    ]

    return plugin
  }

  function disposePlugin() {
    cleanupFns.forEach((cleanup) => cleanup())
    cleanupFns = []
    closeMenu()
    helperElement && helperElement.remove()
    helperElement = null
    menuElement && menuElement.remove()
    menuElement = null
    listElement = null
    styleElement && styleElement.remove()
    styleElement = null
    activeTextarea = null
    activeMatch = null
    groupedResults = []
    flatResults = []
    selectedIndex = 0

    if (typeof window !== 'undefined') {
      window.__linkAiHashToneMenuInstalled = false
    }
  }

  function isEditorTextarea(target) {
    return !!(target && target instanceof HTMLTextAreaElement && target.matches('textarea[data-block-id]'))
  }

  function ensureStyles() {
    if (styleElement) {
      return
    }

    styleElement = document.createElement('style')
    styleElement.id = 'link-ai-hash-tone-menu-styles'
    styleElement.textContent = `
      .link-ai-tone-menu {
        position: fixed;
        z-index: 99999;
        width: 320px;
        max-height: 360px;
        overflow: hidden;
        border: 1px solid var(--border, #E5E7EB);
        border-radius: 14px;
        background: color-mix(in srgb, var(--card, #FFFFFF) 92%, transparent);
        color: var(--foreground, #1F2937);
        box-shadow: 0 18px 40px rgba(15, 23, 42, 0.16);
        backdrop-filter: blur(18px);
        display: none;
      }
      .link-ai-tone-menu[data-open="true"] {
        display: block;
      }
      .link-ai-tone-menu__header {
        padding: 12px 14px 10px;
        border-bottom: 1px solid color-mix(in srgb, var(--border, #E5E7EB) 85%, transparent);
        background: color-mix(in srgb, var(--muted, #F9FAFB) 74%, transparent);
      }
      .link-ai-tone-menu__eyebrow {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--muted-foreground, #6B7280);
      }
      .link-ai-tone-menu__title {
        margin-top: 6px;
        font-size: 13px;
        font-weight: 600;
      }
      .link-ai-tone-menu__list {
        max-height: 292px;
        overflow-y: auto;
        padding: 6px;
      }
      .link-ai-tone-menu__group {
        padding-top: 4px;
      }
      .link-ai-tone-menu__group-label {
        padding: 8px 10px 6px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--muted-foreground, #6B7280);
      }
      .link-ai-tone-menu__item {
        width: 100%;
        border: 0;
        background: transparent;
        color: inherit;
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 10px 12px;
        border-radius: 12px;
        text-align: left;
        cursor: pointer;
      }
      .link-ai-tone-menu__item:hover,
      .link-ai-tone-menu__item[data-selected="true"] {
        background: var(--accent, #E5E7EB);
      }
      .link-ai-tone-menu__badge {
        min-width: 34px;
        height: 34px;
        border-radius: 10px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in srgb, var(--muted, #F9FAFB) 92%, transparent);
        border: 1px solid color-mix(in srgb, var(--border, #E5E7EB) 80%, transparent);
        font-size: 11px;
        font-weight: 700;
      }
      .link-ai-tone-menu__item[data-selected="true"] .link-ai-tone-menu__badge {
        background: var(--background, #FFFFFF);
      }
      .link-ai-tone-menu__label {
        font-size: 13px;
        font-weight: 600;
        line-height: 1.2;
      }
      .link-ai-tone-menu__description {
        margin-top: 4px;
        font-size: 11px;
        line-height: 1.35;
        color: var(--muted-foreground, #6B7280);
      }
      .link-ai-tone-menu__empty {
        padding: 18px 14px;
        text-align: center;
        font-size: 12px;
        color: var(--muted-foreground, #6B7280);
      }
    `

    document.head.appendChild(styleElement)
  }

  function ensureMenu() {
    if (menuElement) {
      return
    }

    menuElement = document.createElement('div')
    menuElement.className = 'link-ai-tone-menu'
    menuElement.dataset.open = 'false'
    menuElement.innerHTML = `
      <div class="link-ai-tone-menu__header">
        <div class="link-ai-tone-menu__eyebrow">AI Tone Presets</div>
        <div class="link-ai-tone-menu__title">Type after # to filter voice styles</div>
      </div>
      <div class="link-ai-tone-menu__list"></div>
    `

    listElement = menuElement.querySelector('.link-ai-tone-menu__list')
    document.body.appendChild(menuElement)
  }

  function updateMenuFromTextarea(textarea) {
    if (!textarea) {
      closeMenu()
      return
    }

    const match = getHashMatch(textarea)
    if (!match) {
      closeMenu()
      return
    }

    const nextFlatResults = filterToneOptions(match.query)
    if (!nextFlatResults.length) {
      closeMenu()
      return
    }

    activeTextarea = textarea
    activeMatch = match
    flatResults = nextFlatResults
    groupedResults = groupFilteredTones(nextFlatResults)
    selectedIndex = Math.min(selectedIndex, flatResults.length - 1)
    renderMenu()
    positionMenu()
  }

  function getHashMatch(textarea) {
    if (textarea.selectionStart == null || textarea.selectionEnd == null) {
      return null
    }

    if (textarea.selectionStart !== textarea.selectionEnd) {
      return null
    }

    const caretIndex = textarea.selectionStart
    const beforeCaret = textarea.value.slice(0, caretIndex)
    const triggerMatch = beforeCaret.match(/(?:^|\s)#([^\s#]*)$/)

    if (!triggerMatch) {
      return null
    }

    const hashIndex = beforeCaret.lastIndexOf('#')
    let tokenEnd = caretIndex

    while (tokenEnd < textarea.value.length && !/\s/.test(textarea.value[tokenEnd])) {
      tokenEnd += 1
    }

    return {
      query: triggerMatch[1] || '',
      start: hashIndex,
      end: tokenEnd,
      caret: caretIndex,
    }
  }

  function filterToneOptions(query) {
    const normalizedQuery = String(query || '').trim().toLowerCase()
    if (!normalizedQuery) {
      return FLAT_TONES.slice()
    }

    return FLAT_TONES.filter((tone) => {
      const haystack = [
        tone.label,
        tone.description,
        tone.groupTitle,
        tone.groupSubtitle,
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalizedQuery)
    })
  }

  function groupFilteredTones(filteredTones) {
    return TONE_GROUPS.map((group) => ({
      ...group,
      tones: filteredTones.filter((tone) => tone.groupId === group.id),
    })).filter((group) => group.tones.length > 0)
  }

  function renderMenu() {
    if (!menuElement || !listElement || !flatResults.length) {
      closeMenu()
      return
    }

    listElement.innerHTML = ''

    groupedResults.forEach((group) => {
      const groupElement = document.createElement('div')
      groupElement.className = 'link-ai-tone-menu__group'

      const headerElement = document.createElement('div')
      headerElement.className = 'link-ai-tone-menu__group-label'
      headerElement.textContent = `${group.title} - ${group.subtitle}`
      groupElement.appendChild(headerElement)

      group.tones.forEach((tone) => {
        const absoluteIndex = flatResults.findIndex((item) => item.id === tone.id)
        const itemElement = document.createElement('button')
        itemElement.type = 'button'
        itemElement.className = 'link-ai-tone-menu__item'
        itemElement.dataset.selected = absoluteIndex === selectedIndex ? 'true' : 'false'
        itemElement.innerHTML = `
          <span class="link-ai-tone-menu__badge">#</span>
          <span>
            <div class="link-ai-tone-menu__label">${tone.label}</div>
            <div class="link-ai-tone-menu__description">${tone.description}</div>
          </span>
        `

        itemElement.addEventListener('mouseenter', function () {
          selectedIndex = absoluteIndex
          renderMenu()
        })

        itemElement.addEventListener('mousedown', function (event) {
          event.preventDefault()
        })

        itemElement.addEventListener('click', function () {
          applyTone(tone)
        })

        groupElement.appendChild(itemElement)
      })

      listElement.appendChild(groupElement)
    })

    menuElement.dataset.open = 'true'
  }

  function applyTone(tone) {
    if (!activeTextarea || !activeMatch || !tone) {
      closeMenu()
      return
    }

    const insertion = `#${tone.label} `
    const nextValue =
      activeTextarea.value.slice(0, activeMatch.start) +
      insertion +
      activeTextarea.value.slice(activeMatch.end)

    const nextCaret = activeMatch.start + insertion.length

    activeTextarea.value = nextValue
    activeTextarea.focus()
    activeTextarea.setSelectionRange(nextCaret, nextCaret)
    activeTextarea.dispatchEvent(new Event('input', { bubbles: true }))
    closeMenu()
  }

  function closeMenu() {
    if (menuElement) {
      menuElement.dataset.open = 'false'
    }

    activeMatch = null
    groupedResults = []
    flatResults = []
    selectedIndex = 0
  }

  function positionMenu() {
    if (!menuElement || !activeTextarea || !activeMatch) {
      return
    }

    const caretPosition = getCaretCoordinates(activeTextarea, activeMatch.caret)
    const menuRect = menuElement.getBoundingClientRect()
    const viewportPadding = 12
    const gap = 10

    let left = caretPosition.left
    let top = caretPosition.top + caretPosition.height + gap

    if (left + menuRect.width > window.innerWidth - viewportPadding) {
      left = window.innerWidth - menuRect.width - viewportPadding
    }

    if (left < viewportPadding) {
      left = viewportPadding
    }

    if (top + menuRect.height > window.innerHeight - viewportPadding) {
      top = caretPosition.top - menuRect.height - gap
    }

    if (top < viewportPadding) {
      top = viewportPadding
    }

    menuElement.style.left = `${left}px`
    menuElement.style.top = `${top}px`
  }

  function getCaretCoordinates(textarea, caretIndex) {
    if (!helperElement) {
      helperElement = document.createElement('div')
      helperElement.style.position = 'fixed'
      helperElement.style.pointerEvents = 'none'
      helperElement.style.whiteSpace = 'pre-wrap'
      helperElement.style.wordWrap = 'break-word'
      helperElement.style.visibility = 'hidden'
      helperElement.style.top = '0'
      helperElement.style.left = '-9999px'
      document.body.appendChild(helperElement)
    }

    const computed = window.getComputedStyle(textarea)
    const textareaRect = textarea.getBoundingClientRect()
    const propertiesToCopy = [
      'boxSizing',
      'width',
      'height',
      'overflowX',
      'overflowY',
      'borderTopWidth',
      'borderRightWidth',
      'borderBottomWidth',
      'borderLeftWidth',
      'paddingTop',
      'paddingRight',
      'paddingBottom',
      'paddingLeft',
      'fontStyle',
      'fontVariant',
      'fontWeight',
      'fontStretch',
      'fontSize',
      'fontSizeAdjust',
      'lineHeight',
      'fontFamily',
      'textAlign',
      'textTransform',
      'textIndent',
      'textDecoration',
      'letterSpacing',
      'wordSpacing',
    ]

    propertiesToCopy.forEach((propertyName) => {
      helperElement.style[propertyName] = computed[propertyName]
    })

    helperElement.style.width = `${textarea.clientWidth}px`
    helperElement.textContent = textarea.value.slice(0, caretIndex)

    const marker = document.createElement('span')
    marker.textContent = textarea.value.slice(caretIndex) || '.'
    helperElement.appendChild(marker)

    const markerRect = marker.getBoundingClientRect()
    const left =
      textareaRect.left +
      markerRect.left -
      helperElement.getBoundingClientRect().left -
      textarea.scrollLeft
    const top =
      textareaRect.top +
      markerRect.top -
      helperElement.getBoundingClientRect().top -
      textarea.scrollTop

    helperElement.innerHTML = ''

    return {
      left,
      top,
      height: markerRect.height || parseFloat(computed.lineHeight) || 20,
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = plugin
  } else {
    globalThis.LinkAiHashToneMenuPlugin = plugin
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
