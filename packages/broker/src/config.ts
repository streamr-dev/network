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
    trackers: TrackerRegistryItem[] | NetworkSmartContract,
    stun: string | null,
    turn: TurnConfig | null,
    webrtcDisallowPrivateAddresses: boolean,
    acceptProxyConnections: boolean
}

export interface HttpServerConfig {
    port: number,
    privateKeyFileName: string | null,
    certFileName: string | null
}

export type ApiAuthenticationConfig = { keys: string[] } | null

export interface Config {
    client: BrubeckClientConfig
    generateSessionId: boolean
    network: NetworkConfig,
    streamrAddress: string,
    httpServer: HttpServerConfig
    plugins: Record<string,any>
    apiAuthentication: ApiAuthenticationConfig
}
