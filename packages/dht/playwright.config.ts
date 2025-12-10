import { defineConfig } from '@playwright/test'

/**
 * Playwright configuration for Electron tests
 * 
 * Note: This runs tests in test/playwright/ directory only.
 * Original Karma tests remain in test/unit, test/integration, test/end-to-end
 * and continue to use Karma + Jasmine + Webpack.
 * 
 * Gradually migrate tests from Karma to Playwright over time.
 */
export default defineConfig({
  // Test directory - ONLY playwright tests, not original Karma tests
  testDir: './test/playwright',
  
  // Test match patterns
  testMatch: '**/*.test.ts',
  
  // Timeout per test
  timeout: 15000,
  
  // Run tests serially for Electron stability
  fullyParallel: false,
  workers: 1,
  
  // Fail the build on CI if you accidentally left test.only
  forbidOnly: !!process.env.CI,
  
  // Retry on CI
  retries: process.env.CI ? 2 : 0,
  
  // Reporter
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report' }]
  ],
  
  // Shared settings for all projects
  use: {
    // Collect trace on failure
    trace: 'on-first-retry',
    
    // Screenshot on failure
    screenshot: 'only-on-failure',
  },

  // Configure projects for Electron
  projects: [
    {
      name: 'electron',
      testMatch: '**/*.test.ts',
    },
  ],
})
