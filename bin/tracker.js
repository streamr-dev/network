#!/usr/bin/env node

const util = require('util')

const program = require('commander')
const StreamrClient = require('streamr-client')
const Sentry = require('@sentry/node')
const fastify = require('fastify')({
    ignoreTrailingSlash: true
})
const cors = require('fastify-cors')

const CURRENT_VERSION = require('../package.json').version
const { startTracker } = require('../src/composition')
const Tracker = require('../src/logic/Tracker')

program
    .version(CURRENT_VERSION)
    .option('--port <port>', 'port', 30300)
    .option('--ip <ip>', 'ip', '0.0.0.0')
    .option('--maxNeighborsPerNode <maxNeighborsPerNode>', 'maxNeighborsPerNode', 4)
    .option('--apiKey <apiKey>', 'apiKey for StreamrClient', undefined)
    .option('--streamId <streamId>', 'streamId for StreamrClient', undefined)
    .option('--sentryDns <sentryDns>', 'sentryDns', undefined)
    .option('--metrics <metrics>', 'output metrics to console', false)
    .option('--metricsInterval <metricsInterval>', 'metrics output interval (ms)', 5000)
    .option('--endpointServerPort <endpointServerPort>', 'port for endpoint server', undefined)
    .description('Run tracker with reporting')
    .parse(process.argv)

const id = `tracker-${program.port}`

if (program.sentryDns) {
    console.log('Configuring Sentry with dns: %s', program.sentryDns)
    Sentry.init({
        dsn: program.sentryDns,
        integrations: [
            new Sentry.Integrations.Console({
                levels: ['error']
            })
        ],
        environment: id
    })

    Sentry.configureScope((scope) => {
        scope.setUser({
            id
        })
    })
}

let client

if (program.apiKey && program.streamId) {
    const { apiKey } = program
    client = new StreamrClient({
        auth: {
            apiKey
        },
        autoConnect: false
    })
}

function startServer(tracker, endpointServerPort) {
    if (!(tracker instanceof Tracker)) {
        throw new Error('tracker not instance of Tracker')
    }

    if (Number.isNaN(endpointServerPort) || endpointServerPort < 0) {
        throw Error('endpointServerPort must be a positive integer')
    }

    fastify.register(cors)

    // Declare a route
    fastify.get('/topology/', async (request, reply) => {
        reply.send(tracker.getTopology())
    })

    fastify.get('/topology/:streamId/', async (request, reply) => {
        if (request.params.streamId === '') {
            throw Error('streamId must be a not empty string')
        }
        reply.send(tracker.getTopology(request.params.streamId, null))
    })

    fastify.get('/topology/:streamId/:partition/', async (request, reply) => {
        if (request.params.streamId === '') {
            throw Error('streamId must be a not empty string')
        }

        const askedPartition = parseInt(request.params.partition, 10)
        if (Number.isNaN(askedPartition) || askedPartition < 0) {
            throw Error('partition must be a positive integer')
        }
        reply.send(tracker.getTopology(request.params.streamId, request.params.partition))
    })

    //
    fastify.listen(endpointServerPort, '0.0.0.0', (err, address) => {
        if (err) {
            throw err
        }
        console.info(`tracker is listening on ${address}`)
    })
}

startTracker(program.ip, parseInt(program.port, 10), id, parseInt(program.maxNeighborsPerNode, 10))
    .then((tracker) => {
        console.info('started tracker id: %s, port: %d, ip: %s, maxNeighborsPerNode: %d, '
            + 'metrics: %s, metricsInterval: %d, apiKey: %s, streamId: %s, sentryDns: %s',
        id, program.port, program.ip, program.maxNeighborsPerNode, program.metrics,
        program.metricsInterval, program.apiKey, program.streamId, program.sentryDns)

        if (client || program.metrics) {
            setInterval(async () => {
                const metrics = await tracker.getMetrics()

                // send metrics to streamr.network
                if (client) {
                    client.publishHttp(program.streamId, metrics)
                }

                // output to console
                if (program.metrics) {
                    console.log(util.inspect(metrics, false, null))
                }
            }, program.metricsInterval)
        }

        if (program.endpointServerPort) {
            startServer(tracker, program.endpointServerPort)
        }
    })
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })

if (process.env.checkUncaughtException === 'true') {
    process.on('uncaughtException', (err) => console.error((err && err.stack) ? err.stack : err))
}

