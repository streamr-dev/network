import { MetricsContext } from 'streamr-network'
import { StoragePlugin } from '../../../src/storage/StoragePlugin'
import { StorageConfig } from '../../../src/storage/StorageConfig'
import { createMockStorageConfig } from './MockStorageConfig'
import { fastPrivateKey, STREAMR_DOCKER_DEV_HOST } from '../../utils'
import { StreamPart } from '../../../src/types'

const STREAM_PARTS: StreamPart[] = [ 
    { id: 'foo', partition: 0 },
    { id: 'bar', partition: 0 }
]

const createMockPlugin = (networkNode: any, subscriptionManager: any) => {
    const brokerConfig: any = {
        ethereumPrivateKey: fastPrivateKey(),
        plugins: {
            storage: {
                cassandra: {
                    hosts: [
                        STREAMR_DOCKER_DEV_HOST
                    ],
                    username: '',
                    password: '',
                    keyspace: 'streamr_dev_v2',
                    datacenter: 'datacenter1'
                },
                storageConfig: {
                    refreshInterval: 0
                }
            }
        }
    }
    return new StoragePlugin({
        name: 'storage',
        networkNode,
        subscriptionManager,
        publisher: undefined as any,
        metricsContext: new MetricsContext(null as any),
        brokerConfig
    })
}

describe('StoragePlugin', () => {

    let networkNode: any
    let subscriptionManager: any
    let storageConfig: any
    let storageConfigFactory: any

    beforeEach(() => {
        networkNode = {
            addMessageListener: jest.fn(),
            removeMessageListener: jest.fn(),
            subscribe: jest.fn()
        }
        subscriptionManager = {
            subscribe: jest.fn(),
            unsubscribe: jest.fn()
        }
        storageConfig = createMockStorageConfig(STREAM_PARTS)
        storageConfigFactory = jest.spyOn(StorageConfig, 'createInstance')
        storageConfigFactory.mockResolvedValue(storageConfig)
    })

    afterEach(() => {
        storageConfigFactory.mockRestore()
    })

    test('happy path: start and stop', async () => {
        const plugin = createMockPlugin(networkNode, subscriptionManager)
        await plugin.start()
        expect(subscriptionManager.subscribe).toBeCalledTimes(STREAM_PARTS.length)
        expect(networkNode.addMessageListener).toBeCalledTimes(1)
        expect(storageConfig.startAssignmentEventListener).toBeCalledTimes(1)
        // @ts-expect-error private field
        const cassandraClose = jest.spyOn(plugin.cassandra!, 'close')
        await plugin.stop()
        expect(subscriptionManager.unsubscribe).toBeCalledTimes(STREAM_PARTS.length)
        expect(networkNode.removeMessageListener).toBeCalledTimes(1)
        expect(storageConfig.stopAssignmentEventListener).toBeCalledTimes(1)
        expect(storageConfig.cleanup).toBeCalledTimes(1)
        expect(cassandraClose).toBeCalledTimes(1)
    }, 10 * 1000)
})