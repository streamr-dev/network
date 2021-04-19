const StreamrClient = require('streamr-client')
const mqtt = require('async-mqtt')
const fetch = require('node-fetch')
const ethers = require('ethers')
const { waitForCondition } = require('streamr-test-utils')

const createBroker = require('../src/broker')
const StorageConfig = require('../src/storage/StorageConfig')

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

const createMockUser = () => ethers.Wallet.createRandom()

function createClient(wsPort, privateKey = createMockUser().privateKey, clientOptions) {
    return new StreamrClient({
        auth: {
            privateKey
        },
        url: getWsUrl(wsPort),
        restUrl: `http://${STREAMR_DOCKER_DEV_HOST}:8081/streamr-core/api/v1`,
        ...clientOptions,
    })
}

function createMqttClient(mqttPort = 9000, host = 'localhost', privateKey = createMockUser().privateKey) {
    return mqtt.connect({
        hostname: host,
        port: mqttPort,
        username: '',
        password: privateKey
    })
}

class StorageAssignmentEventManager {
    constructor(wsPort, engineAndEditorAccount) {
        this.engineAndEditorAccount = engineAndEditorAccount
        this.client = createClient(wsPort, engineAndEditorAccount.privateKey)
    }

    async createStream() {
        this.eventStream = await this.client.createStream({
            id: this.engineAndEditorAccount.address + StorageConfig.ASSIGNMENT_EVENT_STREAM_ID_SUFFIX
        })
    }

    async addStreamToStorageNode(streamId, storageNodeAddress, client) {
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
        this.publishAddEvent(streamId)
    }

    publishAddEvent(streamId) {
        this.eventStream.publish({
            event: 'STREAM_ADDED',
            stream: {
                id: streamId,
                partitions: 1
            }
        })
    }

    close() {
        return this.client.ensureDisconnected()
    }
}

const waitForStreamPersistedInStorageNode = async (streamId, partition, nodeHost, nodeHttpPort) => {
    const isPersistent = async () => {
        const response = await fetch(`http://${nodeHost}:${nodeHttpPort}/api/v1/streams/${encodeURIComponent(streamId)}/storage/partitions/${partition}`)
        return (response.status === 200)
    }
    await waitForCondition(() => isPersistent(), undefined, 1000)
}

module.exports = {
    STREAMR_DOCKER_DEV_HOST,
    formConfig,
    startBroker,
    createMockUser,
    createClient,
    createMqttClient,
    getWsUrl,
    StorageAssignmentEventManager,
    waitForStreamPersistedInStorageNode,
    getWsUrlWithControlAndMessageLayerVersions
}
