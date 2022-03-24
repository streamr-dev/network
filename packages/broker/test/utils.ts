import StreamrClient, {
    ConfigTest,
    MaybeAsync,
    Stream,
    StreamPermission,
    StreamProperties,
    StreamrClientConfig
} from 'streamr-client'
import fetch from 'node-fetch'
import _ from 'lodash'
import { Wallet } from 'ethers'
import { Tracker, startTracker } from 'streamr-network'
import { KeyServer, waitForCondition } from 'streamr-test-utils'
import { Broker, createBroker } from '../src/broker'
import { ApiAuthenticationConfig, Config } from '../src/config/config'
import { StreamPartID } from 'streamr-client-protocol'
import { CURRENT_CONFIGURATION_VERSION, formSchemaUrl } from '../src/config/migration'

export const STREAMR_DOCKER_DEV_HOST = process.env.STREAMR_DOCKER_DEV_HOST || '127.0.0.1'

interface TestConfig {
    name: string
    trackerPort: number
    privateKey: string
    httpPort?: null | number
    extraPlugins?: Record<string, unknown>
    apiAuthentication?: ApiAuthenticationConfig
    enableCassandra?: boolean
    privateKeyFileName?: null | string
    certFileName?: null | string
    restUrl?: string
    storageConfigRefreshInterval?: number
}

export const formConfig = ({
    name,
    trackerPort,
    privateKey,
    httpPort = null,
    extraPlugins = {},
    apiAuthentication = null,
    enableCassandra = false,
    restUrl = `http://${STREAMR_DOCKER_DEV_HOST}/api/v2`,
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

    return {
        $schema: formSchemaUrl(CURRENT_CONFIGURATION_VERSION),
        client: {
            ...ConfigTest,
            auth: {
                privateKey
            },
            restUrl,
            network: {
                name,
                id: new Wallet(privateKey).address,
                trackers: [
                    {
                        id: createEthereumAddress(trackerPort),
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
                webrtcDisallowPrivateAddresses: false,
            }
        },
        httpServer: {
            port: httpPort ? httpPort : 7171,
            privateKeyFileName: null,
            certFileName: null
        },
        apiAuthentication,
        plugins
    }
}

export const startTestTracker = async (port: number): Promise<Tracker> => {
    return await startTracker({
        id: createEthereumAddress(port),
        listen: {
            hostname: '127.0.0.1',
            port
        },
    })
}

export async function fetchPrivateKeyWithGas(): Promise<string> {
    let response
    try {
        response = await fetch(`http://localhost:${KeyServer.KEY_SERVER_PORT}/key`, {
            timeout: 9 * 1000
        })
    } catch (_e) {
        try {
            await KeyServer.startIfNotRunning() // may throw if parallel attempts at starting server
        } finally {
            response = await fetch(`http://localhost:${KeyServer.KEY_SERVER_PORT}/key`, {
                timeout: 9 * 1000
            })
        }
    }
    return response.text()
}

export const startBroker = async (testConfig: TestConfig): Promise<Broker> => {
    const broker = await createBroker(formConfig(testConfig))
    await broker.start()
    return broker
}

export const createEthereumAddress = (id: number): string => {
    return '0x' + _.padEnd(String(id), 40, '0')
}

export const createClient = async (
    tracker: Tracker,
    privateKey: string,
    clientOptions?: StreamrClientConfig
): Promise<StreamrClient> => {
    return new StreamrClient({
        ...ConfigTest,
        auth: {
            privateKey
        },
        restUrl: `http://${STREAMR_DOCKER_DEV_HOST}/api/v2`,
        network: {
            trackers: [tracker.getConfigRecord()]
        },
        ...clientOptions,
    })
}

export const getTestName = (module: NodeModule): string => {
    const fileNamePattern = new RegExp('.*/(.*).test\\...')
    const groups = module.filename.match(fileNamePattern)
    return (groups !== null) ? groups[1] : module.filename
}

export const createTestStream = async (
    streamrClient: StreamrClient,
    module: NodeModule,
    props?: Partial<StreamProperties>
): Promise<Stream> => {
    const id = (await streamrClient.getAddress()) + '/test/' + getTestName(module) + '/' + Date.now()
    const stream = await streamrClient.createStream({
        id,
        ...props
    })
    return stream
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

export const getStreamParts = async (broker: Broker): Promise<StreamPartID[]> => {
    const node = await broker.getNode()
    return Array.from(node.getStreamParts())
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

export async function startStorageNode(
    storageNodePrivateKey: string,
    httpPort: number,
    trackerPort: number
): Promise<Broker> {
    const client = new StreamrClient({
        ...ConfigTest,
        auth: {
            privateKey: storageNodePrivateKey
        },
    })
    try {
        await client.createOrUpdateNodeInStorageNodeRegistry(`{"http": "http://127.0.0.1:${httpPort}"}`)
        await createAssignmentStream(client)
    } finally {
        client?.destroy()
    }
    return startBroker({
        name: 'storageNode',
        privateKey: storageNodePrivateKey,
        trackerPort,
        httpPort,
        enableCassandra: true,
    })
}

async function createAssignmentStream(client: StreamrClient): Promise<Stream> {
    const stream = await client.getOrCreateStream({
        id: '/assignments',
        partitions: 1
    })
    await stream.grantPermissions({
        public: true,
        permissions: [StreamPermission.SUBSCRIBE]
    })
    return stream
}
