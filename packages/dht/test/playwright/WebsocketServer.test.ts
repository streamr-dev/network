/**
 * Example Playwright test for WebSocket server
 * This demonstrates how to migrate from Karma to Playwright
 * Tests run in Electron renderer with Node.js modules available via preload
 */

import { test, expect } from '@playwright/test'
import { setupElectronTest, teardownElectronTest } from '../playwright-setup/electron-test-helper'

test.describe('WebsocketServer (Playwright + Electron)', () => {
  
  test('starts and stops', async () => {
    const { app, window } = await setupElectronTest()
    
    try {
      // Execute test in browser context
      // Node.js modules (ws) are available via preload script
      const result = await window.evaluate(async () => {
        // Get WebSocket from global (injected by preload.js)
        const ws = (window as any).WebSocket
        const { WebSocketServer } = ws
        
        // Create WebSocket server in browser context
        const server = new WebSocketServer({ port: 19792 })
        
        // Wait for server to be listening
        await new Promise((resolve) => {
          server.on('listening', resolve)
        })
        
        const address = server.address()
        const port = typeof address === 'string' ? 19792 : address.port
        
        // Close server
        await new Promise((resolve) => {
          server.close(resolve)
        })
        
        return { port, success: true }
      })
      
      expect(result.port).toBe(19792)
      expect(result.success).toBe(true)
      
    } finally {
      await teardownElectronTest({ app, window })
    }
  })
  
  test('throws if server is already in use', async () => {
    const { app, window } = await setupElectronTest()
    
    try {
      const result = await window.evaluate(async () => {
        const ws = (window as any).WebSocket
        const { WebSocketServer } = ws
        
        // Start first server
        const server1 = new WebSocketServer({ port: 19793 })
        await new Promise((resolve) => server1.on('listening', resolve))
        
        // Try to start second server on same port
        let errorThrown = false
        try {
          const server2 = new WebSocketServer({ port: 19793 })
          await new Promise((resolve, reject) => {
            server2.on('listening', resolve)
            server2.on('error', reject)
          })
        } catch (error) {
          errorThrown = true
        }
        
        // Cleanup
        await new Promise((resolve) => server1.close(resolve))
        
        return { errorThrown }
      })
      
      expect(result.errorThrown).toBe(true)
      
    } finally {
      await teardownElectronTest({ app, window })
    }
  })
  
  test('browser WebSocket client can connect to Node.js WebSocket server and exchange data', async () => {
    const { app, window } = await setupElectronTest()
    
    try {
      const result = await window.evaluate(async () => {
        // Get Node.js WebSocket module from preload
        const wsModule = (window as any).WebSocket
        const { WebSocketServer } = wsModule
        
        // Get Node.js http module from preload
        const http = (window as any).HTTP
        
        // Create HTTP server (required for WebSocket server)
        const httpServer = http.createServer()
        
        // Create WebSocket server using Node.js module
        const wsServer = new WebSocketServer({ server: httpServer })
        
        const messages: { from: string; data: string }[] = []
        
        // Server-side message handler
        wsServer.on('connection', (ws: any) => {
          ws.on('message', (data: any) => {
            const message = data.toString()
            messages.push({ from: 'server-received', data: message })
            
            // Echo back to client with modification
            ws.send(`Server echo: ${message}`)
          })
          
          // Send initial message from server
          ws.send('Hello from Node.js WebSocket server!')
        })
        
        // Start HTTP server
        await new Promise<void>((resolve) => {
          httpServer.listen(19794, '127.0.0.1', () => {
            resolve()
          })
        })
        
        // Now use BROWSER WebSocket API to connect
        // This is the native WebSocket constructor, NOT the Node.js one!
        const BrowserWebSocket = (window as any).constructor.WebSocket || WebSocket
        const client = new BrowserWebSocket('ws://127.0.0.1:19794')
        
        // Client-side message handler
        await new Promise<void>((resolve, reject) => {
          let messageCount = 0
          
          client.onopen = () => {
            messages.push({ from: 'client-connected', data: 'connected' })
            // Send message from browser client to Node.js server
            client.send('Hello from browser WebSocket client!')
          }
          
          client.onmessage = (event: MessageEvent) => {
            const data = event.data
            messages.push({ from: 'client-received', data })
            messageCount++
            
            // After receiving 2 messages (initial + echo), we're done
            if (messageCount >= 2) {
              client.close()
            }
          }
          
          client.onclose = () => {
            resolve()
          }
          
          client.onerror = (error: Event) => {
            reject(error)
          }
          
          // Timeout after 5 seconds
          setTimeout(() => reject(new Error('Timeout waiting for messages')), 5000)
        })
        
        // Cleanup
        await new Promise<void>((resolve) => {
          httpServer.close(() => resolve())
        })
        
        return {
          messages,
          success: true,
          usedBrowserWebSocket: typeof BrowserWebSocket !== 'undefined'
        }
      })
      
      // Verify the data exchange
      expect(result.success).toBe(true)
      expect(result.usedBrowserWebSocket).toBe(true)
      expect(result.messages.length).toBeGreaterThanOrEqual(4)
      
      // Check message flow
      const messageData = result.messages.map(m => m.data)
      expect(messageData).toContain('connected')
      expect(messageData.some(d => d.includes('Hello from Node.js WebSocket server'))).toBe(true)
      expect(messageData.some(d => d.includes('Server echo: Hello from browser WebSocket client'))).toBe(true)
      
      console.log('✅ Full WebSocket communication:', result.messages)
      
    } finally {
      await teardownElectronTest({ app, window })
    }
  })
})

