import { AdapterConfig } from './Adapter'

export interface TrackerRegistry {
    registryAddress: string
    jsonRpcProvider: string
}

export interface NetworkConfig {
    name: string,
    hostname: string,
    port: number,
    advertisedWsUrl: string | null,
    isStorageNode: boolean,
    trackers: string[] | TrackerRegistry,
    location: {
        latitude: number,
        longitude: number,
        country: string,
        city: string
    } | null
}

export interface StorageNodeRegistryItem {
    address: string
    url: string
}

export interface Config {
    ethereumPrivateKey: string
    network: NetworkConfig,
    cassandra: {
        hosts: string[],
        username: string
        password: string
        keyspace: string,
        datacenter: string
    } | null,
    storageConfig: {
        refreshInterval: number
    } | null,
    reporting: {
        intervalInSeconds: number,
        streamr: {
            streamId: string
        } | null,
        perNodeMetrics: {
            enabled: boolean
            wsUrl: string | null
            httpUrl: string | null
            intervals: {
                sec: number,
                min: number,
                hour: number,
                day: number
            } | null,
            storageNode: string
        } | null,
    },
    streamrUrl: string,
    streamrAddress: string,
    storageNodeRegistry: StorageNodeRegistryItem[] | null
    adapters: AdapterConfig[]
}

export interface BrokerConfig extends Config {
    network: NetworkConfig & {
        isStorageNode: false
    },
    storageNodeRegistry: NonNullable<Config['storageNodeRegistry']>
}

export interface StorageNodeConfig extends Config {
    network: NetworkConfig & {
        isStorageNode: true
    }
    cassandra: NonNullable<Config['cassandra']>
    storageConfig: NonNullable<Config['storageConfig']>
}
