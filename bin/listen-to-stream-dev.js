#!/usr/bin/env node

const listen = require('../src/listen')

if (process.argv.length < 3 || process.argv.length > 4) {
    console.error('Usage: listen-to-stream-dev stream [apiKey]')
    process.exit(1)
}

const [,, stream, apiKey] = process.argv

listen(stream, apiKey, 'ws://localhost:8890/api/v1/ws', 'http://localhost:8081/streamr-core/api/v1')
