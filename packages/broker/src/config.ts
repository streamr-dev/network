import { BrubeckClientConfig } from 'streamr-client'
import { SmartContractRecord } from 'streamr-client-protocol'

export interface NetworkSmartContract {
    contractAddress: string
    jsonRpcProvider: string
}

export type TrackerRegistryItem = SmartContractRecord

export interface TurnConfig {
    url: string,
    username: string,
    password: string
}

export interface NetworkConfig {
    acceptProxyConnections: boolean
}

export interface HttpServerConfig {
    port: number,
    privateKeyFileName: string | null,
    certFileName: string | null
}

export type ApiAuthenticationConfig = { keys: string[] } | null

export type ClientConfig = BrubeckClientConfig & { network?: { trackers: TrackerRegistryItem[] | NetworkSmartContract | undefined } }

export interface Config {
    client: ClientConfig
    generateSessionId: boolean
    network: NetworkConfig,
    httpServer: HttpServerConfig
    plugins: Record<string,any>
    apiAuthentication: ApiAuthenticationConfig
}
