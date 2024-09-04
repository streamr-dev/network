import { StreamrClient } from './StreamrClient'
import { Logger } from '@streamr/utils'

const STREAM_ID = '0x0472476943d7570b368e2a02123321518568a66e/yolo'

const logger = new Logger(module)

const streamrClient = new StreamrClient({
    metrics: false,
    network: {
        controlLayer: {
            websocketPortRange: null,
            iceServers: [{
                url: 'stun:stun.l.google.com',
                port: 19302
            }]
        }
    }
})

;(async () => {
    const node = await (streamrClient.getNode().getNode())
    await streamrClient.subscribe({ stream: STREAM_ID, raw: true }, (msg) => {
        logger.info('Received message', { msg })
    })
})()
