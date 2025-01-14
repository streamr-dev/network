import {
    Stream,
    StreamMessage,
    StreamMessageType,
    StreamrClient,
    formStorageNodeAssignmentStreamId
} from '@streamr/sdk'
import { EthereumAddress, Logger, MetricsContext, executeSafePromise, toEthereumAddress } from '@streamr/utils'
import { Schema } from 'ajv'
import { ApiPluginConfig, Plugin } from '../../Plugin'
import { Storage, startCassandraStorage } from './Storage'
import { StorageConfig } from './StorageConfig'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'
import { createDataMetadataEndpoint } from './dataMetadataEndpoint'
import { createDataQueryEndpoint } from './dataQueryEndpoint'
import { createStorageConfigEndpoint } from './storageConfigEndpoint'

const logger = new Logger(module)

export interface StoragePluginConfig extends ApiPluginConfig {
    cassandra: {
        hosts: string[]
        username: string
        password: string
        keyspace: string
        datacenter: string
    }
    storageConfig: {
        refreshInterval: number
    }
    cluster: {
        // If clusterAddress is undefined, the broker's address will be used
        clusterAddress?: EthereumAddress
        clusterSize: number
        myIndexInCluster: number
    }
}

const isStorableMessage = (msg: StreamMessage): boolean => {
    return msg.messageType === StreamMessageType.MESSAGE
}

export class StoragePlugin extends Plugin<StoragePluginConfig> {
    private streamrClient?: StreamrClient
    private cassandra?: Storage
    private storageConfig?: StorageConfig
    private messageListener?: (msg: StreamMessage) => void

    async start(streamrClient: StreamrClient): Promise<void> {
        this.streamrClient = streamrClient
        const clusterId =
            this.pluginConfig.cluster.clusterAddress ?? toEthereumAddress(await this.streamrClient.getUserId())
        const assignmentStream = await this.streamrClient.getStream(formStorageNodeAssignmentStreamId(clusterId))
        const metricsContext = await this.streamrClient.getNode().getMetricsContext()
        this.cassandra = await this.startCassandraStorage(metricsContext)
        this.storageConfig = await this.startStorageConfig(clusterId, assignmentStream)
        this.messageListener = (msg) => {
            if (isStorableMessage(msg) && this.storageConfig!.hasStreamPart(msg.getStreamPartID())) {
                this.cassandra!.store(msg)
            }
        }
        const node = this.streamrClient.getNode()
        node.addMessageListener(this.messageListener)
        this.addHttpServerEndpoint(createDataQueryEndpoint(this.cassandra, metricsContext))
        this.addHttpServerEndpoint(createDataMetadataEndpoint(this.cassandra))
        this.addHttpServerEndpoint(createStorageConfigEndpoint(this.storageConfig))
    }

    async stop(): Promise<void> {
        const node = this.streamrClient!.getNode()
        node.removeMessageListener(this.messageListener!)
        await Promise.all(Array.from(this.storageConfig!.getStreamParts()).map((streamPart) => node.leave(streamPart)))
        await this.cassandra!.close()
        this.storageConfig!.destroy()
    }

    // eslint-disable-next-line class-methods-use-this
    override getConfigSchema(): Schema {
        return PLUGIN_CONFIG_SCHEMA
    }

    private async startCassandraStorage(metricsContext: MetricsContext): Promise<Storage> {
        const cassandraStorage = await startCassandraStorage({
            contactPoints: [...this.pluginConfig.cassandra.hosts],
            localDataCenter: this.pluginConfig.cassandra.datacenter,
            keyspace: this.pluginConfig.cassandra.keyspace,
            username: this.pluginConfig.cassandra.username,
            password: this.pluginConfig.cassandra.password,
            opts: {
                useTtl: false
            }
        })
        cassandraStorage.enableMetrics(metricsContext)
        return cassandraStorage
    }

    private async startStorageConfig(clusterId: EthereumAddress, assignmentStream: Stream): Promise<StorageConfig> {
        const node = this.streamrClient!.getNode()
        const storageConfig = new StorageConfig(
            clusterId,
            this.pluginConfig.cluster.clusterSize,
            this.pluginConfig.cluster.myIndexInCluster,
            this.pluginConfig.storageConfig.refreshInterval,
            this.streamrClient!,
            {
                onStreamPartAdded: async (streamPart) => {
                    try {
                        await node.join(streamPart, { minCount: 1, timeout: 5000 }) // best-effort, can time out
                    } catch (_e) {
                        // no-op
                    }
                    try {
                        await assignmentStream.publish({
                            streamPart
                        })
                        logger.debug('Published message to assignment stream', {
                            assignmentStreamId: assignmentStream.id
                        })
                    } catch (err) {
                        logger.warn('Failed to publish to assignment stream', {
                            assignmentStreamId: assignmentStream.id,
                            err
                        })
                    }
                },
                onStreamPartRemoved: (streamPart) => {
                    executeSafePromise(() => node.leave(streamPart))
                }
            }
        )
        await storageConfig.start()
        return storageConfig
    }
}
