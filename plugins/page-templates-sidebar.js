;(function () {
  const plugin = {
    id: 'page-templates-sidebar',
    name: 'Page Templates Sidebar',
    version: '1.0.0',
    description:
      'Adds advanced page templates to the sidebar and creates fully populated pages with headings, checklists, lists, notes, and column layouts.',
    install: installPlugin,
    dispose: disposePlugin,
  }

  let styleElement = null
  let launcherElement = null
  let collapsedButtonElement = null
  let popoverElement = null
  let popoverListElement = null
  let popoverStatusElement = null
  let menuAnchorElement = null
  let observer = null
  let cleanupFns = []
  let syncScheduled = false
  let isCreating = false
  let isMenuOpen = false

  function installPlugin() {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return plugin
    }

    if (window.__linkPageTemplatesSidebarInstalled) {
      return plugin
    }

    window.__linkPageTemplatesSidebarInstalled = true

    syncPluginUi()

    const onPointerDown = (event) => {
      if (!isMenuOpen || !popoverElement) {
        return
      }

      if (
        popoverElement.contains(event.target) ||
        (launcherElement && launcherElement.contains(event.target)) ||
        (collapsedButtonElement && collapsedButtonElement.contains(event.target))
      ) {
        return
      }

      closePopover()
    }

    const onKeyDown = (event) => {
      if (event.key === 'Escape' && isMenuOpen && !isCreating) {
        event.preventDefault()
        closePopover()
      }
    }

    const onViewportChange = () => {
      if (isMenuOpen) {
        positionPopover()
      }
    }

    observer = new MutationObserver(() => {
      scheduleUiSync()
    })
    observer.observe(document.body, { childList: true, subtree: true })

    window.addEventListener('focus', scheduleUiSync, true)
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('resize', onViewportChange, true)
    window.addEventListener('scroll', onViewportChange, true)

    cleanupFns = [
      () => observer && observer.disconnect(),
      () => window.removeEventListener('focus', scheduleUiSync, true),
      () => window.removeEventListener('pointerdown', onPointerDown, true),
      () => window.removeEventListener('keydown', onKeyDown, true),
      () => window.removeEventListener('resize', onViewportChange, true),
      () => window.removeEventListener('scroll', onViewportChange, true),
    ]

    return plugin
  }

  function disposePlugin() {
    cleanupFns.forEach((cleanup) => cleanup())
    cleanupFns = []

    observer && observer.disconnect()
    observer = null

    if (launcherElement) {
      launcherElement.remove()
      launcherElement = null
    }

    if (collapsedButtonElement) {
      collapsedButtonElement.remove()
      collapsedButtonElement = null
    }

    if (popoverElement) {
      popoverElement.remove()
      popoverElement = null
      popoverListElement = null
      popoverStatusElement = null
    }

    menuAnchorElement = null
    isMenuOpen = false
    isCreating = false

    if (styleElement) {
      styleElement.remove()
      styleElement = null
    }

    delete window.__linkPageTemplatesSidebarInstalled
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
    ensurePopover()
    ensureLaunchers()
    attemptPendingFocus()
  }

  function ensureStyles() {
    if (styleElement) {
      return
    }

    styleElement = document.createElement('style')
    styleElement.dataset.linkPageTemplatesSidebar = 'true'
    styleElement.textContent = `
.link-page-template-launcher {
  position: relative;
}

.link-page-template-row {
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 10px;
  transition: background 150ms ease, color 150ms ease;
}

.link-page-template-row:hover,
.link-page-template-row:focus-visible {
  outline: none;
  background: hsl(var(--sidebar-accent, var(--accent)));
}

.link-page-template-row-label {
  flex: 1;
  min-width: 0;
  text-align: left;
  font-size: 14px;
}

.link-page-template-row-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
}

.link-page-template-glyph {
  width: 16px;
  height: 16px;
  color: hsl(var(--muted-foreground));
  flex: 0 0 auto;
}

.link-page-template-dot {
  width: 4px;
  height: 4px;
  border-radius: 999px;
  background: hsl(var(--muted-foreground) / 0.55);
}

.link-page-template-icon-button {
  border: 0;
  background: transparent;
  padding: 8px;
  border-radius: 10px;
  color: hsl(var(--muted-foreground));
  transition: background 150ms ease, color 150ms ease;
}

.link-page-template-icon-button:hover,
.link-page-template-icon-button:focus-visible {
  outline: none;
  background: hsl(var(--sidebar-accent, var(--accent)));
  color: hsl(var(--foreground));
}

.link-page-template-popover {
  position: fixed;
  z-index: 320;
  width: min(360px, calc(100vw - 24px));
  border: 1px solid hsl(var(--border) / 0.84);
  border-radius: 20px;
  padding: 14px;
  background:
    radial-gradient(circle at top right, hsl(var(--primary) / 0.08), transparent 34%),
    color-mix(in srgb, hsl(var(--card)) 94%, transparent);
  box-shadow: 0 26px 70px hsl(var(--background) / 0.36);
  backdrop-filter: blur(18px);
  opacity: 0;
  pointer-events: none;
  transform: translateY(8px) scale(0.985);
  transition: opacity 160ms ease, transform 160ms ease;
}

.link-page-template-popover[data-open="true"] {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0) scale(1);
}

.link-page-template-headline {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.link-page-template-eyebrow {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
}

.link-page-template-title {
  font-size: 15px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.link-page-template-copy {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.5;
  color: hsl(var(--muted-foreground));
}

.link-page-template-list {
  margin-top: 12px;
  display: grid;
  gap: 8px;
  max-height: min(56vh, 520px);
  overflow-y: auto;
  padding-right: 2px;
}

.link-page-template-option {
  width: 100%;
  border: 1px solid hsl(var(--border) / 0.82);
  border-radius: 16px;
  background: hsl(var(--background) / 0.6);
  color: inherit;
  padding: 11px 12px;
  display: flex;
  align-items: flex-start;
  gap: 11px;
  text-align: left;
  transition: transform 150ms ease, border-color 150ms ease, background 150ms ease;
}

.link-page-template-option:hover,
.link-page-template-option:focus-visible {
  outline: none;
  transform: translateY(-1px);
  border-color: hsl(var(--foreground) / 0.16);
  background: hsl(var(--accent) / 0.82);
}

.link-page-template-option[disabled] {
  opacity: 0.62;
  cursor: wait;
  transform: none;
}

.link-page-template-badge {
  width: 28px;
  height: 28px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid hsl(var(--border) / 0.82);
  background: hsl(var(--muted) / 0.52);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: hsl(var(--foreground));
  flex: 0 0 auto;
}

.link-page-template-body {
  min-width: 0;
}

.link-page-template-name {
  font-size: 13px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.link-page-template-desc {
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.45;
  color: hsl(var(--muted-foreground));
}

.link-page-template-meta {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.link-page-template-pill {
  border-radius: 999px;
  border: 1px solid hsl(var(--border) / 0.74);
  padding: 3px 7px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted) / 0.38);
}

.link-page-template-status {
  min-height: 16px;
  margin-top: 11px;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}
`
    document.head.appendChild(styleElement)
  }

  function ensurePopover() {
    if (popoverElement) {
      return
    }

    popoverElement = document.createElement('div')
    popoverElement.className = 'link-page-template-popover no-drag'
    popoverElement.dataset.open = 'false'
    document.body.appendChild(popoverElement)

    renderPopover()
  }

  function ensureLaunchers() {
    ensureExpandedLauncher()
    ensureCollapsedLauncher()
    renderPopover()
    if (isMenuOpen) {
      positionPopover()
    }
  }

  function ensureExpandedLauncher() {
    const footerSlot = findExpandedFooterSlot()
    if (!footerSlot) {
      if (launcherElement && launcherElement.parentElement) {
        launcherElement.remove()
      }
      return
    }

    if (!launcherElement) {
      launcherElement = document.createElement('div')
      launcherElement.className = 'px-1 link-page-template-launcher'
    }

    if (launcherElement.parentElement !== footerSlot.parentElement || launcherElement.nextElementSibling !== footerSlot) {
      footerSlot.parentElement.insertBefore(launcherElement, footerSlot)
    }

    renderExpandedLauncher()
  }

  function ensureCollapsedLauncher() {
    const todoButton = findCollapsedTodoButton()
    if (!todoButton || !todoButton.parentElement) {
      if (collapsedButtonElement && collapsedButtonElement.parentElement) {
        collapsedButtonElement.remove()
      }
      return
    }

    if (!collapsedButtonElement) {
      collapsedButtonElement = document.createElement('button')
      collapsedButtonElement.type = 'button'
      collapsedButtonElement.className = 'link-page-template-icon-button no-drag'
      collapsedButtonElement.title = 'Templates'
      collapsedButtonElement.setAttribute('aria-label', 'Templates')
      collapsedButtonElement.innerHTML = getGlyphSvg()
      collapsedButtonElement.addEventListener('click', () => {
        togglePopover(collapsedButtonElement)
      })
    }

    if (collapsedButtonElement.parentElement !== todoButton.parentElement || collapsedButtonElement.nextElementSibling !== todoButton) {
      todoButton.parentElement.insertBefore(collapsedButtonElement, todoButton)
    }
  }

  function renderExpandedLauncher() {
    if (!launcherElement) {
      return
    }

    launcherElement.innerHTML = `
      <button class="link-page-template-row w-full text-sidebar-foreground hover:bg-sidebar-accent rounded-lg" type="button">
        ${getGlyphSvg()}
        <span class="link-page-template-row-label">Templates</span>
        <span class="link-page-template-row-meta">
          <span>Pages</span>
          <span class="link-page-template-dot"></span>
          <span>${getTemplates().length}</span>
        </span>
      </button>
    `

    const button = launcherElement.querySelector('button')
    button.addEventListener('click', () => {
      togglePopover(button)
    })
  }

  function renderPopover() {
    if (!popoverElement) {
      return
    }

    const templates = getTemplates()
    const cards = templates
      .map(
        (template) => `
          <button class="link-page-template-option" type="button" data-template-id="${escapeHtml(template.id)}" ${
            isCreating ? 'disabled' : ''
          }>
            <span class="link-page-template-badge">${escapeHtml(template.short)}</span>
            <span class="link-page-template-body">
              <span class="link-page-template-name">${escapeHtml(template.title)}</span>
              <span class="link-page-template-desc">${escapeHtml(template.description)}</span>
              <span class="link-page-template-meta">
                ${template.tags.map((tag) => `<span class="link-page-template-pill">${escapeHtml(tag)}</span>`).join('')}
              </span>
            </span>
          </button>
        `
      )
      .join('')

    popoverElement.innerHTML = `
      <div class="link-page-template-headline">
        <div class="link-page-template-eyebrow">Templates</div>
        <div class="link-page-template-title">Create a structured page</div>
      </div>
      <div class="link-page-template-copy">Pick a template and the plugin will create the page, open it, and focus the first editable block.</div>
      <div class="link-page-template-list">${cards}</div>
      <div class="link-page-template-status"></div>
    `

    popoverListElement = popoverElement.querySelector('.link-page-template-list')
    popoverStatusElement = popoverElement.querySelector('.link-page-template-status')

    Array.from(popoverElement.querySelectorAll('[data-template-id]')).forEach((button) => {
      button.addEventListener('click', () => {
        void createTemplatePage(button.getAttribute('data-template-id') || '')
      })
    })
  }

  function togglePopover(anchorElement) {
    if (isMenuOpen && menuAnchorElement === anchorElement) {
      closePopover()
      return
    }

    openPopover(anchorElement)
  }

  function openPopover(anchorElement) {
    if (!popoverElement) {
      return
    }

    menuAnchorElement = anchorElement
    isMenuOpen = true
    popoverElement.dataset.open = 'true'
    renderPopover()
    setStatus(isCreating ? 'Creating page...' : 'Choose a template.')
    positionPopover()
  }

  function closePopover() {
    if (!popoverElement) {
      return
    }

    isMenuOpen = false
    menuAnchorElement = null
    popoverElement.dataset.open = 'false'
  }

  function positionPopover() {
    if (!popoverElement || !menuAnchorElement) {
      return
    }

    const anchorRect = menuAnchorElement.getBoundingClientRect()
    const viewportPadding = 12
    const desiredWidth = Math.min(360, window.innerWidth - viewportPadding * 2)
    let left = anchorRect.right + 12
    let top = anchorRect.top - 4

    popoverElement.style.width = `${desiredWidth}px`
    popoverElement.style.left = `${left}px`
    popoverElement.style.top = `${top}px`

    const rect = popoverElement.getBoundingClientRect()
    if (rect.right > window.innerWidth - viewportPadding) {
      left = Math.max(viewportPadding, anchorRect.left - rect.width - 12)
    }

    if (rect.bottom > window.innerHeight - viewportPadding) {
      top = Math.max(viewportPadding, window.innerHeight - rect.height - viewportPadding)
    }

    if (top < viewportPadding) {
      top = viewportPadding
    }

    popoverElement.style.left = `${left}px`
    popoverElement.style.top = `${top}px`
  }

  function findExpandedFooterSlot() {
    const todoButton = findExpandedTodoButton()
    return todoButton ? todoButton.closest('.px-1') : null
  }

  function findExpandedTodoButton() {
    return Array.from(document.querySelectorAll('button')).find((button) => {
      const text = normalizeText(button.textContent)
      return text === 'To-do List' && button.closest('.w-64.bg-sidebar')
    }) || null
  }

  function findCollapsedTodoButton() {
    return Array.from(document.querySelectorAll('button')).find((button) => {
      return button.getAttribute('title') === 'To-do List' && button.closest('.w-12.bg-sidebar')
    }) || null
  }

  async function createTemplatePage(templateId) {
    if (isCreating) {
      return
    }

    const template = getTemplates().find((item) => item.id === templateId)
    if (!template) {
      setStatus('Template not found.')
      return
    }

    if (!window.db || typeof window.db.addPage !== 'function' || typeof window.db.saveBlocksWithHistory !== 'function') {
      setStatus('Page database is not available.')
      return
    }

    isCreating = true
    renderPopover()
    setStatus(`Creating "${template.title}"...`)

    try {
      const pageId = createId()
      const today = getTodayDate()
      const page = {
        id: pageId,
        title: typeof template.pageTitle === 'function' ? template.pageTitle(today) : template.pageTitle,
        parentId: null,
        properties: template.properties(today),
      }

      const blocks = attachParentIds(template.blocks(today), null)
      const focusBlockId = findFirstEditableBlockId(blocks)

      const pageAdded = await window.db.addPage(page)
      if (!pageAdded) {
        throw new Error('Page could not be created.')
      }

      await window.db.saveBlocksWithHistory(pageId, blocks, {
        focusBlockId,
      })

      try {
        localStorage.setItem('lastOpenedPageId', pageId)
        if (focusBlockId) {
          localStorage.setItem(
            'link-page-template-pending-focus',
            JSON.stringify({
              pageId,
              blockId: focusBlockId,
              createdAt: Date.now(),
            })
          )
        }
      } catch (_error) {}

      setStatus(`Created "${page.title}". Refreshing workspace...`)
      window.setTimeout(() => {
        window.location.reload()
      }, 140)
    } catch (error) {
      isCreating = false
      renderPopover()
      setStatus(getErrorMessage(error))
    }
  }

  function getTemplates() {
    return [
      {
        id: 'project-os',
        short: 'OS',
        title: 'Project OS',
        description: 'North star, milestones, owners, risks, operating cadence, and launch readiness.',
        tags: ['Work', 'Ops', 'Columns'],
        pageTitle: (today) => `Project OS - ${today}`,
        properties: (today) => ({ status: 'In Progress', tags: ['Work', 'Tech'], date: today }),
        blocks: () => [
          h2('Executive summary'),
          text('What are we building, why does it matter now, and what changes when this project ships?'),
          divider(),
          columns([
            [h3('North star'), checklist('Define success metric'), checklist('Define non-negotiables'), quote('If this slips, what is the first signal we will see?')],
            [h3('Operating rhythm'), list('Weekly project review'), list('Decision log updated every Friday'), list('Owner updates before standup')],
          ]),
          h2('Milestones'),
          numbered('Kickoff complete'),
          numbered('Prototype validated with internal users'),
          numbered('Beta plan approved'),
          numbered('Launch checklist complete'),
          h2('Risk register'),
          checklist('Scope creep is captured with an explicit tradeoff'),
          checklist('External dependency owner is assigned'),
          checklist('Rollback plan is written'),
          code('Owners\n- Product:\n- Design:\n- Engineering:\n- Ops:'),
        ],
      },
      {
        id: 'meeting-command',
        short: 'MT',
        title: 'Meeting Command Center',
        description: 'Agenda, fast notes, decisions, action items, and follow-up in one page.',
        tags: ['Meetings', 'Checklist', 'Decisions'],
        pageTitle: (today) => `Meeting Command Center - ${today}`,
        properties: (today) => ({ status: 'Todo', tags: ['Work'], date: today }),
        blocks: () => [
          h2('Meeting purpose'),
          text('Describe the outcome this meeting must produce.'),
          columns([
            [h3('Agenda'), checklist('Opening context'), checklist('Key blockers'), checklist('Decision round'), checklist('Next actions')],
            [h3('People in room'), list('Facilitator'), list('Decision maker'), list('Subject matter expert'), list('Note owner')],
          ]),
          h2('Live notes'),
          text('Capture the most important context, not every sentence.'),
          h2('Decisions made'),
          numbered('Decision 1'),
          numbered('Decision 2'),
          h2('Action items'),
          checklist('Owner + due date'),
          checklist('Owner + due date'),
          quote('What should the team know before the next meeting?'),
        ],
      },
      {
        id: 'weekly-review',
        short: 'WR',
        title: 'Weekly Review',
        description: 'A personal or team review page for wins, blockers, metrics, and next focus.',
        tags: ['Review', 'Planning', 'Reflection'],
        pageTitle: (today) => `Weekly Review - ${today}`,
        properties: (today) => ({ status: 'In Progress', tags: ['Personal', 'Work'], date: today }),
        blocks: () => [
          h2('This week in one line'),
          quote('What story did this week tell?'),
          columns([
            [h3('Wins'), checklist('Win 1'), checklist('Win 2'), checklist('Win 3')],
            [h3('Drag factors'), checklist('Context switching'), checklist('Decision waiting'), checklist('Energy drain')],
          ]),
          h2('Metrics and signals'),
          list('Deep work sessions completed'),
          list('Major deliverables shipped'),
          list('Unexpected interruptions'),
          h2('What changed my mind?'),
          text('Capture new information, better assumptions, or a strategy shift.'),
          h2('Next week priorities'),
          checklist('Priority 1'),
          checklist('Priority 2'),
          checklist('Priority 3'),
        ],
      },
      {
        id: 'research-brief',
        short: 'RB',
        title: 'Research Brief',
        description: 'Question framing, assumptions, evidence collection, insights, and recommended next moves.',
        tags: ['Research', 'Insight', 'Strategy'],
        pageTitle: (today) => `Research Brief - ${today}`,
        properties: (today) => ({ status: 'Todo', tags: ['Tech', 'Work'], date: today }),
        blocks: () => [
          h2('Core question'),
          text('What exactly are we trying to learn?'),
          columns([
            [h3('Knowns'), list('Fact 1'), list('Fact 2'), list('Fact 3')],
            [h3('Unknowns'), checklist('Unknown 1'), checklist('Unknown 2'), checklist('Unknown 3')],
          ]),
          h2('Hypotheses'),
          numbered('Hypothesis 1'),
          numbered('Hypothesis 2'),
          h2('Evidence log'),
          list('Source + signal'),
          list('Source + contradiction'),
          list('Source + strong quote'),
          h2('Synthesis'),
          quote('What pattern appears when the evidence is viewed together?'),
          h2('Recommended next step'),
          checklist('Decision to make'),
          checklist('Experiment to run'),
        ],
      },
      {
        id: 'product-spec',
        short: 'PS',
        title: 'Product Spec',
        description: 'Problem framing, target audience, user flow, scope, acceptance, and rollout notes.',
        tags: ['Product', 'Spec', 'Build'],
        pageTitle: () => 'Product Spec',
        properties: (today) => ({ status: 'Todo', tags: ['Work', 'Tech'], date: today }),
        blocks: () => [
          h2('Problem statement'),
          text('What friction exists today, and who feels it most?'),
          columns([
            [h3('Audience'), checklist('Primary user'), checklist('Secondary user'), checklist('Power user edge case')],
            [h3('Outcome'), checklist('User value'), checklist('Business value'), checklist('Success signal')],
          ]),
          h2('Scope'),
          checklist('Must have'),
          checklist('Should have'),
          checklist('Not in scope'),
          h2('User flow'),
          numbered('Entry point'),
          numbered('Main action'),
          numbered('Confirmation state'),
          h2('Acceptance criteria'),
          checklist('Happy path works'),
          checklist('Failure state is clear'),
          checklist('Analytics event exists'),
          code('Open questions\n- \n- \n- '),
        ],
      },
      {
        id: 'client-workspace',
        short: 'CW',
        title: 'Client Workspace',
        description: 'Shared context for onboarding, deliverables, approvals, meetings, and handoff.',
        tags: ['Client', 'Delivery', 'Handoff'],
        pageTitle: () => 'Client Workspace',
        properties: (today) => ({ status: 'In Progress', tags: ['Work'], date: today }),
        blocks: () => [
          h2('Client snapshot'),
          text('Who is the client, what matters most to them, and what does success look like in their words?'),
          columns([
            [h3('Deliverables'), checklist('Deliverable 1'), checklist('Deliverable 2'), checklist('Deliverable 3')],
            [h3('Approvals'), checklist('Stakeholder sign-off'), checklist('Brand assets received'), checklist('Final review booked')],
          ]),
          h2('Communication rhythm'),
          list('Weekly sync'),
          list('Decision channel'),
          list('Escalation path'),
          h2('Current focus'),
          checklist('This week target'),
          checklist('Pending feedback'),
          h2('Handoff notes'),
          quote('What should the next person be able to understand in five minutes?'),
        ],
      },
    ]
  }

  function attachParentIds(blocks, parentId) {
    return (Array.isArray(blocks) ? blocks : []).map((block) => {
      const nextBlock = {
        ...block,
        parentId: parentId ?? null,
      }

      if (Array.isArray(block.children) && block.children.length > 0) {
        nextBlock.children = attachParentIds(block.children, block.id)
      }

      return nextBlock
    })
  }

  function text(content) {
    return { id: createId(), type: 'text', content }
  }

  function h2(content) {
    return { id: createId(), type: 'h2', content }
  }

  function h3(content) {
    return { id: createId(), type: 'h3', content }
  }

  function list(content) {
    return { id: createId(), type: 'list', content }
  }

  function numbered(content) {
    return { id: createId(), type: 'numbered', content }
  }

  function checklist(content, checked) {
    return { id: createId(), type: 'checklist', content, checked: Boolean(checked) }
  }

  function quote(content) {
    return { id: createId(), type: 'quote', content }
  }

  function divider() {
    return { id: createId(), type: 'divider', content: '' }
  }

  function code(content) {
    return { id: createId(), type: 'code', content }
  }

  function columns(columnBlocks) {
    const groups = Array.isArray(columnBlocks) ? columnBlocks : []
    const width = groups.length > 0 ? `${(100 / groups.length).toFixed(2)}%` : '50%'
    return {
      id: createId(),
      type: 'column_group',
      content: '',
      children: groups.map((blocks) => ({
        id: createId(),
        type: 'column',
        content: '',
        width,
        children: blocks,
      })),
    }
  }

  function createId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }

    return `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }

  function getTodayDate() {
    return new Date().toISOString().slice(0, 10)
  }

  function setStatus(message) {
    if (popoverStatusElement) {
      popoverStatusElement.textContent = message || ''
    }
  }

  function findFirstEditableBlockId(blocks) {
    const queue = Array.isArray(blocks) ? [...blocks] : []
    while (queue.length > 0) {
      const block = queue.shift()
      if (!block) {
        continue
      }

      if (isEditableBlockType(block.type)) {
        return block.id
      }

      if (Array.isArray(block.children) && block.children.length > 0) {
        queue.unshift(...block.children)
      }
    }

    return null
  }

  function isEditableBlockType(type) {
    return !['divider', 'column_group', 'column', 'image'].includes(type)
  }

  function attemptPendingFocus() {
    const pending = readPendingFocus()
    if (!pending || getActivePageId() !== pending.pageId) {
      return
    }

    const selector = `textarea[data-block-id="${escapeSelectorValue(pending.blockId)}"]`
    const input = document.querySelector(selector)
    if (!input) {
      if (Date.now() - pending.createdAt > 60000) {
        clearPendingFocus()
      }
      return
    }

    input.focus()
    if (typeof input.scrollIntoView === 'function') {
      input.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }

    if (typeof input.value === 'string' && typeof input.setSelectionRange === 'function') {
      const offset = input.value.length
      input.setSelectionRange(offset, offset)
    }

    clearPendingFocus()
  }

  function readPendingFocus() {
    try {
      const raw = localStorage.getItem('link-page-template-pending-focus')
      if (!raw) {
        return null
      }

      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed.pageId !== 'string' || typeof parsed.blockId !== 'string') {
        clearPendingFocus()
        return null
      }

      return {
        pageId: parsed.pageId,
        blockId: parsed.blockId,
        createdAt: Number(parsed.createdAt) || Date.now(),
      }
    } catch (_error) {
      clearPendingFocus()
      return null
    }
  }

  function clearPendingFocus() {
    try {
      localStorage.removeItem('link-page-template-pending-focus')
    } catch (_error) {}
  }

  function getActivePageId() {
    try {
      return localStorage.getItem('lastOpenedPageId') || ''
    } catch (_error) {
      return ''
    }
  }

  function getErrorMessage(error) {
    if (error instanceof Error && error.message) {
      return error.message
    }

    return typeof error === 'string' ? error : 'Template creation failed.'
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim()
  }

  function escapeSelectorValue(value) {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(String(value || ''))
    }

    return String(value || '').replace(/["\\]/g, '\\$&')
  }

  function getGlyphSvg() {
    return `
      <svg class="link-page-template-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M7.5 4.75h8.25a2.5 2.5 0 0 1 2.5 2.5v11a2.5 2.5 0 0 1-2.5 2.5H7.5a2.5 2.5 0 0 1-2.5-2.5v-11a2.5 2.5 0 0 1 2.5-2.5Z"></path>
        <path d="M9 9h6"></path>
        <path d="M9 12.5h6"></path>
        <path d="M9 16h4"></path>
      </svg>
    `
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
    globalThis.LinkPageTemplatesSidebarPlugin = plugin
  }
})()
