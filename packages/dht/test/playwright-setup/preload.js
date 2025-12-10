/**
 * Preload script for Playwright Electron tests
 * Injects Node.js modules into browser context (like Karma preload.js)
 */

console.log('Preload script executing...')

process.once('loaded', () => {
    console.log('Preload: process loaded event fired')
    
    // Inject Node.js modules into browser window (same as Karma preload.js)
    const ws = require('ws')
    window.WebSocket = ws
    window.Express = require('express')
    window.HTTP = require('http')
    window.HTTPS = require('https')
    window.Buffer = require('buffer/').Buffer
    
    // Mark as Electron test environment
    window._streamr_electron_test = true
    window._playwright_electron_test = true
    
    console.log('Preload: Node.js modules injected successfully')
    console.log('Preload: window.WebSocket available?', typeof window.WebSocket !== 'undefined')
    console.log('Preload: window.HTTP available?', typeof window.HTTP !== 'undefined')
})

