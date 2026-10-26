import assert from 'node:assert/strict'
import { createServer, preview } from 'vite'

// HTTP smoke tests only: no browser, UI automation, or user localStorage access.
async function check(mode) {
  const options = { host: '127.0.0.1', port: 0, strictPort: true, open: false }
  const server = mode === 'preview' ? await preview({ preview: options }) : await createServer({ server: options })
  try {
    if (mode === 'dev') await server.listen()
    const address = server.httpServer.address()
    assert(address && typeof address === 'object', 'Expected a local HTTP server')
    const origin = `http://127.0.0.1:${address.port}`
    const response = await fetch(`${origin}/Your24h/`)
    assert.equal(response.status, 200)
    const html = await response.text()
    assert(!html.includes('%BASE_URL%'), 'HTML base placeholder was not expanded')
    const resources = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]).filter(path => path.startsWith('/'))
    assert(resources.includes('/Your24h/theme-init.js'), 'Theme bootstrap must use the project path')
    assert(resources.includes('/Your24h/favicon.svg'), 'Icon must use the project path')
    assert(resources.some(path => path.endsWith('.js') || path.endsWith('.ts')), 'Missing app entry')
    if (mode === 'preview') assert(resources.some(path => path.endsWith('.css')), 'Missing built CSS')
    for (const path of resources) {
      assert(path.startsWith('/Your24h/'), `Resource escaped the project path: ${path}`)
      const asset = await fetch(`${origin}${path}`)
      assert.equal(asset.status, 200, path)
      assert(!asset.headers.get('content-type')?.includes('text/html'), `${path} returned an HTML fallback`)
      const body = await asset.text()
      assert(body.length > 0, `${path} is empty`)
      if (path.endsWith('theme-init.js')) assert(body.includes('your-24h.theme.v1'), 'Incorrect theme bootstrap')
      if (path.endsWith('.svg')) assert(body.includes('<svg'), 'Incorrect favicon')
    }
    console.log(`${mode}: /Your24h/ and ${resources.length} referenced resources passed`)
  } finally {
    if (mode === 'dev') await server.close()
    else await new Promise((resolve, reject) => {
      server.httpServer.close(error => error ? reject(error) : resolve())
      server.httpServer.closeAllConnections?.()
    })
  }
}

await check('preview')
await check('dev')
