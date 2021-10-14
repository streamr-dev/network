import type { StreamMessage } from 'streamr-client-protocol'
import { Wallet } from 'ethers'

import { router as dataQueryEndpoints } from './DataQueryEndpoints'
import { router as dataMetadataEndpoint } from './DataMetadataEndpoints'
import { router as storageConfigEndpoints } from './StorageConfigEndpoints'
import { Plugin, PluginOptions } from '../../Plugin'
import { StreamFetcher } from '../../StreamFetcher'
import { Storage, startCassandraStorage } from './Storage'
import { StorageConfig, AssignmentMessage } from './StorageConfig'
import { StreamPart } from '../../types'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'
import { Schema } from 'ajv'

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
        clusterAddress: string | null,
        clusterSize: number,
        myIndexInCluster: number
    }
}

export class StoragePlugin extends Plugin<StoragePluginConfig> {

    private cassandra?: Storage
    private storageConfig?: StorageConfig
    private messageListener?: (msg: StreamMessage) => void
    private assignmentMessageListener?: (msg: StreamMessage<AssignmentMessage>) => void

    constructor(options: PluginOptions) {
        super(options)
    }

    async start(): Promise<void> {
        this.cassandra = await this.getCassandraStorage()
        this.storageConfig = await this.createStorageConfig()
        this.messageListener = (msg) => {
            const streamPart = {
                id: msg.messageId.streamId,
                partition: msg.messageId.streamPartition
            }
            if (this.storageConfig!.hasStream(streamPart)) {
                this.cassandra!.store(msg)
            }
        }
        this.storageConfig.getStreams().forEach((stream) => {
            this.subscriptionManager.subscribe(stream.id, stream.partition)
        })
        this.storageConfig.addChangeListener({
            onStreamAdded: (stream: StreamPart) => this.subscriptionManager.subscribe(stream.id, stream.partition),
            onStreamRemoved: (stream: StreamPart) => this.subscriptionManager.unsubscribe(stream.id, stream.partition)
        })
        this.networkNode.addMessageListener(this.messageListener)
        const streamFetcher = new StreamFetcher(this.brokerConfig.streamrUrl)
        this.addHttpServerRouter(dataQueryEndpoints(this.cassandra, streamFetcher, this.metricsContext))
        this.addHttpServerRouter(dataMetadataEndpoint(this.cassandra))
        this.addHttpServerRouter(storageConfigEndpoints(this.storageConfig))
    }

    private async getCassandraStorage(): Promise<Storage> {
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
        cassandraStorage.enableMetrics(this.metricsContext)
        return cassandraStorage
    }

    private async createStorageConfig(): Promise<StorageConfig> {
        const brokerAddress = new Wallet(this.brokerConfig.ethereumPrivateKey).address
        const apiUrl = this.brokerConfig.streamrUrl + '/api/v1'
        const storageConfig = await StorageConfig.createInstance(
            this.pluginConfig.cluster.clusterAddress || brokerAddress,
            this.pluginConfig.cluster.clusterSize,
            this.pluginConfig.cluster.myIndexInCluster,
            apiUrl,
            this.pluginConfig.storageConfig.refreshInterval)
        this.assignmentMessageListener = storageConfig.startAssignmentEventListener(this.brokerConfig.streamrAddress, this.subscriptionManager)
        return storageConfig
    }

    async stop(): Promise<void> {
        this.storageConfig!.stopAssignmentEventListener(this.assignmentMessageListener!, this.brokerConfig.streamrAddress, this.subscriptionManager)
        this.networkNode.removeMessageListener(this.messageListener!)
        this.storageConfig!.getStreams().forEach((stream) => {
            this.subscriptionManager.unsubscribe(stream.id, stream.partition)
        })
        await Promise.all([
            this.cassandra!.close(),
            this.storageConfig!.cleanup()
        ])
    }

    getConfigSchema(): Schema {
        return PLUGIN_CONFIG_SCHEMA
    }
}
