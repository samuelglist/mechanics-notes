/**
 * Проверка сайта в headless Chrome через DevTools Protocol.
 * Запуск: node scripts/check.mjs [url]
 */
import http from 'node:http'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const project = path.resolve(__dirname, '..')
const outDir = path.join(project, '.shots')
fs.mkdirSync(outDir, { recursive: true })

const url = process.argv[2] || 'http://127.0.0.1:4175/'
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9334
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const profile = path.join(os.tmpdir(), `mechanics-check-${Date.now()}`)
fs.mkdirSync(profile, { recursive: true })

const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--hide-scrollbars',
  '--window-size=1600,1100',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: 'ignore' })

const getJson = (pathname) => new Promise((resolve, reject) => {
  const req = http.get({ host: '127.0.0.1', port: PORT, path: pathname, timeout: 3000 }, (res) => {
    let data = ''
    res.on('data', (chunk) => (data += chunk))
    res.on('end', () => {
      try { resolve(JSON.parse(data)) } catch (error) { reject(error) }
    })
  })
  req.on('error', reject)
  req.on('timeout', () => req.destroy(new Error('timeout')))
})

let version = null
for (let i = 0; i < 50; i++) {
  try {
    version = await getJson('/json/version')
    break
  } catch {
    await sleep(200)
  }
}
if (!version) {
  console.error('[check] Chrome не поднял порт отладки')
  chrome.kill()
  process.exit(2)
}

const ws = new WebSocket(version.webSocketDebuggerUrl)
let messageId = 0
const pending = new Map()
const consoleLines = []
const exceptions = []

ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message)
    pending.delete(message.id)
    return
  }
  if (message.method === 'Runtime.consoleAPICalled') {
    const text = (message.params.args || []).map((arg) => arg.value ?? arg.description ?? arg.type).join(' ')
    consoleLines.push(`[${message.params.type}] ${text}`)
  }
  if (message.method === 'Runtime.exceptionThrown') {
    const detail = message.params.exceptionDetails
    exceptions.push(`${detail.text} ${detail.exception?.description || ''} @ ${detail.url || ''}:${detail.lineNumber}`)
  }
  if (message.method === 'Log.entryAdded') {
    const entry = message.params.entry
    if (entry.level === 'error') consoleLines.push(`[log:error] ${entry.text} ${entry.url || ''}`)
  }
})

const send = (method, params = {}, sessionId) => new Promise((resolve) => {
  const id = ++messageId
  pending.set(id, resolve)
  ws.send(JSON.stringify({ id, method, params, sessionId }))
})

await new Promise((resolve) => ws.addEventListener('open', resolve))
const target = await send('Target.createTarget', { url: 'about:blank' })
const targetId = target.result.targetId
const attached = await send('Target.attachToTarget', { targetId, flatten: true })
const sessionId = attached.result.sessionId
await send('Runtime.enable', {}, sessionId)
await send('Log.enable', {}, sessionId)
await send('Page.enable', {}, sessionId)

const evaluate = async (expression) => {
  const response = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  }, sessionId)
  if (response.result?.exceptionDetails) {
    return { error: response.result.exceptionDetails.text }
  }
  return response.result?.result?.value
}

const screenshot = async (name) => {
  const response = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  }, sessionId)
  if (response.result?.data) {
    const file = path.join(outDir, name)
    fs.writeFileSync(file, Buffer.from(response.result.data, 'base64'))
    console.log(`[shot] ${file}`)
  }
}

const scrollTo = async (selector, offset = 82) => {
  const result = await evaluate(`(() => {
    document.documentElement.style.scrollBehavior = 'auto';
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return 'not found';
    const top = el.getBoundingClientRect().top + window.scrollY - ${offset};
    window.scrollTo(0, Math.max(0, top));
    return {top: Math.round(window.scrollY), height: document.documentElement.scrollHeight};
  })()`)
  await sleep(650)
  return result
}

console.log(`[check] открываю ${url}`)
await send('Page.navigate', { url }, sessionId)
await sleep(4200)

