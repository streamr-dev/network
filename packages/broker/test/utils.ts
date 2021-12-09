import crypto from 'crypto'
import StreamrClient, { Stream, StreamProperties, StreamrClientOptions } from 'streamr-client'
import fetch from 'node-fetch'
import { Wallet } from 'ethers'
import { Tracker, Protocol } from 'streamr-network'
import { waitForCondition } from 'streamr-test-utils'
import { Broker, createBroker } from '../src/broker'
import { StorageConfig } from '../src/plugins/storage/StorageConfig'
import { ApiAuthenticationConfig, Config, StorageNodeConfig } from '../src/config'

export const STREAMR_DOCKER_DEV_HOST = process.env.STREAMR_DOCKER_DEV_HOST || '127.0.0.1'
const API_URL = `http://${STREAMR_DOCKER_DEV_HOST}/api/v1`

interface TestConfig {
    name: string
    trackerPort: number
    privateKey: string
    trackerId?: string
    generateSessionId?: boolean
    httpPort?: null | number
    wsPort?: null | number
    extraPlugins?: Record<string, unknown>
    apiAuthentication?: ApiAuthenticationConfig
    enableCassandra?: boolean
    privateKeyFileName?: null | string
    certFileName?: null | string
    streamrAddress?: string
    streamrUrl?: string
    storageNodeConfig?: StorageNodeConfig
    storageConfigRefreshInterval?: number
}

export const formConfig = ({
    name,
    trackerPort,
    privateKey,
    trackerId = 'tracker-1',
    generateSessionId = false,
    httpPort = null,
    wsPort = null,
    extraPlugins = {},
    apiAuthentication = null,
    enableCassandra = false,
    privateKeyFileName = null,
    certFileName = null,
    streamrAddress = '0xFCAd0B19bB29D4674531d6f115237E16AfCE377c',
    streamrUrl = `http://${STREAMR_DOCKER_DEV_HOST}`,
    storageNodeConfig = { registry: [] },
    storageConfigRefreshInterval = 0,
}: TestConfig): Config => {
    const plugins: Record<string,any> = { ...extraPlugins }
    if (httpPort) {
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

    return {
        client: {
            auth: {
                privateKey
            },
            network: {
                name,
                location: {
                    latitude: 60.19,
                    longitude: 24.95,
                    country: 'Finland',
                    city: 'Helsinki'
                },
            }
        },
        generateSessionId,
        network: {
            trackers: [
                {
                    id: trackerId,
                    ws: `ws://127.0.0.1:${trackerPort}`,
                    http: `http://127.0.0.1:${trackerPort}`
                }
            ],
            stun: null,
            turn: null,
            webrtcDisallowPrivateAddresses: false,
            acceptProxyConnections: false
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

export const startBroker = async (testConfig: TestConfig): Promise<Broker> => {
    const broker = await createBroker(formConfig(testConfig))
    await broker.start()
    return broker
}

export const getWsUrl = (port: number, ssl = false): string => {
    return `${ssl ? 'wss' : 'ws'}://127.0.0.1:${port}/api/v1/ws`
}

// generates a private key
// equivalent to Wallet.createRandom().privateKey but much faster
// the slow part seems to be deriving the address from the key so if you can avoid this, just use
// fastPrivateKey instead of createMockUser
export const fastPrivateKey = (): string => {
    return `0x${crypto.randomBytes(32).toString('hex')}`
}

export const createMockUser = (): Wallet => Wallet.createRandom()

export const createClient = (
    tracker: Tracker,
    privateKey = fastPrivateKey(),
    clientOptions?: StreamrClientOptions
): StreamrClient => {
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

export class StorageAssignmentEventManager {
    storageNodeAccount: Wallet
    engineAndEditorAccount: Wallet
    client: StreamrClient
    eventStream?: Stream

    constructor(tracker: Tracker, engineAndEditorAccount: Wallet, storageNodeAccount: Wallet) {
        this.engineAndEditorAccount = engineAndEditorAccount
        this.storageNodeAccount = storageNodeAccount
        this.client = createClient(tracker, engineAndEditorAccount.privateKey)
    }

    async createStream(): Promise<void> {
        this.eventStream = await this.client.createStream({
            id: this.engineAndEditorAccount.address + StorageConfig.ASSIGNMENT_EVENT_STREAM_ID_SUFFIX
        })
    }

    async addStreamToStorageNode(streamId: string, storageNodeAddress: string, client: StreamrClient): Promise<void> {
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

    publishAddEvent(streamId: string): void {
        this.eventStream!.publish({
            event: 'STREAM_ADDED',
            stream: {
                id: streamId,
                partitions: 1
            },
            storageNode: this.storageNodeAccount.address,
        })
    }

    async close(): Promise<void> {
        await this.client.destroy()
    }
}

export const waitForStreamPersistedInStorageNode = async (
    streamId: string,
    partition: number,
    nodeHost: string,
    nodeHttpPort: number
): Promise<void> => {
    const isPersistent = async () => {
        // eslint-disable-next-line max-len
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

    push(item: T): void {
        this.items.push(item)
    }

    async pop(timeout?: number): Promise<T> {
        await waitForCondition(() => this.items.length > 0, timeout)
        return this.items.shift()!
    }
}

export const getSPIDKeys = (broker: Broker): Protocol.SPIDKey[] => {
    return Array.from(broker.getSPIDs(), (spid) => spid.toKey())
}
