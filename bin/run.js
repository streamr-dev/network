#!/usr/bin/env node

const { spawn } = require('child_process')
const path = require('path')

const numberOfNodes = process.argv[2] || 10
const startingPort = 30400
const startingDebugPort = 9200
let debug = false

const productionEnv = Object.create(process.env)
productionEnv.DEBUG = 'streamr:*,-streamr:connection:*'
productionEnv.checkUncaughtException = true

// create tracker
const tracker = path.resolve('./bin/tracker.js')
let args = [tracker]

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
        '--port=' + (startingPort + i)
    ]

    if (debug) {
        args.unshift('--inspect-brk=' + (startingDebugPort + i))
    }

    spawn('node', args, {
        env: productionEnv,
        stdio: [process.stdin, process.stdout, process.stderr]
    })
}
