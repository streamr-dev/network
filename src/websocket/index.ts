import ws from 'uWebSockets.js'
import { MissingConfigError } from '../errors/MissingConfigError'
import { WebsocketServer } from './WebsocketServer'
import { AdapterConfig } from '../Adapter'
import { BrokerUtils } from '../types'

export const start = (
    { port, privateKeyFileName, certFileName, pingInterval }: AdapterConfig, 
    { networkNode, publisher, streamFetcher, metricsContext, subscriptionManager}: BrokerUtils
) => {
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
    return () => {
        websocketServer.close()
    }
}
