/* ============================================================
   Механика по-человечески · интерактив
   Без зависимостей, кроме локального KaTeX.
   ============================================================ */

(() => {
  'use strict'

  const $ = (selector, root = document) => root.querySelector(selector)
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector))
  const root = document.documentElement
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const THEME_KEY = 'mechanics-notes:theme'

  const safeStorage = {
    get(key) {
      try { return localStorage.getItem(key) } catch { return null }
    },
    set(key, value) {
      try { localStorage.setItem(key, value) } catch { /* file:// или приватный режим */ }
    },
  }

  /* ---------- KaTeX ---------- */

  function renderMath() {
    if (typeof window.renderMathInElement !== 'function') return
    window.renderMathInElement(document.body, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false },
      ],
      throwOnError: false,
      strict: false,
      trust: false,
      ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option'],
    })
  }

  /* ---------- тема ---------- */

  function applyTheme(theme, persist = true) {
    root.dataset.theme = theme
    const meta = $('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', theme === 'ink' ? '#151b17' : '#18231f')
    if (persist) safeStorage.set(THEME_KEY, theme)
    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }))
  }

  function initTheme() {
    const saved = safeStorage.get(THEME_KEY)
    if (saved === 'paper' || saved === 'ink') {
      applyTheme(saved, false)
    } else {
      applyTheme('paper', false)
    }

    const button = $('#themeToggle')
    if (button) {
      button.addEventListener('click', () => {
        const next = root.dataset.theme === 'ink' ? 'paper' : 'ink'
        applyTheme(next)
      })
    }
  }

  /* ---------- прогресс и активная глава ---------- */

  function initProgress() {
    const progressBar = $('#progressBar')
    const railProgress = $('#railProgress')
    const progressPct = $('#progressPct')
    const nowReading = $('#nowReading')
    const railLinks = $$('.rail-link')
    const chapters = $$('.chapter')
    const specials = [
      { element: $('#practice'), title: 'Практикум' },
      { element: $('#cheatsheet'), title: 'Шпаргалка' },
      { element: $('#quiz'), title: 'Проверь себя' },
      { element: $('#source'), title: 'Источник' },
    ].filter((item) => item.element)
    const backToTop = $('#backToTop')
    let ticking = false

    const update = () => {
      const doc = document.documentElement
      const max = doc.scrollHeight - window.innerHeight
      const value = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
      const percent = Math.round(value * 100)
      if (progressBar) progressBar.style.width = `${value * 100}%`
      if (railProgress) railProgress.style.width = `${value * 100}%`
      if (progressPct) progressPct.textContent = `${percent}%`
      if (backToTop) backToTop.classList.toggle('visible', window.scrollY > 720)

      let active = null
      const marker = window.scrollY + 180
      chapters.forEach((chapter) => {
        if (chapter.offsetTop <= marker) active = chapter
      })
      railLinks.forEach((link) => {
        const on = active && link.dataset.section === active.id
        link.classList.toggle('active', Boolean(on))
        if (on) link.setAttribute('aria-current', 'true')
        else link.removeAttribute('aria-current')
      })
      if (nowReading) {
        let title = active ? active.dataset.title || 'Конспект' : 'Введение'
        specials.forEach((item) => {
          if (item.element.offsetTop <= marker) title = item.title
        })
        nowReading.textContent = title
      }
      ticking = false
    }

    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(update)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    update()

    if (backToTop) {
      backToTop.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' })
      })
    }
  }

  /* ---------- появление блоков ---------- */

  function initReveal() {
    const nodes = $$('.reveal')
    if (!nodes.length) return

    if (prefersReducedMotion || !('IntersectionObserver' in window)) {
      nodes.forEach((node) => node.classList.add('is-visible'))
      return
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible')
          observer.unobserve(entry.target)
        }
      })
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.04 })

    nodes.forEach((node) => observer.observe(node))

    // Страховка: если observer по какой-то причине не сработал,
    // контент не должен остаться скрытым.
    window.setTimeout(() => {
      nodes.forEach((node) => {
        if (!node.classList.contains('is-visible')) node.classList.add('is-visible')
      })
    }, 2600)
  }

  /* ---------- мобильное меню ---------- */

  function initMobileMenu() {
    const button = $('#mobileMenu')
    const drawer = $('#mobileDrawer')
    if (!button || !drawer) return

    const setOpen = (open) => {
      drawer.hidden = !open
      button.setAttribute('aria-expanded', String(open))
      button.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню')
    }

    button.addEventListener('click', () => setOpen(drawer.hidden))
    $$('a', drawer).forEach((link) => link.addEventListener('click', () => setOpen(false)))
    window.addEventListener('resize', () => {
      if (window.innerWidth > 980 && !drawer.hidden) setOpen(false)
    })
  }

  /* ---------- поиск ---------- */

  function initSearch() {
    const dialog = $('#searchDialog')
    const trigger = $('#searchTrigger')
    const close = $('#searchClose')
    const input = $('#searchInput')
    const resultsBox = $('#searchResults')
    if (!dialog || !trigger || !input || !resultsBox) return

    const searchableSections = [
      ...$$('.chapter'),
      $('#practice'),
      $('#cheatsheet'),
      $('#quiz'),
      $('#source'),
    ].filter(Boolean)

    const index = []
    const seen = new Set()

    searchableSections.forEach((section) => {
      const title =
        section.dataset.title ||
        section.querySelector('h2')?.textContent?.trim() ||
        'Конспект'
      const id = section.id
      const nodes = section.querySelectorAll(
        'p, li, h3, .formula-caption, .definition-label, .cheat-tag, .note-label'
      )
      nodes.forEach((node) => {
        // не индексируем вложенные p внутри li повторно
        if (node.tagName === 'P' && node.closest('li')) return
        // скрытые ответы и закрытые details не должны попадать в выдачу
        if (node.closest('[hidden]')) return
        const details = node.closest('details')
        if (details && !details.open) return
        const text = (node.textContent || '').replace(/\s+/g, ' ').trim()
        if (text.length < 22) return
        const key = `${id}:${text}`
        if (seen.has(key)) return
        seen.add(key)
        const qaCard = node.closest('.qa-card')
        const qaTopic = qaCard?.querySelector('.qa-topic')?.textContent?.replace(/\s+/g, ' ').trim()
        const entryTitle = qaTopic ? `Практикум · ${qaTopic}` : title
        index.push({ text, title: entryTitle, id, element: node })
      })
    })

    let selected = -1
    let currentResults = []
    let lastFocus = null

    const escapeHtml = (value) =>
      value.replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
      }[ch]))

    const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    const snippet = (text, query) => {
      const lower = text.toLocaleLowerCase('ru')
      const q = query.toLocaleLowerCase('ru')
      const idx = lower.indexOf(q)
      const start = Math.max(0, idx - 58)
      const end = Math.min(text.length, (idx < 0 ? 0 : idx) + q.length + 96)
      let value = text.slice(start, end).trim()
      if (start > 0) value = `… ${value}`
      if (end < text.length) value = `${value} …`
      const safe = escapeHtml(value)
      if (!q) return safe
      return safe.replace(
        new RegExp(escapeRegExp(escapeHtml(q)), 'giu'),
        (match) => `<mark>${match}</mark>`
      )
    }

    const render = () => {
      const query = input.value.trim()
      resultsBox.innerHTML = ''
      selected = -1
      currentResults = []
      if (!query) {
        resultsBox.innerHTML =
          '<p class="search-empty">Начните вводить запрос — поиск идёт по всем девяти главам, шпаргалке и вопросам.</p>'
        return
      }

      const q = query.toLocaleLowerCase('ru')
      const scored = index
        .map((item) => {
          const hay = `${item.title} ${item.text}`.toLocaleLowerCase('ru')
          const inTitle = item.title.toLocaleLowerCase('ru').includes(q)
          const inText = item.text.toLocaleLowerCase('ru').includes(q)
          if (!inText && !inTitle) return null
          let score = 0
          if (inTitle) score += 8
          if (inText) score += 3
          const pos = hay.indexOf(q)
          if (pos >= 0) score += Math.max(0, 4 - pos / 160)
          return { ...item, score }
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .slice(0, 14)

      currentResults = scored
      if (!scored.length) {
        resultsBox.innerHTML =
          '<p class="search-empty">Ничего не нашлось. Попробуйте «Лоренц», «момент инерции» или «затухание».</p>'
        return
      }

      scored.forEach((item, i) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'search-result'
        button.dataset.index = String(i)
        button.innerHTML = `<small>${escapeHtml(item.title)}</small><strong>${snippet(item.text, query)}</strong>`
        button.addEventListener('click', () => choose(i))
        resultsBox.appendChild(button)
      })

      if (scored.length < 3) {
        const more = document.createElement('p')
        more.className = 'search-more'
        more.textContent = 'Совет: ищите по смыслу — «энергия», «импульс», «прецессия».'
        resultsBox.appendChild(more)
      }
    }

    const choose = (i) => {
      const item = currentResults[i]
      if (!item) return
      dialog.close()
      if (item.id === 'practice') {
        document.querySelector('[data-practice-filter="all"]')?.click()
      }
      const section = document.getElementById(item.id)
      if (section) {
        const target = item.element || section
        target.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'center' })
        section.classList.remove('is-flashing')
        // перезапуск CSS-анимации
        void section.offsetWidth
        section.classList.add('is-flashing')
        window.setTimeout(() => section.classList.remove('is-flashing'), 1400)
      }
    }

    const move = (delta) => {
      if (!currentResults.length) return
      selected = (selected + delta + currentResults.length) % currentResults.length
      $$('.search-result', resultsBox).forEach((el, i) => {
        el.classList.toggle('is-selected', i === selected)
      })
      const active = resultsBox.querySelector('.search-result.is-selected')
      if (active) active.scrollIntoView({ block: 'nearest' })
    }

    trigger.addEventListener('click', () => {
      lastFocus = document.activeElement
      if (!dialog.open) dialog.showModal()
      input.focus()
      input.select()
      render()
    })

    close?.addEventListener('click', () => dialog.close())

    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close()
    })

    dialog.addEventListener('close', () => {
      if (lastFocus instanceof HTMLElement) lastFocus.focus()
    })

    input.addEventListener('input', render)

    input.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        move(1)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        move(-1)
      } else if (event.key === 'Enter') {
        event.preventDefault()
        choose(selected >= 0 ? selected : 0)
      }
    })

    document.addEventListener('keydown', (event) => {
      const target = event.target
      const typing = target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (!dialog.open) {
          lastFocus = document.activeElement
          dialog.showModal()
          input.focus()
          input.select()
          render()
        }
      } else if (event.key === '/' && !typing && !dialog.open) {
        event.preventDefault()
        lastFocus = document.activeElement
        dialog.showModal()
        input.focus()
        render()
      }
    })
  }

  /* ---------- копирование формул ---------- */

  function initCopy() {
    document.addEventListener('click', async (event) => {
      const button = event.target.closest('.copy-formula')
      if (!button) return

      const card = button.closest('.formula-card, .cheat-card, .derivation')
      if (!card) return

      const annotations = $$('annotation[encoding="application/x-tex"]', card)
      const tex = annotations.map((node) => node.textContent.trim()).join('\n\n')
      if (!tex) return

      let copied = false
      try {
        await navigator.clipboard.writeText(tex)
        copied = true
      } catch {
        try {
          const area = document.createElement('textarea')
          area.value = tex
          area.setAttribute('readonly', '')
          area.style.position = 'fixed'
          area.style.opacity = '0'
          document.body.appendChild(area)
          area.select()
          copied = document.execCommand('copy')
          area.remove()
        } catch {
          copied = false
        }
      }

      if (copied) {
        const label = button.querySelector('span')
        const old = label?.textContent
        if (label) label.textContent = 'Скопировано'
        button.classList.add('is-copied')
        showToast('Формула скопирована в LaTeX')
        window.setTimeout(() => {
          if (label && old) label.textContent = old
          button.classList.remove('is-copied')
        }, 1800)
      } else {
        showToast('Не удалось скопировать — выделите формулу вручную')
      }
    })
  }

  /* ---------- тост ---------- */

  let toastTimer = 0
  function showToast(message) {
    const toast = $('#toast')
    if (!toast) return
    toast.textContent = message
    toast.classList.add('show')
    window.clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2300)
  }

  /* ---------- лоренц-лаборатория ---------- */

  function initLorentzLab() {
    const range = $('#betaRange')
    if (!range) return
    const gammaValue = $('#gammaValue')
    const betaValue = $('#betaValue')
    const timeDilation = $('#timeDilation')
    const lengthContraction = $('#lengthContraction')
    const timeBar = $('#timeBar')
    const lengthBar = $('#lengthBar')
    const note = $('#labNote')

    const update = () => {
      const beta = Math.min(0.999, Math.max(0, Number(range.value) || 0))
      const gamma = 1 / Math.sqrt(1 - beta * beta)
      if (gammaValue) gammaValue.textContent = gamma.toFixed(3)
      if (betaValue) betaValue.textContent = beta.toFixed(3)
      if (timeDilation) timeDilation.textContent = `${gamma.toFixed(2)} с`
      if (lengthContraction) lengthContraction.textContent = `${(1 / gamma).toFixed(2)} м`
      if (timeBar) timeBar.style.width = `${Math.min(100, (gamma / 5) * 100)}%`
      if (lengthBar) lengthBar.style.width = `${Math.min(100, (1 / gamma) * 100)}%`
      if (note) {
        if (beta < 0.01) {
          note.textContent = 'При малых скоростях γ ≈ 1 — релятивистские эффекты практически незаметны.'
        } else {
          const percent = Math.round((gamma - 1) * 100)
          note.textContent = `При β = ${beta.toFixed(3)} время между тиками растягивается на ${percent}%, а продольная длина сжимается до ${Math.round((1 / gamma) * 100)}% от собственной.`
        }
      }
    }

    range.addEventListener('input', update)
    update()
  }

  /* ---------- осциллограф ---------- */

  function initOscilloscope() {
    const canvas = $('#oscCanvas')
    const scope = $('#oscilloscope')
    if (!canvas || !scope) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dampRange = $('#dampRange')
    const freqRange = $('#freqRange')
    const dampOut = $('#dampOut')
    const freqOut = $('#freqOut')
    const tauOut = $('#oscTau')
    const ampOut = $('#oscAmp')
    const playButton = $('#oscPlay')
    const playLabel = playButton?.querySelector('span')
    const playIcon = playButton?.querySelector('use')

    const T_MAX = 10
    let damping = Number(dampRange?.value || 0.08)
    let frequency = Number(freqRange?.value || 1.6)
    let playhead = 2.1
    let playing = !prefersReducedMotion
    let visible = false
    let width = 0
    let height = 0
    let dpr = 1
    let lastFrame = 0
    let raf = 0

    const css = (name) => getComputedStyle(root).getPropertyValue(name).trim()

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      width = Math.max(320, rect.width)
      height = Math.max(210, rect.height || 300)
      dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      draw()
    }

    const curveY = (t) => {
      const envelope = Math.exp(-Math.max(0, damping) * t)
      return envelope * Math.cos(frequency * t)
    }

    const draw = () => {
      if (!width || !height) return
      const accent = css('--accent') || '#d95732'
      const ink = css('--ink') || '#19201c'
      const muted = css('--muted') || '#6b7268'
      const line = css('--line') || '#d8cebb'
      const paper = css('--card') || '#fbf8ef'

      ctx.clearRect(0, 0, width, height)

      const pad = { left: 44, right: 17, top: 20, bottom: 31 }
      const plotW = width - pad.left - pad.right
      const plotH = height - pad.top - pad.bottom
      const x = (t) => pad.left + (t / T_MAX) * plotW
      const y = (value) => pad.top + ((1.18 - value) / 2.36) * plotH

      // лёгкая подложка графика
      ctx.fillStyle = paper
      ctx.globalAlpha = 0.35
      ctx.fillRect(pad.left, pad.top, plotW, plotH)
      ctx.globalAlpha = 1

      ctx.strokeStyle = line
      ctx.lineWidth = 1
      ctx.font = '9px Consolas, monospace'
      ctx.fillStyle = muted

      // горизонтальная сетка и подписи x
      for (let value = -1; value <= 1.001; value += 0.5) {
        const yy = y(value)
        ctx.globalAlpha = value === 0 ? 0.85 : 0.42
        ctx.beginPath()
        ctx.moveTo(pad.left, yy)
        ctx.lineTo(pad.left + plotW, yy)
        ctx.stroke()
        ctx.globalAlpha = 1
        if (value !== 0) ctx.fillText(value.toFixed(1), 9, yy + 3)
      }

      // вертикальная сетка
      for (let t = 0; t <= T_MAX + 0.01; t += 2) {
        const xx = x(t)
        ctx.globalAlpha = 0.35
        ctx.beginPath()
        ctx.moveTo(xx, pad.top)
        ctx.lineTo(xx, pad.top + plotH)
        ctx.stroke()
        ctx.globalAlpha = 1
        ctx.fillText(String(t), xx - 3, pad.top + plotH + 17)
      }

      // оси
      ctx.globalAlpha = 1
      ctx.strokeStyle = muted
      ctx.lineWidth = 1.15
      ctx.beginPath()
      ctx.moveTo(pad.left, pad.top)
      ctx.lineTo(pad.left, pad.top + plotH)
      ctx.lineTo(pad.left + plotW, pad.top + plotH)
      ctx.stroke()

      ctx.fillStyle = muted
      ctx.font = '11px Consolas, monospace'
      ctx.fillText('x', 19, pad.top + 2)
      ctx.fillText('t', pad.left + plotW + 2, pad.top + plotH + 3)

      // огибающая
      ctx.save()
      ctx.strokeStyle = muted
      ctx.globalAlpha = 0.62
      ctx.lineWidth = 1
      ctx.setLineDash([4, 5])
      ;[1, -1].forEach((sign) => {
        ctx.beginPath()
        for (let i = 0; i <= 360; i += 1) {
          const t = (i / 360) * T_MAX
          const yy = y(sign * Math.exp(-Math.max(0, damping) * t))
          if (i === 0) ctx.moveTo(x(t), yy)
          else ctx.lineTo(x(t), yy)
        }
        ctx.stroke()
      })
      ctx.restore()

      // сама кривая
      ctx.save()
      ctx.strokeStyle = accent
      ctx.lineWidth = 2.2
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.beginPath()
      for (let i = 0; i <= 720; i += 1) {
        const t = (i / 720) * T_MAX
        const yy = y(curveY(t))
        if (i === 0) ctx.moveTo(x(t), yy)
        else ctx.lineTo(x(t), yy)
      }
      ctx.stroke()
      ctx.restore()

      // маркер
      const markerX = x(playhead)
      const markerY = y(curveY(playhead))
      ctx.save()
      ctx.strokeStyle = accent
      ctx.globalAlpha = 0.22
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(markerX, pad.top)
      ctx.lineTo(markerX, pad.top + plotH)
      ctx.stroke()
      ctx.restore()

      ctx.save()
      ctx.fillStyle = accent
      ctx.beginPath()
      ctx.arc(markerX, markerY, 4.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = paper
      ctx.lineWidth = 1.8
      ctx.stroke()
      ctx.restore()

      // подпись состояния
      const envelope = Math.exp(-Math.max(0, damping) * playhead)
      if (ampOut) ampOut.textContent = `A/A₀ = ${envelope.toFixed(2)}`
    }

    const updateLabels = () => {
      if (dampOut) dampOut.textContent = damping.toFixed(2)
      if (freqOut) freqOut.textContent = frequency.toFixed(2)
      if (tauOut) {
        tauOut.textContent = damping <= 0 ? 'τ = ∞' : `τ = ${(1 / damping).toFixed(1)} с`
      }
      draw()
    }

    const setPlaying = (next) => {
      playing = next
      if (playButton) playButton.setAttribute('aria-pressed', String(playing))
      if (playLabel) playLabel.textContent = playing ? 'Пауза' : 'Запустить'
      if (playIcon) playIcon.setAttribute('href', playing ? '#i-pause' : '#i-play')
      if (playing) {
        lastFrame = 0
        if (!raf) raf = requestAnimationFrame(tick)
      } else if (raf) {
        cancelAnimationFrame(raf)
        raf = 0
        draw()
      }
    }

    const tick = (time) => {
      if (!playing) {
        raf = 0
        return
      }
      if (!lastFrame) lastFrame = time
      const dt = Math.min(0.05, (time - lastFrame) / 1000)
      lastFrame = time
      playhead = (playhead + dt * 0.9) % T_MAX
      draw()
      raf = requestAnimationFrame(tick)
    }

    dampRange?.addEventListener('input', () => {
      damping = Number(dampRange.value) || 0
      updateLabels()
    })

    freqRange?.addEventListener('input', () => {
      frequency = Number(freqRange.value) || 1.6
      updateLabels()
    })

    playButton?.addEventListener('click', () => setPlaying(!playing))

    document.addEventListener('themechange', () => {
      window.setTimeout(() => {
        draw()
      }, 40)
    })

    if ('ResizeObserver' in window) {
      new ResizeObserver(resize).observe(canvas)
    } else {
      window.addEventListener('resize', resize)
    }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        const entry = entries[0]
        visible = entry.isIntersecting
        if (visible && playing && !raf) {
          lastFrame = 0
          raf = requestAnimationFrame(tick)
        }
        if (!visible && raf) {
          cancelAnimationFrame(raf)
          raf = 0
        }
      }, { rootMargin: '100px 0px' }).observe(scope)
    } else {
      visible = true
    }

    updateLabels()
    resize()
    setPlaying(playing)

    // если вкладка скрыта, не крутим анимацию вхолостую
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (raf) cancelAnimationFrame(raf)
        raf = 0
      } else if (playing && visible) {
        lastFrame = 0
        raf = requestAnimationFrame(tick)
      }
    })
  }

  /* ---------- фильтры практикума и шпаргалки ---------- */

  function initPracticeFilter() {
    const chips = $$('.topic-chip')
    const cards = $$('#practiceGrid .qa-card')
    const count = $('#practiceCount')
    if (!chips.length || !cards.length) return

    const questions = cards.filter((card) => !card.classList.contains('qa-primer'))

    const apply = (filter) => {
      chips.forEach((chip) => {
        const active = chip.dataset.practiceFilter === filter
        chip.classList.toggle('active', active)
        chip.setAttribute('aria-pressed', String(active))
      })

      let visible = 0
      cards.forEach((card) => {
        const show = filter === 'all' || card.dataset.practiceTopic === filter
        card.hidden = !show
        if (show && !card.classList.contains('qa-primer')) visible += 1
      })

      if (count) {
        count.textContent = filter === 'all'
          ? `${questions.length} из ${questions.length}`
          : `${visible} из ${questions.filter((card) => card.dataset.practiceTopic === filter).length}`
      }
    }

    chips.forEach((chip) => {
      chip.addEventListener('click', () => apply(chip.dataset.practiceFilter || 'all'))
    })

    apply('all')
  }

  function initFormulaFilter() {
    const chips = $$('.filter-chip')
    const cards = $$('#formulaGrid .cheat-card')
    if (!chips.length || !cards.length) return

    const apply = (filter) => {
      chips.forEach((chip) => {
        const active = chip.dataset.filter === filter
        chip.classList.toggle('active', active)
        chip.setAttribute('aria-pressed', String(active))
      })
      cards.forEach((card) => {
        card.hidden = filter !== 'all' && card.dataset.group !== filter
      })
    }

    chips.forEach((chip) => {
      chip.addEventListener('click', () => apply(chip.dataset.filter || 'all'))
    })
  }

  /* ---------- квиз ---------- */

  function initQuiz() {
    const form = $('#quizForm')
    if (!form) return
    const scoreBox = $('#quizScore')
    const answers = { q1: 'b', q2: 'a', q3: 'b', q4: 'a', q5: 'c' }

    form.addEventListener('submit', (event) => {
      event.preventDefault()
      const missing = []
      let score = 0

      Object.entries(answers).forEach(([name, correct]) => {
        const question = form.querySelector(`[data-question="${name.slice(1)}"]`)
        const selected = form.querySelector(`input[name="${name}"]:checked`)
        if (!question) return
        question.classList.remove('is-correct', 'is-wrong')
        const explain = question.querySelector('.quiz-explain')
        if (!selected) {
          missing.push(name)
          if (explain) explain.hidden = true
          return
        }
        const isCorrect = selected.value === correct
        if (isCorrect) score += 1
        question.classList.add(isCorrect ? 'is-correct' : 'is-wrong')
        if (explain) explain.hidden = false
      })

      if (missing.length) {
        if (scoreBox) {
          scoreBox.classList.remove('is-done')
          scoreBox.textContent = `Осталось ответить: ${missing.length}. Выберите вариант в каждом вопросе.`
        }
        const first = form.querySelector(`input[name="${missing[0]}"]`)
        first?.focus()
        return
      }

      if (scoreBox) {
        scoreBox.classList.add('is-done')
        let message = ''
        if (score === 5) message = 'Отлично — можно закрывать тетрадь.'
        else if (score === 4) message = 'Почти всё: одна тема ждёт повторения.'
        else if (score >= 2) message = 'Неплохо, но стоит вернуться к главам.'
        else message = 'Конспект рядом — начните с кинематики.'
        scoreBox.textContent = `${score} из 5 · ${message}`
      }
    })

    form.addEventListener('change', () => {
      if (scoreBox) {
        scoreBox.classList.remove('is-done')
        scoreBox.textContent = 'Нажмите «Показать результат», чтобы проверить ответы.'
      }
    })
  }

  /* ---------- просмотр оригинала ---------- */

  function initPageViewer() {
    const dialog = $('#pageViewer')
    if (!dialog) return
    const image = $('#viewerImage')
    const label = $('#viewerPage')
    const prev = $('#viewerPrev')
    const next = $('#viewerNext')
    const close = $('#viewerClose')
    const download = $('#viewerDownload')
    const total = 19
    let page = 1

    const pageSrc = (n) => `assets/pages/page-${String(n).padStart(2, '0')}.webp`

    const show = (n) => {
      page = Math.min(total, Math.max(1, n))
      if (image) {
        image.src = pageSrc(page)
        image.alt = `Страница ${page} оригинала`
      }
      if (label) label.textContent = String(page)
      if (prev) prev.disabled = page === 1
      if (next) next.disabled = page === total
      if (download) {
        download.href = 'assets/source/book.pdf'
        download.textContent = 'Скачать PDF'
      }
    }

    const open = (n) => {
      show(n)
      if (!dialog.open) dialog.showModal()
    }

    $$('[data-page]').forEach((button) => {
      button.addEventListener('click', () => open(Number(button.dataset.page) || 1))
    })

    prev?.addEventListener('click', () => show(page - 1))
    next?.addEventListener('click', () => show(page + 1))
    close?.addEventListener('click', () => dialog.close())

    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close()
    })

    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        show(page - 1)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        show(page + 1)
      }
    })

    show(1)
  }

  /* ---------- инициализация ---------- */

  const init = () => {
    initTheme()
    renderMath()
    initProgress()
    initReveal()
    initMobileMenu()
    initSearch()
    initCopy()
    initLorentzLab()
    initOscilloscope()
    initPracticeFilter()
    initFormulaFilter()
    initQuiz()
    initPageViewer()

    // Небольшая задержка, чтобы KaTeX успел разложить формулы
    // и поисковый индекс увидел уже готовый текст.
    window.setTimeout(() => {
      // повторный рендер не нужен, но прогресс стоит пересчитать
      window.dispatchEvent(new Event('resize'))
    }, 300)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true })
  } else {
    init()
  }
})()
