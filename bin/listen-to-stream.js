#!/usr/bin/env node

const listen = require('../src/listen')

if (process.argv.length < 3 || process.argv.length > 6) {
    console.error('Usage: listen-to-stream stream [apiKey] [alternativeWsUrl] [alternativeHttpUrl]')
    process.exit(1)
}

const [,, stream, apiKey, alternativeWsUrl, alternativeHttpUrl] = process.argv

if (alternativeWsUrl && !alternativeHttpUrl) {
    console.error("alternativeWsUrl and alternativeHttpUrl must be used together")
    process.exit(1)
}

listen(stream, apiKey, alternativeWsUrl, alternativeHttpUrl)