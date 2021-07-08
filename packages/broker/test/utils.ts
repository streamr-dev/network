import crypto from 'crypto'
import StreamrClient, { Stream, StreamProperties, StreamrClientOptions } from 'streamr-client'
import mqtt from 'async-mqtt'
import fetch from 'node-fetch'
import { Wallet } from 'ethers'
import { waitForCondition } from 'streamr-test-utils'
import { startBroker as createBroker } from '../src/broker'
import { StorageConfig } from '../src/plugins/storage/StorageConfig'
import { Todo } from '../src/types'
import { Config } from '../src/config'

export const STREAMR_DOCKER_DEV_HOST = process.env.STREAMR_DOCKER_DEV_HOST || '127.0.0.1'
const API_URL = `http://${STREAMR_DOCKER_DEV_HOST}/api/v1`

export function formConfig({
    name,
    trackerPort,
    privateKey,
    httpPort = null,
    wsPort = null,
    legacyMqttPort = null,
    extraPlugins = {},
    apiAuthentication = null,
    enableCassandra = false,
    privateKeyFileName = null,
    certFileName = null,
    streamrAddress = '0xFCAd0B19bB29D4674531d6f115237E16AfCE377c',
    streamrUrl = `http://${STREAMR_DOCKER_DEV_HOST}`,
    storageNodeConfig = { registry: [] },
    storageConfigRefreshInterval = 0,
    reporting = false
}: Todo): Config {
    const plugins: Record<string,any> = { ...extraPlugins }
    if (httpPort) {
        plugins['legacyPublishHttp'] = {}
        plugins['metrics'] = {}
        if (enableCassandra) {
            plugins['storage'] = {
                cassandra: {
                    hosts: [STREAMR_DOCKER_DEV_HOST],
                    datacenter: 'datacenter1',
                    username: '',
                    password: '',
                    keyspace: 'streamr_dev_v2',
                },
                storageConfig: {
                    refreshInterval: storageConfigRefreshInterval
                } 
            }
        }
    }
    if (wsPort) {
        plugins['legacyWebsocket'] = {
            port: wsPort,
            pingInterval: 3000,
            privateKeyFileName,
            certFileName
        }
    }
    if (legacyMqttPort) {
        plugins['legacyMqtt'] = {
            port: legacyMqttPort,
            streamsTimeout: 300000
        }
    }

    return {
        ethereumPrivateKey: privateKey,
        network: {
            name,
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
        storageNodeConfig,
        httpServer: httpPort ? {
            port: httpPort,
            privateKeyFileName: null,
            certFileName: null
        } : null,
        apiAuthentication,
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

export function createClient(
    wsPort: number,
    privateKey = fastPrivateKey(),
    clientOptions?: StreamrClientOptions
): StreamrClient {
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

const getTestName = (module: NodeModule) => {
    const fileNamePattern = new RegExp('.*/(.*).test\\...')
    const groups = module.filename.match(fileNamePattern)
    return (groups !== null) ? groups[1] : module.filename
}

export const createTestStream = (streamrClient: StreamrClient, module: NodeModule, props?: Partial<StreamProperties>) => {
    return streamrClient.createStream({
        id: '/test/' + getTestName(module) + '/' + Date.now(),
        ...props
    })
}

export class Queue<T> {
    items: T[] = []

    push(item: T) {
        this.items.push(item)
    }

    async pop(): Promise<T> {
        await waitForCondition(() => this.items.length > 0)
        return this.items.shift()!
    }
}
