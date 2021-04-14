const StreamrClient = require('streamr-client')
const mqtt = require('async-mqtt')
const fetch = require('node-fetch')

const createBroker = require('../src/broker')

const DEFAULT_CLIENT_OPTIONS = {
    auth: {
        apiKey: 'tester1-api-key'
    }
}

const STREAMR_DOCKER_DEV_HOST = process.env.STREAMR_DOCKER_DEV_HOST || '127.0.0.1'
const API_URL = `http://${STREAMR_DOCKER_DEV_HOST}/api/v1`

function formConfig({
    name,
    networkPort,
    trackerPort,
    privateKey,
    httpPort = null,
    wsPort = null,
    mqttPort = null,
    enableCassandra = false,
    privateKeyFileName = null,
    certFileName = null,
    streamrAddress = '0xFCAd0B19bB29D4674531d6f115237E16AfCE377c',
    streamrUrl = `http://${STREAMR_DOCKER_DEV_HOST}:8081/streamr-core`,
    reporting = false
}) {
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
        ethereumPrivateKey: privateKey,
        network: {
            name,
            hostname: '127.0.0.1',
            port: networkPort,
            advertisedWsUrl: null,
            isStorageNode: enableCassandra,
            trackers: [
                `ws://127.0.0.1:${trackerPort}`
            ],
            location: {
                latitude: 60.19,
                longitude: 24.95,
                country: 'Finland',
                city: 'Helsinki'
            }
        },
        cassandra: enableCassandra ? {
            hosts: [STREAMR_DOCKER_DEV_HOST],
            datacenter: 'datacenter1',
            username: '',
            password: '',
            keyspace: 'streamr_dev_v2',
        } : null,
        storageConfig: null,
        reporting: reporting || {
            sentry: null,
            streamr: null,
            intervalInSeconds: 0,
            perNodeMetrics: {
                enabled: false,
                wsUrl: null,
                httpUrl: null
            }
        },
        streamrUrl,
        streamrAddress,
        adapters
    }
}

function startBroker(...args) {
    return createBroker(formConfig(...args))
}

function getWsUrl(port, ssl = false) {
    return `${ssl ? 'wss' : 'ws'}://127.0.0.1:${port}/api/v1/ws`
}

function getWsUrlWithControlAndMessageLayerVersions(port, ssl = false, controlLayerVersion = 2, messageLayerVersion = 32) {
    return `${ssl ? 'wss' : 'ws'}://127.0.0.1:${port}/api/v1/ws?controlLayerVersion=${controlLayerVersion}&messageLayerVersion=${messageLayerVersion}`
}

function createClient(wsPort, clientOptions = DEFAULT_CLIENT_OPTIONS) {
    return new StreamrClient({
        url: getWsUrl(wsPort),
        restUrl: `http://${STREAMR_DOCKER_DEV_HOST}:8081/streamr-core/api/v1`,
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

const addStreamToStorageNode = async (streamId, storageNodeAddress, client) => {
    await fetch(`${API_URL}/streams/${encodeURIComponent(streamId)}/storageNodes`, {
        body: JSON.stringify({
            address: storageNodeAddress
        }),
        headers: {
            // eslint-disable-next-line quote-props
            'Authorization': 'Bearer ' + await client.session.getSessionToken(),
            'Content-Type': 'application/json',
        },
        method: 'POST'
    })
}

module.exports = {
    STREAMR_DOCKER_DEV_HOST,
    formConfig,
    startBroker,
    createClient,
    createMqttClient,
    getWsUrl,
    addStreamToStorageNode,
    getWsUrlWithControlAndMessageLayerVersions
}
