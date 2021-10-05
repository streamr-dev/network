import crypto from 'crypto'
import StreamrClient, { MaybeAsync, Stream, StreamProperties, StreamrClientOptions } from 'streamr-client'
import mqtt from 'async-mqtt'
import fetch from 'node-fetch'
import { Wallet } from 'ethers'
import { Tracker } from 'streamr-network'
import { waitForCondition } from 'streamr-test-utils'
import { Broker, createBroker } from '../src/broker'
import { StorageConfig } from '../src/plugins/storage/StorageConfig'
import { Todo } from '../src/types'
import { Config } from '../src/config'

export const STREAMR_DOCKER_DEV_HOST = process.env.STREAMR_DOCKER_DEV_HOST || '127.0.0.1'
const API_URL = `http://${STREAMR_DOCKER_DEV_HOST}/api/v1`

export function formConfig({
    name,
    trackerPort,
    privateKey,
    trackerId = 'tracker-1',
    generateSessionId = false,
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
    storageNodeConfig = {
        privatekey: '0x2cd9855d17e01ce041953829398af7e48b24ece04ff9d0e183414de54dc52285',
        address: '0x505D48552Ac17FfD0845FFA3783C2799fd4aaD78',
        url: `http://${process.env.STREAMR_DOCKER_DEV_HOST || '10.200.10.1'}:8891`
    },
    storageConfigRefreshInterval = 5000,
}: Todo): Config {
    const plugins: Record<string,any> = { ...extraPlugins }
    if (httpPort) {
        plugins['legacyPublishHttp'] = {}
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
        generateSessionId,
        network: {
            name,
            trackers: [
                {
                    id: trackerId,
                    ws: `ws://127.0.0.1:${trackerPort}`,
                    http: `http://127.0.0.1:${trackerPort}`
                }
            ],
            location: {
                latitude: 60.19,
                longitude: 24.95,
                country: 'Finland',
                city: 'Helsinki'
            },
            stun: null,
            turn : null
        },
        streamrUrl,
        streamrAddress,
        storageNodeConfig,
        httpServer: {
            port: httpPort ? httpPort : 7171,
            privateKeyFileName: null,
            certFileName: null
        },
        apiAuthentication,
        plugins
    }
}

export const startBroker = async (...args: Todo[]): Promise<Broker> => {
    // @ts-expect-error
    const broker = await createBroker(formConfig(...args))
    await broker.start()
    return broker
}

export function getWsUrl(port: number, ssl = false) {
    return `${ssl ? 'wss' : 'ws'}://127.0.0.1:${port}/api/v1/ws`
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
    tracker: Tracker,
    privateKey = fastPrivateKey(),
    clientOptions?: StreamrClientOptions
): StreamrClient {
    return new StreamrClient({
        auth: {
            privateKey
        },
        restUrl: `http://${STREAMR_DOCKER_DEV_HOST}/api/v1`,
        network: {
            trackers: [tracker.getConfigRecord()]
        },
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

    constructor(tracker: Tracker, engineAndEditorAccount: Wallet) {
        this.engineAndEditorAccount = engineAndEditorAccount
        this.client = createClient(tracker, engineAndEditorAccount.privateKey)
    }

    async createStream() {
        this.eventStream = await this.client.createStream({
            id: '/' + this.engineAndEditorAccount.address + '/' + getTestName(module) + '/' + Date.now(),
        })
    }

    async addStreamToStorageNode(streamId: string, storageNodeAddress: string, client: StreamrClient) {
        await client.addStreamToStorageNode(streamId, storageNodeAddress)
        await until(async () => { return client.isStreamStoredInStorageNode(streamId, storageNodeAddress) }, 100000, 1000)
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
        return this.client.disconnect()
    }
}

export const waitForStreamPersistedInStorageNode = async (streamId: string, partition: number, nodeHost: string, nodeHttpPort: number) => {
    const isPersistent = async () => {
        const response = await fetch(`http://${nodeHost}:${nodeHttpPort}/api/v1/streams/${encodeURIComponent(streamId)}/storage/partitions/${partition}`)
        return (response.status === 200)
    }
    await waitForCondition(() => isPersistent(), 20000, 500)
}

const getTestName = (module: NodeModule) => {
    const fileNamePattern = new RegExp('.*/(.*).test\\...')
    const groups = module.filename.match(fileNamePattern)
    return (groups !== null) ? groups[1] : module.filename
}

export const createTestStream = (
    streamrClient: StreamrClient,
    module: NodeModule,
    props?: Partial<StreamProperties>
): Promise<Stream> => {
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

    async pop(timeout?: number): Promise<T> {
        await waitForCondition(() => this.items.length > 0, timeout)
        return this.items.shift()!
    }
}

export async function sleep(ms = 0): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

/**
 * Wait until a condition is true
 * @param condition - wait until this callback function returns true
 * @param timeOutMs - stop waiting after that many milliseconds, -1 for disable
 * @param pollingIntervalMs - check condition between so many milliseconds
 * @param failedMsgFn - append the string return value of this getter function to the error message, if given
 * @return the (last) truthy value returned by the condition function
 */
export async function until(condition: MaybeAsync<() => boolean>, timeOutMs = 10000,
    pollingIntervalMs = 100, failedMsgFn?: () => string): Promise<boolean> {
    // condition could as well return any instead of boolean, could be convenient
    // sometimes if waiting until a value is returned. Maybe change if such use
    // case emerges.
    const err = new Error(`Timeout after ${timeOutMs} milliseconds`)
    let isTimedOut = false
    let t!: ReturnType<typeof setTimeout>
    if (timeOutMs > 0) {
        t = setTimeout(() => { isTimedOut = true }, timeOutMs)
    }

    try {
        // Promise wrapped condition function works for normal functions just the same as Promises
        let wasDone = false
        while (!wasDone && !isTimedOut) { // eslint-disable-line no-await-in-loop
            wasDone = await Promise.resolve().then(condition) // eslint-disable-line no-await-in-loop
            if (!wasDone && !isTimedOut) {
                await sleep(pollingIntervalMs) // eslint-disable-line no-await-in-loop
            }
        }

        if (isTimedOut) {
            if (failedMsgFn) {
                err.message += ` ${failedMsgFn()}`
            }
            throw err
        }

        return wasDone
    } finally {
        clearTimeout(t)
    }
}

