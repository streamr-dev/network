import { BrokerUtils } from './types'

export interface AdapterConfig {
    name: string
    port: number
}

export type AdapterStartFn<T extends AdapterConfig> = (adapterConfig: T, brokerUtils: BrokerUtils) => () => Promise<any>