import { TrackerServer, Event as TrackerServerEvent } from '../protocol/TrackerServer'
import { NotFoundInPeerBookError } from '../connection/PeerBook'
import { RtcIceCandidateMessage, RtcOfferMessage, RtcAnswerMessage, RelayMessage, RtcConnectMessage } from '../identifiers'
import { RtcSubTypes } from './RtcMessage'
import { Logger } from "../helpers/Logger"

export function attachRtcSignalling(trackerServer: TrackerServer): void {
    if (!(trackerServer instanceof TrackerServer)) {
        throw new Error('trackerServer not instance of TrackerServer')
    }

    const logger = new Logger(module)

    function handleRtcOffer({ requestId, originator, targetNode, data }: RtcOfferMessage & RelayMessage) {
        trackerServer.sendRtcOffer(
            targetNode,
            requestId,
            originator,
            data.connectionId,
            data.description
        ).catch((err: Error) => {
            logger.debug('failed to sendRtcOffer to %s due to %s', targetNode, err) // TODO: better?
        })
    }

    function handleRtcAnswer({ requestId, originator, targetNode, data }: RtcAnswerMessage & RelayMessage) {
        trackerServer.sendRtcAnswer(
            targetNode,
            requestId,
            originator,
            data.connectionId,
            data.description
        ).catch((err: Error) => {
            logger.debug('failed to sendRtcAnswer to %s due to %s', targetNode, err) // TODO: better?
        })
    }

    function handleIceCandidate({ requestId, originator, targetNode, data }: RtcIceCandidateMessage & RelayMessage) {
        trackerServer.sendRtcIceCandidate(
            targetNode,
            requestId,
            originator,
            data.connectionId,
            data.candidate,
            data.mid
        ).catch((err: Error) => {
            logger.debug('failed to sendRemoteCandidate to %s due to %s', targetNode, err) // TODO: better?
        })
    }

    function handleRtcConnect({ requestId, originator, targetNode }: RtcConnectMessage & RelayMessage) {
        trackerServer.sendRtcConnect(targetNode, requestId, originator).catch((err: Error) => {
            logger.debug('Failed to sendRtcConnect to %s due to %s', targetNode, err) // TODO: better?
        })
    }

    trackerServer.on(TrackerServerEvent.RELAY_MESSAGE_RECEIVED, (relayMessage: RelayMessage, _source: string) => {
        const {
            subType,
            requestId,
            originator,
            targetNode,
        } = relayMessage
        // TODO: validate that source === originator
        try {
            if (relayMessage.subType === RtcSubTypes.RTC_OFFER) {
                handleRtcOffer(relayMessage)
            } else if (relayMessage.subType === RtcSubTypes.RTC_ANSWER) {
                handleRtcAnswer(relayMessage)
            } else if (relayMessage.subType === RtcSubTypes.ICE_CANDIDATE) {
                handleIceCandidate(relayMessage)
            } else if (relayMessage.subType === RtcSubTypes.RTC_CONNECT) {
                handleRtcConnect(relayMessage)
            } else {
                logger.warn('unrecognized RelayMessage subType %s with contents %o', subType, relayMessage)
            }
        } catch (err) {
            if (err instanceof NotFoundInPeerBookError) {
                trackerServer.sendUnknownPeerRtcError(originator.peerId, requestId, targetNode)
                    .catch((e) => logger.error('failed to sendUnknownPeerRtcError, reason: %s', e))
            } else {
                throw err
            }
        }
    })
}
