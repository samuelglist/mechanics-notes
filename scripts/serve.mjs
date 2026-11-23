/**
 * Минимальный статический сервер без зависимостей.
 * Запуск: node scripts/serve.mjs [порт]
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const port = Number(process.argv[2] || process.env.PORT || 4175)
const host = process.env.HOST || '127.0.0.1'

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
}

const server = http.createServer((request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
    let pathname = decodeURIComponent(url.pathname)
    if (pathname === '/') pathname = '/index.html'

    const file = path.resolve(root, `.${pathname}`)
    if (!file.startsWith(root + path.sep) && file !== path.join(root, 'index.html')) {
      response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('403: путь вне сайта')
      return
    }

    fs.stat(file, (statError, stats) => {
      if (statError || !stats.isFile()) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        response.end('404: файл не найден')
        return
      }

      const ext = path.extname(file).toLowerCase()
      const headers = {
        'Content-Type': mime[ext] || 'application/octet-stream',
        'Content-Length': stats.size,
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      }
      response.writeHead(200, headers)
      fs.createReadStream(file).pipe(response)
    })
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end(`500: ${error.message}`)
  }
})

server.listen(port, host, () => {
  console.log(`Конспект доступен: http://${host}:${port}/`)
  console.log('Остановка: Ctrl+C')
})
