// Serve the production output under subdirectories, as on a static games host.
import http from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join, resolve, sep, extname } from 'node:path'

const root = resolve('dist')
const mime = {
  '.html': 'text/html',
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
}
http
  .createServer(async (req, res) => {
    try {
      const url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
      let path = resolve(root, '.' + url)
      if (path !== root && !path.startsWith(root + sep)) throw new Error('Invalid path')
      if ((await stat(path)).isDirectory()) path = join(path, 'index.html')
      const file = await stat(path)
      if (!file.isFile()) throw new Error('Missing file')
      res.writeHead(200, {
        'Content-Type': mime[extname(path)] ?? 'application/octet-stream',
        'Content-Length': file.size,
        'Cache-Control': 'public, max-age=3600',
      })
      createReadStream(path)
        .on('error', () => res.destroy())
        .pipe(res)
    } catch {
      res.writeHead(404).end()
    }
  })
  .listen(4179, '127.0.0.1')