const report = await evaluate(`(() => ({
  title: document.title,
  readyState: document.readyState,
  bodyLength: document.body.innerText.length,
  chapters: document.querySelectorAll('.chapter').length,
  formulas: document.querySelectorAll('.katex').length,
  formulaErrors: document.querySelectorAll('.katex-error').length,
  displayModes: document.querySelectorAll('.katex-display').length,
  practiceCards: document.querySelectorAll('#practiceGrid .qa-card:not(.qa-primer)').length,
  practicePrimers: document.querySelectorAll('#practiceGrid .qa-primer').length,
  images: document.querySelectorAll('img').length,
  brokenImages: [...document.images].filter(img => img.complete && img.naturalWidth === 0).length,
  lazyPending: [...document.images].filter(img => !img.complete).length,
  revealHidden: [...document.querySelectorAll('.reveal')].filter(el => !el.classList.contains('is-visible')).length,
  overflow: document.documentElement.scrollWidth - window.innerWidth,
  theme: document.documentElement.dataset.theme,
  searchDialog: !!document.querySelector('#searchDialog'),
  pageViewer: !!document.querySelector('#pageViewer'),
  canvas: !!document.querySelector('#oscCanvas'),
  navLinks: document.querySelectorAll('.rail-link').length,
  pageHeight: document.documentElement.scrollHeight,
}))()`)
console.log('\n=== ДИАГНОСТИКА ===')
console.log(JSON.stringify(report, null, 2))

// Ключевые экраны
await scrollTo('#route')
await screenshot('check-route.png')
await scrollTo('#k01')
await screenshot('check-k01.png')
await scrollTo('#k04')
await screenshot('check-k04.png')
await scrollTo('#k02')
await screenshot('check-k02.png')
await scrollTo('#k03')
await screenshot('check-k03.png')
await scrollTo('#k06')
await screenshot('check-k06.png')
await scrollTo('#practice')
await screenshot('check-practice.png')
const practiceFilter = await evaluate(`(() => {
  const chip = [...document.querySelectorAll('.topic-chip')].find(el => el.dataset.practiceFilter === 'waves');
  chip?.click();
  return {
    count: document.querySelector('#practiceCount')?.textContent,
    visible: [...document.querySelectorAll('#practiceGrid .qa-card')].filter(el => !el.hidden).length,
    active: chip?.classList.contains('active'),
  };
})()`)
await sleep(300)
await screenshot('check-practice-waves.png')
console.log('[practice]', JSON.stringify(practiceFilter))
await evaluate(`[...document.querySelectorAll('.topic-chip')].find(el => el.dataset.practiceFilter === 'all')?.click()`)
await scrollTo('#k01 .figure-spherical')
await screenshot('check-sphere.png')
await scrollTo('.lab')
await screenshot('check-lab.png')
await scrollTo('#oscilloscope')
await sleep(900)
await screenshot('check-osc.png')
await scrollTo('#k09 .derivation')
await screenshot('check-derivation.png')
await scrollTo('#cheatsheet')
await screenshot('check-cheatsheet.png')
await scrollTo('#quiz')
await screenshot('check-quiz.png')
await scrollTo('#source')
await screenshot('check-source.png')

// Тёмная тема
await evaluate(`document.querySelector('#themeToggle').click()`)
await sleep(400)
await scrollTo('#k05')
await screenshot('check-dark.png')

// Поиск
await evaluate(`document.querySelector('#themeToggle').click(); document.querySelector('#searchTrigger').click();`)
await sleep(300)
const searchCount = await evaluate(`(() => {
  const input = document.querySelector('#searchInput');
  input.value = 'Лоренц';
  input.dispatchEvent(new Event('input', {bubbles: true}));
  return {results: document.querySelectorAll('.search-result').length, open: document.querySelector('#searchDialog').open};
})()`)
await sleep(250)
await screenshot('check-search.png')
console.log('\n[search]', JSON.stringify(searchCount))
await evaluate(`document.querySelector('#searchDialog').close()`)

// Лоренц-лаборатория
const lorentz = await evaluate(`(() => {
  const r = document.querySelector('#betaRange');
  r.value = '0.9';
  r.dispatchEvent(new Event('input', {bubbles: true}));
  return {
    gamma: document.querySelector('#gammaValue').textContent,
    time: document.querySelector('#timeDilation').textContent,
    length: document.querySelector('#lengthContraction').textContent,
  };
})()`)
console.log('[lorentz]', JSON.stringify(lorentz))

