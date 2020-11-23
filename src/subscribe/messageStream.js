import { ControlLayer } from 'streamr-client-protocol'

import PushQueue from '../utils/PushQueue'

const { ControlMessage } = ControlLayer

function getIsMatchingStreamMessage({ streamId, streamPartition = 0 }) {
    return function isMatchingStreamMessage({ streamMessage }) {
        const msgStreamId = streamMessage.getStreamId()
        if (streamId !== msgStreamId) { return false }
        const msgPartition = streamMessage.getStreamPartition()
        if (streamPartition !== msgPartition) { return false }
        return true
    }
}
/**
 * Listen for matching stream messages on connection.
 * Write messages into a Stream.
 */

export default function messageStream(connection, { streamId, streamPartition, isUnicast, type }, onFinally = () => {}) {
    if (!type) {
        // eslint-disable-next-line no-param-reassign
        type = isUnicast ? ControlMessage.TYPES.UnicastMessage : ControlMessage.TYPES.BroadcastMessage
    }

    const isMatchingStreamMessage = getIsMatchingStreamMessage({
        streamId,
        streamPartition
    })

    let msgStream
    // write matching messages to stream
    const onMessage = (msg) => {
        if (!isMatchingStreamMessage(msg)) { return }
        msgStream.push(msg)
    }

    // stream acts as buffer
    msgStream = new PushQueue([], {
        async onEnd(...args) {
            // remove onMessage handler & clean up
            connection.off(type, onMessage)
            await onFinally(...args)
        }
    })

    Object.assign(msgStream, {
        streamId,
        streamPartition,
    })

    connection.on(type, onMessage)

    return msgStream
}
