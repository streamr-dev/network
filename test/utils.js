const StreamrClient = require('streamr-client')
const mqtt = require('async-mqtt')

const createBroker = require('../src/broker')

const DEFAULT_CLIENT_OPTIONS = {
    auth: {
        apiKey: 'tester1-api-key'
    }
}

function formConfig(name, networkPort, trackerPort, httpPort, wsPort, mqttPort, enableCassandra, privateKeyFileName, certFileName,
    generateWallet = true, ethereumPrivateKey) {
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
            pingInterval: 3000,
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

    return {
        network: {
            name,
            hostname: '127.0.0.1',
            port: networkPort,
            advertisedWsUrl: null,
            trackers: [
                `ws://127.0.0.1:${trackerPort}`
            ],
            isStorageNode: true
        },
        ethereum: {
            privateKey: ethereumPrivateKey,
            generateWallet
        },
        location: {
            latitude: 60.19,
            longitude: 24.95,
            country: 'Finland',
            city: 'Helsinki'
        },
        cassandra: enableCassandra ? {
            hosts: ['localhost'],
            datacenter: 'datacenter1',
            username: '',
            password: '',
            keyspace: 'streamr_dev_v2',
        } : false,
        reporting: false,
        sentry: false,
        streamrUrl: 'http://localhost:8081/streamr-core',
        adapters
    }
}

function startBroker(...args) {
    return createBroker(formConfig(...args))
}

function getWsUrl(port, ssl = false, controlLayerVersion = 1, messageLayerVersion = 31) {
    return `${ssl ? 'wss' : 'ws'}://127.0.0.1:${port}/api/v1/ws?controlLayerVersion=${controlLayerVersion}&messageLayerVersion=${messageLayerVersion}`
}

function createClient(wsPort, clientOptions = DEFAULT_CLIENT_OPTIONS) {
    return new StreamrClient({
        url: getWsUrl(wsPort),
        restUrl: 'http://localhost:8081/streamr-core/api/v1',
        ...clientOptions,
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
    formConfig,
    startBroker,
    createClient,
    createMqttClient,
    getWsUrl,
}
