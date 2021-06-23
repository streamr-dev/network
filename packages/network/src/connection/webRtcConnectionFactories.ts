import { ConstructorOptions, WebRtcConnection } from './WebRtcConnection'
import { NodeWebRtcConnection } from './NodeWebRtcConnection'
import nodeDataChannel from 'node-datachannel'

export interface WebRtcConnectionFactory {
    createConnection(opts: ConstructorOptions): WebRtcConnection
    cleanUp(): void
}

export const NodeWebRtcConnectionFactory: WebRtcConnectionFactory = Object.freeze({
    createConnection(opts: ConstructorOptions): WebRtcConnection {
        return new NodeWebRtcConnection(opts)
    },
    cleanUp(): void {
        nodeDataChannel.cleanup()
    }
})