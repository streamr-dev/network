#!/usr/bin/env node

const publishStream = require('../src/publish')

if (process.argv.length < 3 || process.argv.length > 4) {
    console.error('Usage: listen-to-stream-dev stream [apiKey]')
    process.exit(1)
}

const [,, stream, apiKey] = process.argv

const ps = publishStream(stream, apiKey, 'ws://localhost:8890/api/v1/ws', 'http://localhost:8081/streamr-core/api/v1')
process.stdin
    .pipe(ps)
    .on('error', (err) => {
        console.error(err)
        process.exit(1)
        // process.stdin.pipe(ps) recover pipe to continue execution
    })
