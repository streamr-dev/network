import StreamrClient, {
    ConfigTest,
    Stream,
    StreamPermission,
    StreamMetadata,
    StreamrClientConfig,
    JsonPeerDescriptor
} from 'streamr-client'
import _ from 'lodash'
import { Wallet } from 'ethers'
import { Tracker, startTracker } from '@streamr/network-tracker'
import { Broker, createBroker } from '../src/broker'
import { Config } from '../src/config/config'
import { StreamPartID } from '@streamr/protocol'
import { EthereumAddress, toEthereumAddress } from '@streamr/utils'

export const STREAMR_DOCKER_DEV_HOST = process.env.STREAMR_DOCKER_DEV_HOST || '127.0.0.1'

interface TestConfig {
    trackerPort: number
    privateKey: string
    wsServerPort: number
    httpPort?: number
    extraPlugins?: Record<string, unknown>
    apiAuthentication?: Config['apiAuthentication']
    enableCassandra?: boolean
    storageConfigRefreshInterval?: number
    entryPoints?: JsonPeerDescriptor[]
}

const DEFAULT_ENTRYPOINTS = [{
    kademliaId: "entryPointBroker",
    type: 0,
    websocket: {
        ip: "127.0.0.1",
        port: 40401
    }
}]

export const formConfig = ({
    trackerPort,
    privateKey,
    httpPort,
    extraPlugins = {},
    apiAuthentication,
    enableCassandra = false,
    storageConfigRefreshInterval = 0,
    wsServerPort,
    entryPoints = DEFAULT_ENTRYPOINTS
}: TestConfig): Config => {
    const plugins: Record<string, any> = { ...extraPlugins }
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
            network: {
                id: toEthereumAddress(new Wallet(privateKey).address),
                trackers: [
                    {
                        id: createEthereumAddress(trackerPort),
                        ws: `ws://127.0.0.1:${trackerPort}`,
                        http: `http://127.0.0.1:${trackerPort}`
                    }
                ],
                entryPoints,
                peerDescriptor: {
                    kademliaId: toEthereumAddress(new Wallet(privateKey).address),
                    type: 0,
                    websocket: {
                        ip: '127.0.0.1',
                        port: wsServerPort
                    }
                },
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
            port: httpPort ? httpPort : 7171
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

export const startBroker = async (testConfig: TestConfig): Promise<Broker> => {
    const broker = await createBroker(formConfig(testConfig))
    await broker.start()
    return broker
}

export const createEthereumAddress = (id: number): EthereumAddress => {
    return toEthereumAddress('0x' + _.padEnd(String(id), 40, '0'))
}

export const createClient = async (
    tracker: Tracker,
    privateKey: string,
    clientOptions?: StreamrClientConfig
): Promise<StreamrClient> => {
    const networkOptions = {
        ...ConfigTest?.network,
        trackers: [tracker.getConfigRecord()],
        ...clientOptions?.network
    }
    return new StreamrClient({
        ...ConfigTest,
        auth: {
            privateKey
        },
        network: networkOptions,
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
    props?: Partial<StreamMetadata>
): Promise<Stream> => {
    const id = (await streamrClient.getAddress()) + '/test/' + getTestName(module) + '/' + Date.now()
    const stream = await streamrClient.createStream({
        id,
        ...props
    })
    return stream
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

export async function startStorageNode(
    storageNodePrivateKey: string,
    httpPort: number,
    trackerPort: number,
    wsServerPort: number,
    entryPoints?: JsonPeerDescriptor[]
): Promise<Broker> {
    const client = new StreamrClient({
        ...ConfigTest,
        auth: {
            privateKey: storageNodePrivateKey
        }
    })
    try {
        await client.setStorageNodeMetadata({
            http: `http://127.0.0.1:${httpPort}`
        })
        await createAssignmentStream(client)
    } finally {
        client?.destroy()
    }
    return startBroker({
        privateKey: storageNodePrivateKey,
        trackerPort,
        httpPort,
        enableCassandra: true,
        wsServerPort,
        entryPoints
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
