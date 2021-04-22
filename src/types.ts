import { MetricsContext, NetworkNode } from 'streamr-network';
import { Publisher } from './Publisher';
import { StreamFetcher } from './StreamFetcher';
import { SubscriptionManager } from './SubscriptionManager';

export type Todo = any

export interface BrokerUtils {
    networkNode: NetworkNode
    publisher: Publisher
    streamFetcher: StreamFetcher
    metricsContext: MetricsContext
    subscriptionManager: SubscriptionManager
    cassandraStorage?: Todo
    storageConfig?: Todo
}