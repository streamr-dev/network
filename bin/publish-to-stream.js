#!/usr/bin/env node
const es = require('event-stream')
const publishStream = require('../src/publish')

if (process.argv.length < 3 || process.argv.length > 6) {
    console.error('Usage: publish-to-stream stream [apiKey] [alternativeWsUrl] [alternativeHttpUrl]')
    process.exit(1)
}

const [,, stream, apiKey, alternativeWsUrl, alternativeHttpUrl] = process.argv

if (alternativeWsUrl && !alternativeHttpUrl) {
    console.error("alternativeWsUrl and alternativeHttpUrl must be used together")
    process.exit(1)
}

const ps = publishStream(stream, apiKey, alternativeWsUrl, alternativeHttpUrl)
process.stdin
    .pipe(es.split())
    .pipe(ps)
    .on('error', (err) => {
        console.error(err)
        process.exit(1)
        // process.stdin.pipe(ps) recover pipe to continue execution
    })

