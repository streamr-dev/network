import StreamrClient, {
    CONFIG_TEST,
    Stream,
    StreamPermission,
    StreamMetadata,
    StreamrClientConfig
} from 'streamr-client'
import padEnd from 'lodash/padEnd'
import { Wallet } from 'ethers'
import { Tracker, startTracker } from '@streamr/network-tracker'
import { Broker, createBroker } from '../src/broker'
import { Config } from '../src/config/config'
import { StreamPartID } from '@streamr/protocol'
import { EthereumAddress, MetricsContext, toEthereumAddress } from '@streamr/utils'
import { TEST_CONFIG } from '@streamr/network-node'
import { merge } from '@streamr/utils'

export const STREAMR_DOCKER_DEV_HOST = process.env.STREAMR_DOCKER_DEV_HOST || '127.0.0.1'

interface TestConfig {
    trackerPort: number
    privateKey: string
    httpPort?: number
    extraPlugins?: Record<string, unknown>
    apiAuthentication?: Config['apiAuthentication']
    enableCassandra?: boolean
    storageConfigRefreshInterval?: number
}

export const formConfig = ({
    trackerPort,
    privateKey,
    httpPort,
    extraPlugins = {},
    apiAuthentication,
    enableCassandra = false,
    storageConfigRefreshInterval = 0,
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
            ...CONFIG_TEST,
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
        metricsContext: new MetricsContext(),
        trackerPingInterval: TEST_CONFIG.trackerPingInterval
    })
}

export const startBroker = async (testConfig: TestConfig): Promise<Broker> => {
    const broker = await createBroker(formConfig(testConfig))
    await broker.start()
    return broker
}

export const createEthereumAddress = (id: number): EthereumAddress => {
    return toEthereumAddress('0x' + padEnd(String(id), 40, '0'))
}

export const createClient = async (
    tracker: Tracker,
    privateKey: string,
    clientOptions?: StreamrClientConfig
): Promise<StreamrClient> => {
    const opts = merge(
        CONFIG_TEST,
        {
            auth: {
                privateKey
            },
            network: merge(
                CONFIG_TEST?.network,
                { 
                    trackers: [tracker.getConfigRecord()]
                },
                clientOptions?.network
            )
        },
        clientOptions
    )
    return new StreamrClient(opts)
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

export async function startStorageNode(
    storageNodePrivateKey: string,
    httpPort: number,
    trackerPort: number
): Promise<Broker> {
    const client = new StreamrClient({
        ...CONFIG_TEST,
        auth: {
            privateKey: storageNodePrivateKey
        },
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
