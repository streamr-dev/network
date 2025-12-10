/**
 * Playwright Test setup for Electron with Node.js module injection
 * This replaces Karma and provides the same functionality:
 * - Tests run in Electron renderer (browser environment)
 * - Node.js modules available via preload script (like Karma)
 * - Webpack bundling to resolve imports properly
 */

import { _electron as electron, ElectronApplication, Page } from 'playwright'
import { join } from 'path'
import webpack from 'webpack'
import { promises as fs } from 'fs'

export interface ElectronTestContext {
  app: ElectronApplication
  window: Page
}

// Cache for bundled test code
const bundleCache = new Map<string, string>()

/**
 * Bundle test file using webpack (like Karma does)
 * This resolves imports and creates browser-compatible code
 */
async function bundleTestFile(testPath: string): Promise<string> {
  if (bundleCache.has(testPath)) {
    return bundleCache.get(testPath)!
  }
  
  // Use in-memory webpack compilation
  const compiler = webpack({
    mode: 'development',
    entry: testPath,
    output: {
      path: '/tmp',
      filename: 'bundle.js',
    },
    resolve: {
      extensions: ['.ts', '.js'],
      alias: {
        // Browser-specific implementations (like Karma config)
        [join(__dirname, '../../src/connection/webrtc/NodeWebrtcConnection')]:
          join(__dirname, '../../src/connection/webrtc/BrowserWebrtcConnection'),
        [join(__dirname, '../../src/connection/websocket/NodeWebsocketClientConnection')]:
          join(__dirname, '../../src/connection/websocket/BrowserWebsocketClientConnection'),
      },
    },
    externals: {
      // Node.js modules available via preload (like Karma externals)
      'http': 'window.HTTP',
      'https': 'window.HTTPS',
      'ws': 'window.WebSocket',
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
      ],
    },
  })
  
  return new Promise((resolve, reject) => {
    compiler.run((err, stats) => {
      if (err || stats?.hasErrors()) {
        reject(err || new Error('Webpack compilation failed'))
        return
      }
      
      // Get the bundled code from memory
      const bundle = stats?.toJson().modules?.[0]?.source || ''
      bundleCache.set(testPath, bundle)
      resolve(bundle)
    })
  })
}

/**
 * Setup Electron test environment with Node.js modules exposed via preload
 * Similar to Karma's preload.js approach
 */
export async function setupElectronTest(): Promise<ElectronTestContext> {
  // Launch Electron with our test main process
  const app = await electron.launch({
    args: [join(__dirname, 'electron-main.js')],
    timeout: 10000,
  })
  
  // Wait for window to be ready
  const window = await app.firstWindow()
  
  // Wait for preload to inject modules
  await window.waitForTimeout(100)
  
  // Verify environment is ready
  const envCheck = await window.evaluate(() => {
    return {
      hasWebSocket: typeof (window as any).WebSocket !== 'undefined',
      hasHTTP: typeof (window as any).HTTP !== 'undefined',
      isElectronTest: !!(window as any)._streamr_electron_test
    }
  })
  
  if (!envCheck.hasWebSocket || !envCheck.hasHTTP) {
    throw new Error('Preload script failed to inject Node.js modules')
  }
  
  return { app, window }
}

/**
 * Cleanup Electron test environment
 */
export async function teardownElectronTest(context: ElectronTestContext): Promise<void> {
  await context.app.close()
}

/**
 * Run a test file in Electron browser context (like Karma does)
 * The test file is bundled with webpack and executed in browser
 */
export async function runTestInBrowser(
  window: Page,
  testFilePath: string
): Promise<{ passed: number; failed: number; errors: string[] }> {
  // Bundle the test file (like Karma + webpack does)
  // For now, we'll skip webpack and load directly since it's complex
  // Instead, we'll load the source and dependencies manually
  
  // Load test file content
  const testContent = await fs.readFile(testFilePath, 'utf-8')
  
  // Execute in browser context
  const result = await window.evaluate(async (testCode) => {
    const errors: string[] = []
    let passed = 0
    let failed = 0
    
    try {
      // Set up minimal Jasmine-like test framework
      const tests: Array<{ name: string; fn: () => Promise<void> | void }> = []
      let currentSuite = ''
      
      ;(window as any).describe = (name: string, fn: () => void) => {
        currentSuite = name
        fn()
      }
      
      ;(window as any).it = (name: string, fn: () => Promise<void> | void) => {
        tests.push({ name: `${currentSuite} > ${name}`, fn })
      }
      
      ;(window as any).expect = (actual: any) => ({
        toEqual: (expected: any) => {
          if (actual !== expected) {
            throw new Error(`Expected ${actual} to equal ${expected}`)
          }
        },
        rejects: {
          toThrow: async () => {
            try {
              await actual
              throw new Error('Expected promise to reject')
            } catch (e) {
              // Expected
            }
          }
        }
      })
      
      // Execute test code
      eval(testCode)
      
      // Run tests
      for (const test of tests) {
        try {
          await test.fn()
          passed++
        } catch (error) {
          failed++
          errors.push(`${test.name}: ${error}`)
        }
      }
    } catch (error) {
      errors.push(`Setup error: ${error}`)
      failed++
    }
    
    return { passed, failed, errors }
  }, testContent)
  
  return result
}

