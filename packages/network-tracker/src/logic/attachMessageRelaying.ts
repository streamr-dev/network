import { TrackerServer, Event as TrackerServerEvent } from '../protocol/TrackerServer'
import { UnknownPeerError, Logger } from 'streamr-network'
import { RelayMessage } from 'streamr-client-protocol'

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
                    .catch((e) => {
                        logger.error('failed to sendUnknownPeerError, reason: %s', e)
                    })
            } else {
                logger.warn('failed to relay message %s to %s, reason: %s', subType, targetNode, err)
            }
        }
    })
}
