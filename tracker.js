#!/usr/bin/env node
const { spawn } = require('child_process')
const path = require('path')

spawn(path.resolve('./node_modules/streamr-network/bin/trackerWithReporting.js'), process.argv, {
    cwd: process.cwd(),
    detached: false,
    stdio: 'inherit'
})
