import { ControlMessage, ControlMessageType, StreamMessage } from 'streamr-client-protocol'
import Connection from '../Connection'

import PushQueue from '../utils/PushQueue'

function getIsMatchingStreamMessage({ streamId, streamPartition = 0 }: {
    streamId: string,
    streamPartition?: number,
}) {
    return function isMatchingStreamMessage({ streamMessage }: { streamMessage: StreamMessage }) {
        const msgStreamId = streamMessage.getStreamId()
        if (streamId !== msgStreamId) { return false }
        const msgPartition = streamMessage.getStreamPartition()
        if (streamPartition !== msgPartition) { return false }
        return true
    }
}

/**
 * Listen for matching stream messages on connection.
 * Returns a PushQueue that will fill with messages.
 */

export default function messageStream(connection: Connection, {
    streamId,
    streamPartition,
    isUnicast = false,
    type,
}: {
    streamId: string,
    streamPartition: number,
    isUnicast: boolean,
    type?: ControlMessageType
}, onFinally: ((err?: Error) => void | Promise<void>) = async () => {}) {
    const messageType = String(!type
        ? (isUnicast ? ControlMessage.TYPES.UnicastMessage : ControlMessage.TYPES.BroadcastMessage)!
        : type)

    const isMatchingStreamMessage = getIsMatchingStreamMessage({
        streamId,
        streamPartition
    })

    let msgStream
    // write matching messages to stream
    const onMessage = (msg: { streamMessage: StreamMessage }) => {
        if (!isMatchingStreamMessage(msg)) { return }
        msgStream.push(msg)
    }

    // stream acts as buffer
    msgStream = new PushQueue([], {
        async onEnd(err?: Error) {
            // remove onMessage handler & clean up
            connection.off(messageType, onMessage)
            await onFinally(err)
        }
    })

    Object.assign(msgStream, {
        streamId,
        streamPartition,
    })

    connection.on(messageType, onMessage)

    return msgStream
}

export type MessageStream = ReturnType<typeof messageStream>
