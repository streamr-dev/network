const TrackerNode = require('../protocol/TrackerNode')
const getLogger = require('../helpers/logger')
const { SUB_TYPES } = require('../protocol/RtcMessages')

module.exports = class RtcSignaller {
    constructor(peerInfo, trackerNode) {
        this.peerInfo = peerInfo
        this.trackerNode = trackerNode
        this.offerListener = null
        this.answerListener = null
        this.connectListener = null
        this.errorListener = null
        this.remoteCandidateListener = null
        this.logger = getLogger(`streamr:RtcSignaller:${peerInfo.peerId}`)

        trackerNode.on(TrackerNode.events.RELAY_MESSAGE_RECEIVED, (relayMessage, source) => {
            const { originator, targetNode, subType, data } = relayMessage
            if (subType === SUB_TYPES.RTC_OFFER) {
                this.offerListener({
                    routerId: source,
                    originatorInfo: originator,
                    description: data.description
                })
            } else if (subType === SUB_TYPES.RTC_ANSWER) {
                this.answerListener({
                    routerId: source,
                    originatorInfo: originator,
                    description: data.description,
                })
            } else if (subType === SUB_TYPES.REMOTE_CANDIDATE) {
                this.remoteCandidateListener({
                    routerId: source,
                    originatorInfo: originator,
                    candidate: data.candidate,
                    mid: data.mid
                })
            } else if (subType === SUB_TYPES.RTC_CONNECT) {
                this.connectListener({
                    routerId: source,
                    targetNode,
                    originatorInfo: originator
                })
            } else {
                this.logger.warn('Unrecognized subtype %s with contents %o', subType, relayMessage)
            }
        })
        trackerNode.on(TrackerNode.events.RTC_ERROR_RECEIVED, (message, source) => {
            this.errorListener({
                routerId: source,
                targetNode: message.targetNode,
                errorCode: message.errorCode
            })
        })
    }

    onLocalDescription(routerId, targetPeerId, type, description) {
        this.trackerNode.sendLocalDescription(routerId, targetPeerId, this.peerInfo, type, description)
            .catch((err) => {
                this.logger.debug('Failed to sendLocalDescription via %s due to %s', routerId, err) // TODO: better?
            })
    }

    onLocalCandidate(routerId, targetPeerId, candidate, mid) {
        this.trackerNode.sendLocalCandidate(routerId, targetPeerId, this.peerInfo, candidate, mid)
            .catch((err) => {
                this.logger.debug('Failed to sendLocalCandidate via %s due to %s', routerId, err) // TODO: better?
            })
    }

    onConnectionNeeded(routerId, targetPeerId) {
        this.trackerNode.sendRtcConnect(routerId, targetPeerId, this.peerInfo)
            .catch((err) => {
                this.logger.debug('Failed to sendRtcConnect via %s due to %s', routerId, err) // TODO: better?
            })
    }

    setOfferListener(fn) {
        this.offerListener = fn
    }

    setAnswerListener(fn) {
        this.answerListener = fn
    }

    setRemoteCandidateListener(fn) {
        this.remoteCandidateListener = fn
    }

    setErrorListener(fn) {
        this.errorListener = fn
    }

    setConnectListener(fn) {
        this.connectListener = fn
    }
}
