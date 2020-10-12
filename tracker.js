#!/usr/bin/env node
const { spawn } = require('child_process')
const path = require('path')

const program = require('commander')

const { authenticateFromConfig } = require('./src/helpers/ethereumAuthenticate')

program
    .usage('<ethereumPrivateKey> <trackerName>')
    .option('--port <port>', 'port', 30300)
    .option('--ip <ip>', 'ip', '0.0.0.0')
    .option('--maxNeighborsPerNode <maxNeighborsPerNode>', 'maxNeighborsPerNode', 4)
    .option('--apiKey <apiKey>', 'apiKey for StreamrClient', undefined)
    .option('--streamId <streamId>', 'streamId for StreamrClient', undefined)
    .option('--sentryDns <sentryDns>', 'sentryDns', undefined)
    .option('--metrics <metrics>', 'output metrics to console', false)
    .option('--metricsInterval <metricsInterval>', 'metrics output interval (ms)', 5000)
    .option('--endpointServerPort <endpointServerPort>', 'port for endpoint server', undefined)
    .parse(process.argv)

if (program.args.length < 2) {
    program.help()
}
const privateKey = program.args[0]
const trackerName = program.args[1]

const address = authenticateFromConfig({
    privateKey
})

process.argv.splice(2, 2)
const argv = process.argv.concat(['--trackerName', trackerName, '--id', address, '--exposeHttpEndpoints'])
spawn(path.resolve(__dirname, './node_modules/streamr-network/bin/tracker.js'), argv, {
    cwd: process.cwd(),
    detached: false,
    stdio: 'inherit'
})
