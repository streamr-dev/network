const StreamrClient = require('streamr-client')
const mqtt = require('async-mqtt')

const createBroker = require('../src/broker')

function startBroker(id, httpPort, wsPort, networkPort, trackerPort, mqttPort, enableCassandra, privateKeyFileName, certFileName) {
    const adapters = []

    if (httpPort) {
        adapters.push({
            name: 'http',
            port: httpPort,
        })
    }

    if (wsPort) {
        adapters.push({
            name: 'ws',
            port: wsPort,
            privateKeyFileName,
            certFileName
        })
    }

    if (mqttPort) {
        adapters.push({
            name: 'mqtt',
            port: mqttPort,
            streamsTimeout: 300000
        })
    }

    return createBroker({
        network: {
            id,
            hostname: '127.0.0.1',
            port: networkPort,
            advertisedWsUrl: null,
            tracker: `ws://127.0.0.1:${trackerPort}`,
            isStorageNode: false
        },
        cassandra: enableCassandra ? {
            hosts: ['localhost'],
            username: '',
            password: '',
            keyspace: 'streamr_dev',
        } : false,
        reporting: false,
        sentry: false,
        streamrUrl: 'http://localhost:8081/streamr-core',
        adapters
    })
}

function createClient(wsPort, apiKey, orderMessages = true) {
    return new StreamrClient({
        url: `ws://localhost:${wsPort}/api/v1/ws`,
        restUrl: 'http://localhost:8081/streamr-core/api/v1',
        auth: {
            apiKey
        },
        orderMessages
    })
}

function createMqttClient(mqttPort = 9000, host = 'localhost', apiKey = 'tester1-api-key') {
    return mqtt.connect({
        hostname: host,
        port: mqttPort,
        username: '',
        password: apiKey
    })
}

module.exports = {
    startBroker,
    createClient,
    createMqttClient
}
