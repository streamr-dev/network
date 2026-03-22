/**
 * Minimal static file server for the Playwright test fixtures.
 * Serves HTML files from fixtures/ and bundled JS from dist/.
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const DIST_DIR = resolve(__dirname, 'dist')
const FIXTURES_DIR = resolve(__dirname, 'fixtures')

const MIME = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.map': 'application/json',
}

const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    let filePath

    if (url.pathname === '/') {
        filePath = resolve(FIXTURES_DIR, 'index.html')
    } else if (url.pathname.endsWith('.html')) {
        // Serve any .html from fixtures/
        filePath = resolve(FIXTURES_DIR, url.pathname.slice(1))
    } else {
        // Serve bundled JS from dist/
        filePath = resolve(DIST_DIR, url.pathname.slice(1))
    }

    try {
        const data = await readFile(filePath)
        const ext = extname(filePath)
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
        res.end(data)
    } catch {
        res.writeHead(404)
        res.end('Not found')
    }
})

server.listen(9876, () => {
    console.log('Test server listening on http://localhost:9876')
})
