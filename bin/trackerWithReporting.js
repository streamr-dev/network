#!/usr/bin/env node

const StreamrClient = require('streamr-client')
const Sentry = require('@sentry/node')

const { startTracker } = require('../src/composition')

const port = process.argv[2] || 30300
const ip = process.argv[3] || '127.0.0.1'
const maxNeighborsPerNode = process.argv[4] || 4
const apiKey = process.argv[5] || 'EmqyPJBAR-26T60BbxLazQhN8GKqhOQQe2rbEqRwECCQ'
const streamId = process.argv[6] || 'cueeTiqTQUmHjZJhv4rOhA'
const id = `tracker-${port}`

Sentry.init({
    dsn: 'https://0fcf3b8f6b254caa9a7fadd77bcc37a4@sentry.io/1510389',
    integrations: [
        new Sentry.Integrations.Console({
            levels: ['error']
        })
    ],
    environment: 'tracker'
})

startTracker(ip, port, id, maxNeighborsPerNode)
    .then((tracker) => {
        if (apiKey && streamId) {
            const client = new StreamrClient({
                auth: {
                    apiKey
                }
            })

            setInterval(async () => {
                client.publish(streamId, await tracker.getMetrics())
            }, 5000)
        }
    })
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })

if (process.env.checkUncaughtException === 'true') {
    process.on('uncaughtException', (err) => console.error((err && err.stack) ? err.stack : err))
}

