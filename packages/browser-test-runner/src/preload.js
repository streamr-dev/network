// Loads non-browser compatible components to Electron's NodeJS sandbox during tests

process.once('loaded', () => {
    // eslint-disable-next-line import/no-extraneous-dependencies
    window.WebSocket = require('ws')
    // eslint-disable-next-line import/no-extraneous-dependencies
    window.Express = require('express')
    window.HTTP = require('http')
    window.HTTPS = require('https')
    window.Buffer = require('buffer/').Buffer
    window.process = require('process')
    // maybe we can set this karma-setup
    // eslint-disable-next-line no-underscore-dangle
    window._streamr_electron_test = true
})
