import crypto from 'crypto'
import StreamrClient, { ConfigTest, MaybeAsync, Stream, StreamProperties, StreamrClientOptions } from 'streamr-client'
import fetch from 'node-fetch'
import _ from 'lodash'
import { Wallet } from 'ethers'
import { Tracker, startTracker } from 'streamr-network'
import { waitForCondition } from 'streamr-test-utils'
import { Broker, createBroker } from '../src/broker'
import { ApiAuthenticationConfig, Config } from '../src/config'
import { StreamPartID } from 'streamr-client-protocol'

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
    restUrl = `http://${STREAMR_DOCKER_DEV_HOST}/api/v1`,
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

export async function getPrivateKey(): Promise<string> {
    const response = await fetch('http://localhost:45454/key', {
        timeout: 9 * 1000
    })
    return response.text()
}

export const startBroker = async (testConfig: TestConfig): Promise<Broker> => {
    const broker = await createBroker(formConfig(testConfig))
    await broker.start()
    return broker
}

// generates a private key
// equivalent to Wallet.createRandom().privateKey but much faster
// the slow part seems to be deriving the address from the key so if you can avoid this, just use
// fastPrivateKey instead of createMockUser
export const fastPrivateKey = (): string => {
    return `0x${crypto.randomBytes(32).toString('hex')}`
}

export const createEthereumAddress = (id: number): string => {
    return '0x' + _.padEnd(String(id), 40, '0')
}

export const createMockUser = (): Wallet => Wallet.createRandom()

export const createClient = async (
    tracker: Tracker,
    privateKey?: string,
    clientOptions?: StreamrClientOptions
): Promise<StreamrClient> => {
    const newPrivateKey = privateKey ? privateKey :  await getPrivateKey()
    return new StreamrClient({
        ...ConfigTest,
        auth: {
            privateKey: newPrivateKey
        },
        restUrl: `http://${STREAMR_DOCKER_DEV_HOST}/api/v1`,
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
    await until(async () => { return streamrClient.streamExistsOnTheGraph(id) }, 100000, 1000)
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

export const getStreamParts = (broker: Broker): StreamPartID[] => {
    return Array.from(broker.getStreamParts())
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
