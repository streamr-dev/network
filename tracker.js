#!/usr/bin/env node
const { spawn } = require('child_process')

spawn('./node_modules/streamr-network/bin/trackerWithReporting.js', process.argv, {
    cwd: process.cwd(),
    detached: false,
    stdio: 'inherit'
})
