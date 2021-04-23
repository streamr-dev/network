import { BrokerUtils } from './types'

export interface AdapterConfig {
    port: number, 
    privateKeyFileName?: string, 
    certFileName?: string,
    pingInterval?: number
    streamsTimeout?: number
}

export type AdapterStartFn = (adapterConfig: AdapterConfig, brokerUtils: BrokerUtils) => void