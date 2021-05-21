import crypto from 'crypto'
import StreamrClient, { Stream, StreamrClientOptions } from 'streamr-client'
import mqtt from 'async-mqtt'
import fetch from 'node-fetch'
import { Wallet } from 'ethers'
import { waitForCondition } from 'streamr-test-utils'
import { startBroker as createBroker } from '../src/broker'
import { StorageConfig } from '../src/storage/StorageConfig'
import { Todo } from './types'
import { Config } from './config'

export const STREAMR_DOCKER_DEV_HOST = process.env.STREAMR_DOCKER_DEV_HOST || '127.0.0.1'
const API_URL = `http://${STREAMR_DOCKER_DEV_HOST}/api/v1`

export function formConfig({
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
    streamrUrl = `http://${STREAMR_DOCKER_DEV_HOST}`,
    storageNodeRegistry = (!enableCassandra ? [] : null),
    reporting = false
}: Todo): Config {
    const plugins = []
    if (httpPort) {
        plugins.push({
            name: 'http',
            port: httpPort,
        })
    }
    if (wsPort) {
        plugins.push({
            name: 'ws',
            port: wsPort,
            pingInterval: 3000,
            privateKeyFileName,
            certFileName
        })
    }
    if (mqttPort) {
        plugins.push({
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
        storageConfig: enableCassandra ? {
            refreshInterval: 0
        } : null,
        reporting: reporting || {
            streamr: null,
            intervalInSeconds: 0,
            perNodeMetrics: {
                enabled: false,
                wsUrl: null,
                httpUrl: null,
                storageNode: null,
                intervals:{
                    sec: 0,
                    min: 0,
                    hour: 0,
                    day: 0
                }
            }
        },
        streamrUrl,
        streamrAddress,
        storageNodeRegistry,
        plugins
    }
}

export function startBroker(...args: Todo[]) {
    // @ts-expect-error
    return createBroker(formConfig(...args))
}

export function getWsUrl(port: number, ssl = false) {
    return `${ssl ? 'wss' : 'ws'}://127.0.0.1:${port}/api/v1/ws`
}

export function getWsUrlWithControlAndMessageLayerVersions(port: number, ssl = false, controlLayerVersion = 2, messageLayerVersion = 32) {
    return `${ssl ? 'wss' : 'ws'}://127.0.0.1:${port}/api/v1/ws?controlLayerVersion=${controlLayerVersion}&messageLayerVersion=${messageLayerVersion}`
}

// generates a private key
// equivalent to Wallet.createRandom().privateKey but much faster
// the slow part seems to be deriving the address from the key so if you can avoid this, just use
// fastPrivateKey instead of createMockUser
export function fastPrivateKey() {
    return `0x${crypto.randomBytes(32).toString('hex')}`
}

export const createMockUser = () => Wallet.createRandom()

export function createClient(wsPort: number, privateKey = fastPrivateKey(), clientOptions?: StreamrClientOptions) {
    return new StreamrClient({
        auth: {
            privateKey
        },
        url: getWsUrl(wsPort),
        restUrl: `http://${STREAMR_DOCKER_DEV_HOST}/api/v1`,
        ...clientOptions,
    })
}

export function createMqttClient(mqttPort = 9000, host = 'localhost', privateKey = fastPrivateKey()) {
    return mqtt.connect({
        hostname: host,
        port: mqttPort,
        username: '',
        password: privateKey
    })
}

export class StorageAssignmentEventManager {

    engineAndEditorAccount: Wallet
    client: StreamrClient
    eventStream?: Stream

    constructor(wsPort: number, engineAndEditorAccount: Wallet) {
        this.engineAndEditorAccount = engineAndEditorAccount
        this.client = createClient(wsPort, engineAndEditorAccount.privateKey)
    }

    async createStream() {
        this.eventStream = await this.client.createStream({
            id: this.engineAndEditorAccount.address + StorageConfig.ASSIGNMENT_EVENT_STREAM_ID_SUFFIX
        })
    }

    async addStreamToStorageNode(streamId: string, storageNodeAddress: string, client: StreamrClient) {
        await fetch(`${API_URL}/streams/${encodeURIComponent(streamId)}/storageNodes`, {
            body: JSON.stringify({
                address: storageNodeAddress
            }),
            headers: {
                // @ts-expect-error
                // eslint-disable-next-line quote-props
                'Authorization': 'Bearer ' + await client.session.getSessionToken(),
                'Content-Type': 'application/json',
            },
            method: 'POST'
        })
        this.publishAddEvent(streamId)
    }

    publishAddEvent(streamId: string) {
        this.eventStream!.publish({
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

export const waitForStreamPersistedInStorageNode = async (streamId: string, partition: number, nodeHost: string, nodeHttpPort: number) => {
    const isPersistent = async () => {
        const response = await fetch(`http://${nodeHost}:${nodeHttpPort}/api/v1/streams/${encodeURIComponent(streamId)}/storage/partitions/${partition}`)
        return (response.status === 200)
    }
    await waitForCondition(() => isPersistent(), undefined, 1000)
}
