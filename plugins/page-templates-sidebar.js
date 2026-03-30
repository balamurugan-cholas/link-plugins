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
  let sectionElement = null
  let statusElement = null
  let observer = null
  let cleanupFns = []
  let syncScheduled = false
  let isCreating = false
  let isSectionOpen = readOpenPreference()

  function installPlugin() {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return plugin
    }

    if (window.__linkPageTemplatesSidebarInstalled) {
      return plugin
    }

    window.__linkPageTemplatesSidebarInstalled = true

    syncPluginUi()

    observer = new MutationObserver(() => {
      scheduleUiSync()
    })
    observer.observe(document.body, { childList: true, subtree: true })

    window.addEventListener('focus', scheduleUiSync, true)

    cleanupFns = [() => observer && observer.disconnect(), () => window.removeEventListener('focus', scheduleUiSync, true)]

    return plugin
  }

  function disposePlugin() {
    cleanupFns.forEach((cleanup) => cleanup())
    cleanupFns = []

    observer && observer.disconnect()
    observer = null

    if (sectionElement) {
      sectionElement.remove()
      sectionElement = null
      statusElement = null
    }

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
    ensureSection()
  }

  function ensureStyles() {
    if (styleElement) {
      return
    }

    styleElement = document.createElement('style')
    styleElement.dataset.linkPageTemplatesSidebar = 'true'
    styleElement.textContent = `
.link-page-templates {
  border: 1px solid hsl(var(--border) / 0.72);
  border-radius: 18px;
  padding: 10px 10px 12px;
  background:
    radial-gradient(circle at top right, hsl(var(--primary) / 0.09), transparent 42%),
    color-mix(in srgb, hsl(var(--muted)) 62%, transparent);
}

.link-page-templates-toggle {
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0;
}

.link-page-templates-label {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
  min-width: 0;
}

.link-page-templates-eyebrow {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground) / 0.72);
}

.link-page-templates-title {
  font-size: 13px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.link-page-templates-copy {
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.5;
  color: hsl(var(--muted-foreground));
}

.link-page-templates-list {
  margin-top: 12px;
  display: grid;
  gap: 8px;
}

.link-page-template-card {
  width: 100%;
  border: 1px solid hsl(var(--border) / 0.8);
  border-radius: 14px;
  background: hsl(var(--background) / 0.6);
  color: inherit;
  padding: 10px 11px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  text-align: left;
  transition: transform 150ms ease, border-color 150ms ease, background 150ms ease;
}

.link-page-template-card:hover,
.link-page-template-card:focus-visible {
  outline: none;
  transform: translateY(-1px);
  border-color: hsl(var(--foreground) / 0.16);
  background: hsl(var(--accent) / 0.82);
}

.link-page-template-card[disabled] {
  opacity: 0.62;
  cursor: wait;
  transform: none;
}

.link-page-template-icon {
  width: 26px;
  height: 26px;
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid hsl(var(--border) / 0.8);
  background: hsl(var(--muted) / 0.55);
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
  font-size: 12px;
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
  gap: 6px;
  flex-wrap: wrap;
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
  margin-top: 10px;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}
`
    document.head.appendChild(styleElement)
  }

  function ensureSection() {
    const scrollContainer = findSidebarScrollContainer()
    if (!scrollContainer) {
      if (sectionElement && sectionElement.parentElement) {
        sectionElement.remove()
      }
      return
    }

    if (!sectionElement) {
      sectionElement = document.createElement('div')
      sectionElement.className = 'link-page-templates'
    }

    const privateSection = findPrivateSection(scrollContainer)
    if (privateSection) {
      if (sectionElement.parentElement !== scrollContainer || sectionElement.nextElementSibling !== privateSection) {
        scrollContainer.insertBefore(sectionElement, privateSection)
      }
    } else if (sectionElement.parentElement !== scrollContainer) {
      scrollContainer.prepend(sectionElement)
    }

    renderSection()
  }

  function findSidebarScrollContainer() {
    return Array.from(document.querySelectorAll('div')).find((node) => {
      return (
        node.classList.contains('overflow-y-auto') &&
        node.classList.contains('flex-1') &&
        node.closest('.bg-sidebar')
      )
    }) || null
  }

  function findPrivateSection(scrollContainer) {
    const privateButton = Array.from(scrollContainer.querySelectorAll('button')).find((button) =>
      String(button.textContent || '').trim().startsWith('Private')
    )
    return privateButton ? privateButton.closest('.space-y-1') : null
  }

  function renderSection() {
    if (!sectionElement) {
      return
    }

    const templates = getTemplates()
    const templateCards = isSectionOpen
      ? templates
          .map(
            (template) => `
              <button class="link-page-template-card" type="button" data-template-id="${escapeHtml(template.id)}" ${
                isCreating ? 'disabled' : ''
              }>
                <span class="link-page-template-icon">${escapeHtml(template.short)}</span>
                <span class="link-page-template-body">
                  <span class="link-page-template-name">${escapeHtml(template.title)}</span>
                  <span class="link-page-template-desc">${escapeHtml(template.description)}</span>
                  <span class="link-page-template-meta">
                    ${template.tags
                      .map((tag) => `<span class="link-page-template-pill">${escapeHtml(tag)}</span>`)
                      .join('')}
                  </span>
                </span>
              </button>
            `
          )
          .join('')
      : ''

    sectionElement.innerHTML = `
      <button class="link-page-templates-toggle" type="button">
        <span class="link-page-templates-label">
          <span class="link-page-templates-eyebrow">Templates</span>
          <span class="link-page-templates-title">Advanced page starters</span>
        </span>
        <span class="link-page-template-pill">${isSectionOpen ? 'Hide' : 'Show'}</span>
      </button>
      <div class="link-page-templates-copy">Create fully structured pages with headings, columns, checklists, notes, and planning blocks.</div>
      ${isSectionOpen ? `<div class="link-page-templates-list">${templateCards}</div>` : ''}
      <div class="link-page-template-status"></div>
    `

    const toggleButton = sectionElement.querySelector('.link-page-templates-toggle')
    statusElement = sectionElement.querySelector('.link-page-template-status')

    toggleButton.addEventListener('click', () => {
      isSectionOpen = !isSectionOpen
      persistOpenPreference(isSectionOpen)
      renderSection()
    })

    Array.from(sectionElement.querySelectorAll('[data-template-id]')).forEach((button) => {
      button.addEventListener('click', () => {
        void createTemplatePage(button.getAttribute('data-template-id') || '')
      })
    })
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
    renderSection()
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

      const pageAdded = await window.db.addPage(page)
      if (!pageAdded) {
        throw new Error('Page could not be created.')
      }

      await window.db.saveBlocksWithHistory(pageId, blocks, {
        focusBlockId: blocks[0] ? blocks[0].id : null,
      })

      try {
        localStorage.setItem('lastOpenedPageId', pageId)
      } catch (_error) {}

      setStatus(`Created "${page.title}". Refreshing workspace...`)
      window.setTimeout(() => {
        window.location.reload()
      }, 140)
    } catch (error) {
      isCreating = false
      renderSection()
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
    if (statusElement) {
      statusElement.textContent = message || ''
    }
  }

  function readOpenPreference() {
    try {
      return localStorage.getItem('link-page-templates-open') !== 'false'
    } catch (_error) {
      return true
    }
  }

  function persistOpenPreference(value) {
    try {
      localStorage.setItem('link-page-templates-open', value ? 'true' : 'false')
    } catch (_error) {}
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
