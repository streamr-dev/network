import { TrackerServer, Event as TrackerServerEvent } from '../protocol/TrackerServer'
import { UnknownPeerError } from '@streamr/network-node'
import { Logger } from '@streamr/utils'
import { RelayMessage } from '@streamr/protocol'

const logger = new Logger(module)

export function attachMessageRelaying(trackerServer: TrackerServer): void {
    trackerServer.on(TrackerServerEvent.RELAY_MESSAGE_RECEIVED, async (relayMessage: RelayMessage, _source: string) => {
        const { subType, requestId, originator, targetNode } = relayMessage
        // TODO: validate that source === originator
        try {
            await trackerServer.send(relayMessage.targetNode, relayMessage)
        } catch (err) {
            if (err.code === UnknownPeerError.CODE) {
                trackerServer.sendUnknownPeerError(originator.peerId, requestId, targetNode)
                    .catch((err) => {
                        logger.error('Failed to send UNKNOWN_PEER error response', {
                            err,
                            destination: originator.peerId,
                            unknownPeerId: targetNode
                        })
                    })
            } else {
                logger.warn('Failed to relay message', {
                    subType,
                    targetNode,
                    err
                })
            }
        }
    })
}
