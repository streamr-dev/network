#!/usr/bin/env node
const { spawn } = require('child_process')
const path = require('path')

spawn(path.resolve(__dirname, './node_modules/streamr-network/bin/trackerWithReporting.js'), process.argv, {
    cwd: process.cwd(),
    detached: false,
    stdio: 'inherit'
})