// Квиз
const quiz = await evaluate(`(() => {
  const answers = {q1:'b', q2:'a', q3:'b', q4:'a', q5:'c'};
  Object.entries(answers).forEach(([name, value]) => {
    const input = document.querySelector('input[name="' + name + '"][value="' + value + '"]');
    input.checked = true;
    input.dispatchEvent(new Event('change', {bubbles: true}));
  });
  document.querySelector('#quizForm').requestSubmit();
  return document.querySelector('#quizScore').textContent;
})()`)
console.log('[quiz]', quiz)

// Просмотр страницы
const viewer = await evaluate(`(() => {
  document.querySelector('[data-page="7"]').click();
  return {open: document.querySelector('#pageViewer').open, label: document.querySelector('#viewerPage').textContent};
})()`)
await sleep(250)
await screenshot('check-viewer.png')
console.log('[viewer]', JSON.stringify(viewer))
await evaluate(`document.querySelector('#pageViewer').close()`)

// Планшет
await send('Emulation.setDeviceMetricsOverride', {
  width: 1024,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
}, sessionId)
await evaluate(`window.scrollTo(0,0)`)
await sleep(400)
await scrollTo('#k04', 72)
await screenshot('check-tablet.png')
const tabletReport = await evaluate(`(() => ({
  width: window.innerWidth,
  overflow: document.documentElement.scrollWidth - window.innerWidth,
  rail: getComputedStyle(document.querySelector('.rail')).display,
  columnWidth: Math.round(document.querySelector('.chapter-main').getBoundingClientRect().width),
}))()`)
console.log('\n=== TABLET ===')
console.log(JSON.stringify(tabletReport, null, 2))

// Мобильная версия
await send('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true,
}, sessionId)
await evaluate(`window.scrollTo(0,0)`)
await sleep(600)
await screenshot('check-mobile-top.png')
await scrollTo('#k01', 70)
await screenshot('check-mobile-k01.png')
await scrollTo('#k09', 70)
await screenshot('check-mobile-k09.png')
await scrollTo('#cheatsheet', 70)
await screenshot('check-mobile-cheatsheet.png')
await scrollTo('#practice', 70)
await screenshot('check-mobile-practice.png')
await scrollTo('#oscilloscope', 70)
await sleep(500)
await screenshot('check-mobile-osc.png')
await scrollTo('#source', 70)
await screenshot('check-mobile-source.png')

const mobileReport = await evaluate(`(() => ({
  width: window.innerWidth,
  overflow: document.documentElement.scrollWidth - window.innerWidth,
  bodyHeight: document.documentElement.scrollHeight,
  formulaWidth: Math.max(...[...document.querySelectorAll('.math')].map(el => el.scrollWidth - el.clientWidth)),
  practiceFormulaWidth: Math.max(...[...document.querySelectorAll('.qa-formula')].map(el => el.scrollWidth - el.clientWidth)),
  practiceFormulaOverflows: [...document.querySelectorAll('.qa-formula')]
    .map(el => ({ text: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 70), overflow: el.scrollWidth - el.clientWidth }))
    .filter(el => el.overflow > 2)
    .sort((a, b) => b.overflow - a.overflow)
    .slice(0, 5),
  menuVisible: getComputedStyle(document.querySelector('#mobileMenu')).display,
  railVisible: getComputedStyle(document.querySelector('.rail')).display,
}))()`)
console.log('\n=== MOBILE ===')
console.log(JSON.stringify(mobileReport, null, 2))

console.log('\n=== ОШИБКИ КОНСОЛИ ===')
if (!consoleLines.length) console.log('(нет)')
else consoleLines.slice(0, 30).forEach((line) => console.log(line))

console.log('\n=== ИСКЛЮЧЕНИЯ ===')
if (!exceptions.length) console.log('(нет)')
else exceptions.slice(0, 20).forEach((line) => console.log(line))

await send('Target.closeTarget', { targetId })
ws.close()
chrome.kill()
await sleep(300)
try { fs.rmSync(profile, { recursive: true, force: true }) } catch { /* ignore */ }

const ok = report.chapters === 9 && report.practiceCards === 29 && report.formulas > 30 && report.formulaErrors === 0 && report.overflow === 0
console.log(`\nИТОГ: ${ok ? 'OK' : 'ЕСТЬ ПРОБЛЕМЫ'}`)
process.exit(ok ? 0 : 1)
