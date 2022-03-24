import type { EthereumAddress, StreamMessage } from 'streamr-client-protocol'
import { router as dataQueryEndpoints } from './DataQueryEndpoints'
import { router as dataMetadataEndpoint } from './DataMetadataEndpoints'
import { router as storageConfigEndpoints } from './StorageConfigEndpoints'
import { Plugin, PluginOptions } from '../../Plugin'
import { Storage, startCassandraStorage } from './Storage'
import { StorageConfig } from './StorageConfig'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'
import { Schema } from 'ajv'
import { MetricsContext, Logger } from 'streamr-network'
import { formStorageNodeAssignmentStreamId, Stream } from 'streamr-client'

const logger = new Logger(module)

export interface StoragePluginConfig {
    cassandra: {
        hosts: string[],
        username: string
        password: string
        keyspace: string,
        datacenter: string
    }
    storageConfig: {
        refreshInterval: number
    }
    cluster: {
        // If clusterAddress is null, the broker's address will be used
        clusterAddress: EthereumAddress | null,
        clusterSize: number,
        myIndexInCluster: number
    }
}

export class StoragePlugin extends Plugin<StoragePluginConfig> {
    private cassandra?: Storage
    private storageConfig?: StorageConfig
    private messageListener?: (msg: StreamMessage) => void

    constructor(options: PluginOptions) {
        super(options)
    }

    async start(): Promise<void> {
        const clusterId = this.pluginConfig.cluster.clusterAddress || await this.streamrClient.getAddress()
        const assignmentStream = await this.streamrClient.getStream(formStorageNodeAssignmentStreamId(clusterId))
        const metricsContext = (await (this.streamrClient!.getNode())).getMetricsContext()
        this.cassandra = await this.startCassandraStorage(metricsContext)
        this.storageConfig = await this.startStorageConfig(clusterId, assignmentStream)
        this.messageListener = (msg) => {
            if (this.storageConfig!.hasStreamPart(msg.getStreamPartID())) {
                this.cassandra!.store(msg)
            }
        }
        const node = await this.streamrClient.getNode()
        node.addMessageListener(this.messageListener)
        this.addHttpServerRouter(dataQueryEndpoints(this.cassandra, metricsContext))
        this.addHttpServerRouter(dataMetadataEndpoint(this.cassandra))
        this.addHttpServerRouter(storageConfigEndpoints(this.storageConfig))
    }

    async stop(): Promise<void> {
        const node = await this.streamrClient.getNode()
        node.removeMessageListener(this.messageListener!)
        this.storageConfig!.getStreamParts().forEach((streamPart) => {
            node.unsubscribe(streamPart)
        })
        await Promise.all([
            this.cassandra!.close(),
            this.storageConfig!.destroy()
        ])
    }

    getConfigSchema(): Schema {
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

    private async startStorageConfig(clusterId: string, assignmentStream: Stream): Promise<StorageConfig> {
        const node = await this.streamrClient.getNode()
        const storageConfig = new StorageConfig(
            clusterId,
            this.pluginConfig.cluster.clusterSize,
            this.pluginConfig.cluster.myIndexInCluster,
            this.pluginConfig.storageConfig.refreshInterval,
            this.streamrClient,
            {
                onStreamPartAdded: async (streamPart) => {
                    try {
                        await node.subscribeAndWaitForJoin(streamPart) // best-effort, can time out
                    } catch (_e) {}
                    try {
                        await assignmentStream.publish({
                            streamPart
                        })
                        logger.debug('published message to assignment stream %s', assignmentStream.id)
                    } catch (e) {
                        logger.warn('failed to publish to assignment stream %s, reason: %s', assignmentStream.id, e)
                    }
                },
                onStreamPartRemoved: (streamPart) => {
                    node.unsubscribe(streamPart)
                }
            }
        )
        await storageConfig.start()
        return storageConfig
    }
}
