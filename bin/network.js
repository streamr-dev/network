#!/usr/bin/env node
const { spawn } = require('child_process')
const path = require('path')

const program = require('commander')

const { version: CURRENT_VERSION } = require('../package.json')

program
    .version(CURRENT_VERSION)
    .option('--nodes <nodes>', 'number of nodes', '10')
    .option('--streams <streams>', 'number of streams', '1')
    .description('Run local network with stream (-s)')
    .parse(process.argv)

const { nodes: numberOfNodes } = program.opts()
const startingPort = 30000
const trackerPort = 27777
const startingDebugPort = 9200
const streams = []

for (let i = 0; i < parseInt(program.opts().streams, 10); i++) {
    streams.push(`stream-${i}`)
}

let debug = false

const productionEnv = Object.create(process.env)
productionEnv.LOG_LEVEL = productionEnv.LOG_LEVEL || 'debug'

// create tracker
const tracker = path.resolve('./bin/tracker.js')
let args = [tracker, '--port=' + trackerPort]

if (process.env.NODE_DEBUG_OPTION !== undefined) {
    debug = true
    args.unshift('--inspect-brk=' + (startingDebugPort - 1))
}

spawn('node', args, {
    env: productionEnv,
    stdio: [process.stdin, process.stdout, process.stderr]
})

setTimeout(() => {
    for (let i = 0; i < parseInt(numberOfNodes, 10); i++) {
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
}, 1000)
