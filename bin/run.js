#!/usr/bin/env node

const { spawn } = require('child_process')
const path = require('path')

const numberOfNodes = process.argv[2] || 10
const startingPort = 30400
const trackerPort = 27777
const trackerEndpointServerPort = 11111
const startingDebugPort = 9200
const streams = ['stream1', 'stream2', 'stream3', 'stream4', 'stream5']
let debug = false

const productionEnv = Object.create(process.env)
productionEnv.DEBUG = 'streamr:*,-streamr:connection:*'
productionEnv.checkUncaughtException = true

// create tracker
const tracker = path.resolve('./bin/tracker.js')
let args = [tracker, '--port=' + trackerPort, '--endpointServerPort=' + trackerEndpointServerPort]

if (process.env.NODE_DEBUG_OPTION !== undefined) {
    debug = true
    args.unshift('--inspect-brk=' + (startingDebugPort - 1))
}

spawn('node', args, {
    env: productionEnv,
    stdio: [process.stdin, process.stdout, process.stderr]
})

for (let i = 0; i < numberOfNodes; i++) {
    args = [
        path.resolve('./bin/subscriber.js'),
        '--streamId=' + streams[Math.floor(Math.random() * streams.length)],
        '--port=' + (startingPort + i),
        `--trackers=ws://127.0.0.1:${trackerPort}`
    ]

    if (debug) {
        args.unshift('--inspect-brk=' + (startingDebugPort + i))
    }

    spawn('node', args, {
        env: productionEnv,
        stdio: [process.stdin, process.stdout, process.stderr]
    })
}
