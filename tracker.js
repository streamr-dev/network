#!/usr/bin/env node
const path = require('path')
const { spawn } = require('child_process')

const tracker = path.resolve('./node_modules/streamr-network/bin/tracker.js')
const productionEnv = Object.create(process.env)

spawn('node', [tracker], {
    env: productionEnv,
    stdio: [process.stdin, process.stdout, process.stderr]
})
