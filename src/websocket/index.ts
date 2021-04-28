import ws from 'uWebSockets.js'
import { MissingConfigError } from '../errors/MissingConfigError'
import { WebsocketServer } from './WebsocketServer'
import { AdapterConfig, AdapterStartFn } from '../Adapter'
import { BrokerUtils } from '../types'

export interface WsAdapterConfig extends AdapterConfig {
    privateKeyFileName: string|null, 
    certFileName: string|null,
    pingInterval: number
}

export const start: AdapterStartFn<WsAdapterConfig> = (
    { port, privateKeyFileName, certFileName, pingInterval }: WsAdapterConfig, 
    { networkNode, publisher, streamFetcher, metricsContext, subscriptionManager}: BrokerUtils
): () => Promise<any> => {
    if (port === undefined) {
        throw new MissingConfigError('port')
    }

    let server
    if (privateKeyFileName && certFileName) {
        server = ws.SSLApp({
            key_file_name: privateKeyFileName,
            cert_file_name: certFileName,
        })
    } else {
        server = ws.App()
    }
    const websocketServer = new WebsocketServer(
        server,
        port,
        networkNode,
        streamFetcher,
        publisher,
        metricsContext,
        subscriptionManager,
        pingInterval
    )
    return () => websocketServer.close()
}