test.describe('Browser Environment Verification', () => {
  
  test('has browser globals (window, document, navigator)', async () => {
    const { app, window } = await setupElectronTest()
    
    try {
      const browserInfo = await window.evaluate(() => {
        return {
          // Browser-specific globals that DON'T exist in Node.js
          hasWindow: typeof window !== 'undefined',
          hasDocument: typeof document !== 'undefined',
          hasNavigator: typeof navigator !== 'undefined',
          
          // Browser info
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          
          // Window dimensions (proves we're in a real window, not Node.js)
          windowWidth: window.innerWidth,
          windowHeight: window.innerHeight,
          
          // Document info (only in browser)
          documentTitle: document.title,
          documentURL: document.URL,
          documentHasBody: !!document.body,
          
          // More browser-only APIs
          hasRequestAnimationFrame: typeof requestAnimationFrame !== 'undefined',
          hasAlert: typeof alert !== 'undefined',
          hasLocation: typeof location !== 'undefined',
        }
      })
      
      // Verify browser-only environment
      expect(browserInfo.hasWindow).toBe(true)
      expect(browserInfo.hasDocument).toBe(true)
      expect(browserInfo.hasNavigator).toBe(true)
      expect(browserInfo.hasRequestAnimationFrame).toBe(true)
      expect(browserInfo.hasAlert).toBe(true)
      expect(browserInfo.hasLocation).toBe(true)
      
      // Verify browser dimensions (proves real browser window, not Node.js)
      expect(browserInfo.windowWidth).toBe(1024)  // From electron-main.js config
      expect(browserInfo.windowHeight).toBeGreaterThanOrEqual(700)  // ~768 minus window chrome
      expect(browserInfo.windowHeight).toBeLessThanOrEqual(768)
      
      // Verify document structure
      expect(browserInfo.documentHasBody).toBe(true)
      expect(browserInfo.documentURL).toContain('about:blank')
      
      console.log('✅ Running in BROWSER environment:', browserInfo)
      
    } finally {
      await teardownElectronTest({ app, window })
    }
  })
  
  test('can manipulate DOM', async () => {
    const { app, window } = await setupElectronTest()
    
    try {
      const result = await window.evaluate(() => {
        // Create DOM elements (only works in browser!)
        const div = document.createElement('div')
        div.id = 'test-element'
        div.textContent = 'Hello from browser!'
        div.style.color = 'blue'
        document.body.appendChild(div)
        
        // Query the element back
        const element = document.getElementById('test-element')
        
        return {
          elementExists: !!element,
          elementText: element?.textContent,
          elementColor: element?.style.color,
          bodyChildren: document.body.children.length
        }
      })
      
      expect(result.elementExists).toBe(true)
      expect(result.elementText).toBe('Hello from browser!')
      expect(result.elementColor).toBe('blue')
      expect(result.bodyChildren).toBeGreaterThan(0)
      
    } finally {
      await teardownElectronTest({ app, window })
    }
  })
  
  test('has Node.js modules available via preload (ws, http, etc)', async () => {
    const { app, window } = await setupElectronTest()
    
    try {
      const modulesInfo = await window.evaluate(() => {
        return {
          // Browser globals
          isBrowser: typeof window !== 'undefined',
          
          // Node.js modules injected by preload
          hasWebSocket: typeof (window as any).WebSocket !== 'undefined',
          hasHTTP: typeof (window as any).HTTP !== 'undefined',
          hasHTTPS: typeof (window as any).HTTPS !== 'undefined',
          hasExpress: typeof (window as any).Express !== 'undefined',
          hasBuffer: typeof (window as any).Buffer !== 'undefined',
          
          // Electron test marker
          isElectronTest: !!(window as any)._streamr_electron_test,
          isPlaywrightTest: !!(window as any)._playwright_electron_test,
          
          // WebSocket module details
          webSocketHasServer: typeof (window as any).WebSocket?.WebSocketServer !== 'undefined',
        }
      })
      
      // Verify browser environment
      expect(modulesInfo.isBrowser).toBe(true)
      
      // Verify Node.js modules are available (injected by preload)
      expect(modulesInfo.hasWebSocket).toBe(true)
      expect(modulesInfo.hasHTTP).toBe(true)
      expect(modulesInfo.hasHTTPS).toBe(true)
      expect(modulesInfo.hasExpress).toBe(true)
      expect(modulesInfo.hasBuffer).toBe(true)
      
      // Verify test environment markers
      expect(modulesInfo.isElectronTest).toBe(true)
      expect(modulesInfo.isPlaywrightTest).toBe(true)
      
      // Verify WebSocket module structure
      expect(modulesInfo.webSocketHasServer).toBe(true)
      
      console.log('Node.js modules available in browser:', modulesInfo)
      
    } finally {
      await teardownElectronTest({ app, window })
    }
  })
  
  test('can use browser APIs (setTimeout, Promise, etc)', async () => {
    const { app, window } = await setupElectronTest()
    
    try {
      const result = await window.evaluate(async () => {
        // Use setTimeout (browser API)
        const timeoutResult = await new Promise<string>((resolve) => {
          setTimeout(() => resolve('timeout-worked'), 10)
        })
        
        // Use setInterval (browser API)
        let counter = 0
        const intervalResult = await new Promise<number>((resolve) => {
          const interval = setInterval(() => {
            counter++
            if (counter >= 3) {
              clearInterval(interval)
              resolve(counter)
            }
          }, 5)
        })
        
        // Check other browser APIs
        const apis = {
          hasSetTimeout: typeof setTimeout !== 'undefined',
          hasSetInterval: typeof setInterval !== 'undefined',
          hasRequestAnimationFrame: typeof requestAnimationFrame !== 'undefined',
          hasConsole: typeof console !== 'undefined',
          hasAlert: typeof alert !== 'undefined',
          hasPromise: typeof Promise !== 'undefined',
          hasJSON: typeof JSON !== 'undefined',
        }
        
        return {
          timeoutWorked: timeoutResult === 'timeout-worked',
          intervalCount: intervalResult,
          ...apis
        }
      })
      
      expect(result.timeoutWorked).toBe(true)
      expect(result.intervalCount).toBe(3)
      expect(result.hasSetTimeout).toBe(true)
      expect(result.hasSetInterval).toBe(true)
      expect(result.hasRequestAnimationFrame).toBe(true)
      expect(result.hasConsole).toBe(true)
      expect(result.hasPromise).toBe(true)
      expect(result.hasJSON).toBe(true)
      
    } finally {
      await teardownElectronTest({ app, window })
    }
  })
})

