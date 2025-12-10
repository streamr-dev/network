# Migration Guide: Karma to Playwright

## Current Status

- ✅ **Karma** - Currently runs `test/unit`, `test/integration`, `test/end-to-end` with Jasmine + Webpack
- ✅ **Playwright** - New setup in `test/playwright/` directory, ready to use

## Why Gradual Migration?

Karma tests use:
- **Jasmine** test framework (`describe`, `it`, `expect`)
- **Webpack bundling** to resolve imports and create browser-compatible code  
- **Browser-specific code paths** (BrowserWebrtcConnection vs NodeWebrtcConnection)
- **Custom externals** mapping (`http` → `window.HTTP`, `ws` → `window.WebSocket`)

Playwright tests use:
- **Playwright Test** framework (similar API but different)
- **Direct TypeScript** execution in Electron
- **Same preload approach** as Karma for Node.js modules

## Migration Strategy

### Option 1: Keep Both (Recommended)

```json
{
  "scripts": {
    "test-browser": "karma start karma.config.js",  // Existing tests
    "test-playwright": "playwright test"             // New tests
  }
}
```

- **Karma**: Keep running existing tests (they work!)
- **Playwright**: Write new tests here, gradually migrate old ones
- **No rush**: Migrate tests as you touch them

### Option 2: Convert Tests to Playwright

To convert a Karma test to Playwright:

**1. Copy test from `test/unit/WebsocketServer.test.ts`:**
```typescript
// Original Karma/Jasmine test
describe('WebsocketServer', () => {
  it('starts and stops', async () => {
    const server = new WebsocketServer({ ... })
    const port = await server.start()
    expect(port).toEqual(19792)
    await server.stop()
  })
})
```

**2. Create `test/playwright/WebsocketServer.test.ts`:**
```typescript
import { test, expect } from '@playwright/test'
import { setupElectronTest, teardownElectronTest } from '../playwright-setup/electron-test-helper'

test.describe('WebsocketServer', () => {
  test('starts and stops', async () => {
    const { app, window } = await setupElectronTest()
    
    try {
      const result = await window.evaluate(async () => {
        // Access ws module from preload (window.WebSocket)
        const { WebSocketServer } = (window as any).WebSocket
        const server = new WebSocketServer({ port: 19792 })
        
        await new Promise((resolve) => server.on('listening', resolve))
        const addr = server.address()
        const port = typeof addr === 'string' ? 19792 : addr.port
        
        await new Promise((resolve) => server.close(resolve))
        return { port }
      })
      
      expect(result.port).toBe(19792)
    } finally {
      await teardownElectronTest({ app, window })
    }
  })
})
```

**Key differences:**
- Use `test.describe` instead of `describe`
- Use Playwright's `expect` (similar to Jasmine)
- Wrap browser code in `window.evaluate()`
- Access Node.js modules via preload globals (`window.WebSocket`, etc.)
- Manual setup/teardown of Electron context

### Option 3: Automated Migration Tool

Create a script to automatically convert tests (more complex, not recommended initially).

## Recommendation

**Keep using Karma for now.** The tests work, Karma works, and there's no urgent need to migrate. When you're ready:

1. ✅ Playwright is set up and working
2. ✅ You have working examples in `test/playwright/WebsocketServer.test.ts`
3. ⏭️ Migrate tests gradually as you work on them
4. ⏭️ Eventually deprecate Karma when all tests are migrated

The Playwright setup provides the **same browser environment** as Karma (Electron renderer + Node.js modules via preload), so migrated tests will have the same capabilities.

