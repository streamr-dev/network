import type { StreamMessage, SPID } from 'streamr-client-protocol'
import { Wallet } from 'ethers'

import { router as dataQueryEndpoints } from './DataQueryEndpoints'
import { router as dataMetadataEndpoint } from './DataMetadataEndpoints'
import { router as storageConfigEndpoints } from './StorageConfigEndpoints'
import { Plugin, PluginOptions } from '../../Plugin'
import { Storage, startCassandraStorage } from './Storage'
import { StorageConfig, AssignmentMessage } from './StorageConfig'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'
import { Schema } from 'ajv'
import { MetricsContext } from 'streamr-network'

export interface StoragePluginConfig {
    cassandra: {
        hosts: string[],
        username: string
        password: string
        keyspace: string,
        datacenter: string
    }
    storageConfig: {
        streamrAddress: string
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
        const metricsContext = (await (this.streamrClient!.getNode())).getMetricsContext()
        this.cassandra = await this.getCassandraStorage(metricsContext)
        this.storageConfig = await this.createStorageConfig()
        this.messageListener = (msg) => {
            if (this.storageConfig!.hasSPID(msg.getSPID())) {
                this.cassandra!.store(msg)
            }
        }
        // TODO: NET-637 use client instead of networkNode?
        this.storageConfig.getSPIDs().forEach((spid) => {
            this.networkNode.subscribe(spid)
        })
        // TODO: NET-637 use client instead of networkNode?
        this.storageConfig.addChangeListener({
            onSPIDAdded: (spid: SPID) => this.networkNode.subscribe(spid),
            onSPIDRemoved: (spid: SPID) => this.networkNode.unsubscribe(spid)
        })
        this.networkNode.addMessageListener(this.messageListener)
        this.addHttpServerRouter(dataQueryEndpoints(this.cassandra, metricsContext))
        this.addHttpServerRouter(dataMetadataEndpoint(this.cassandra))
        this.addHttpServerRouter(storageConfigEndpoints(this.storageConfig))
    }

    private async getCassandraStorage(metricsContext: MetricsContext): Promise<Storage> {
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

    private async createStorageConfig(): Promise<StorageConfig> {
        const brokerAddress = new Wallet(this.brokerConfig.client.auth!.privateKey!).address
        const storageConfig = await StorageConfig.createInstance(
            this.pluginConfig.cluster.clusterAddress || brokerAddress,
            this.pluginConfig.cluster.clusterSize,
            this.pluginConfig.cluster.myIndexInCluster,
            this.pluginConfig.storageConfig.refreshInterval,
            this.streamrClient)
        this.assignmentMessageListener = storageConfig.
            startAssignmentEventListener(this.pluginConfig.storageConfig.streamrAddress)
        await storageConfig.startChainEventsListener()
        return storageConfig
    }

    async stop(): Promise<void> {
        this.storageConfig!.stopAssignmentEventListener(this.assignmentMessageListener!, 
            this.pluginConfig.storageConfig.streamrAddress)
        this.networkNode.removeMessageListener(this.messageListener!)
        this.storageConfig!.getSPIDs().forEach((spid) => {
            this.networkNode.unsubscribe(spid)
        })
        this.storageConfig!.stopChainEventsListener()
        await Promise.all([
            this.cassandra!.close(),
            this.storageConfig!.cleanup()
        ])
    }

    getConfigSchema(): Schema {
        return PLUGIN_CONFIG_SCHEMA
    }
}
