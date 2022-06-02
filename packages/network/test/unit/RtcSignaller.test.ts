import { EventEmitter } from 'events'
import { RelayMessageSubType, TrackerLayer } from 'streamr-client-protocol'

import { PeerInfo } from '../../src/connection/PeerInfo'
import { RtcSignaller } from '../../src/logic/RtcSignaller'
import { Event as NodeToTrackerEvent } from '../../src/protocol/NodeToTracker'

const { ErrorMessage, RelayMessage } = TrackerLayer

describe('RtcSignaller', () => {
    let peerInfo: PeerInfo
    let nodeToTrackerMock: any
    let rtcSignaller: RtcSignaller

    beforeEach(() => {
        peerInfo = PeerInfo.newNode('node')
        nodeToTrackerMock = new EventEmitter()
        rtcSignaller = new RtcSignaller(peerInfo, nodeToTrackerMock)
    })

    it('invoking onConnectionNeeded delegates to sendRtcConnect on nodeToTracker', () => {
        nodeToTrackerMock.sendRtcConnect = jest.fn().mockResolvedValue(true)
        rtcSignaller.sendRtcConnect('router', 'targetNode')
        expect(nodeToTrackerMock.sendRtcConnect).toHaveBeenCalledWith('router', 'targetNode', peerInfo)
    })

    it('invoking sendRtcIceCandidate delegates to sendRtcIceCandidate on nodeToTracker', () => {
        nodeToTrackerMock.sendRtcIceCandidate = jest.fn().mockResolvedValue(true)
        rtcSignaller.sendRtcIceCandidate('router', 'targetNode', 'connectionid', 'candidate', 'mid')
        expect(nodeToTrackerMock.sendRtcIceCandidate).toHaveBeenCalledWith('router', 'targetNode', 'connectionid', peerInfo, 'candidate', 'mid')
    })

    it('invoking sendRtcOffer delegates to sendRtcOffer on nodeToTracker', () => {
        nodeToTrackerMock.sendRtcOffer = jest.fn().mockResolvedValue(true)
        rtcSignaller.sendRtcOffer('router', 'targetNode', 'connectionid', 'description')
        expect(nodeToTrackerMock.sendRtcOffer).toHaveBeenCalledWith('router', 'targetNode', 'connectionid', peerInfo, 'description')
    })

    it('connectListener invoked when nodeToTracker emits rtcConnect message', () => {
        const cbFn = jest.fn()
        rtcSignaller.setConnectListener(cbFn)
        nodeToTrackerMock.emit(
            NodeToTrackerEvent.RELAY_MESSAGE_RECEIVED,
            new RelayMessage({
                requestId: '',
                originator: PeerInfo.newNode('originator'),
                targetNode: 'node',
                subType: RelayMessageSubType.RTC_CONNECT,
                data: {}
            }),
            'router'
        )
        expect(cbFn).toHaveBeenCalledWith({
            routerId: 'router',
            originatorInfo: PeerInfo.newNode('originator'),
            targetNode: 'node'
        })
    })

    it('offerListener invoked when nodeToTracker emits rtcOffer message', () => {
        const cbFn = jest.fn()
        rtcSignaller.setOfferListener(cbFn)
        nodeToTrackerMock.emit(
            NodeToTrackerEvent.RELAY_MESSAGE_RECEIVED,
            new RelayMessage({
                requestId: '',
                originator: PeerInfo.newNode('originator'),
                targetNode: 'node',
                subType: RelayMessageSubType.RTC_OFFER,
                data: {
                    connectionId: 'connectionId',
                    description: 'description'
                }
            }),
            'router'
        )
        expect(cbFn).toHaveBeenCalledWith({
            routerId: 'router',
            originatorInfo: PeerInfo.newNode('originator'),
            connectionId: 'connectionId',
            description: 'description',
        })
    })

    it('answerListener invoked when nodeToTracker emits rtcAnswer message', () => {
        const cbFn = jest.fn()
        rtcSignaller.setAnswerListener(cbFn)
        nodeToTrackerMock.emit(
            NodeToTrackerEvent.RELAY_MESSAGE_RECEIVED,
            new RelayMessage({
                requestId: '',
                originator: PeerInfo.newNode('originator'),
                targetNode: 'node',
                subType: RelayMessageSubType.RTC_ANSWER,
                data: {
                    connectionId: 'connectionId',
                    description: 'description'
                }
            }),
            'router'
        )
        expect(cbFn).toHaveBeenCalledWith({
            routerId: 'router',
            originatorInfo: PeerInfo.newNode('originator'),
            connectionId: 'connectionId',
            description: 'description'
        })
    })

    it('iceCandidateListener invoked when nodeToTracker emits iceCandidate message', () => {
        const cbFn = jest.fn()
        rtcSignaller.setIceCandidateListener(cbFn)
        nodeToTrackerMock.emit(
            NodeToTrackerEvent.RELAY_MESSAGE_RECEIVED,
            new RelayMessage({
                requestId: '',
                originator: PeerInfo.newNode('originator'),
                targetNode: 'node',
                subType: RelayMessageSubType.ICE_CANDIDATE,
                data: {
                    connectionId: 'connectionId',
                    candidate: 'candidate',
                    mid: 'mid'
                }
            }),
            'router'
        )
        expect(cbFn).toHaveBeenCalledWith({
            routerId: 'router',
            originatorInfo: PeerInfo.newNode('originator'),
            connectionId: 'connectionId',
            candidate: 'candidate',
            mid: 'mid'
        })
    })

    it('errorListener invoked when nodeToTracker emits RTC_ERROR_RECEIVED', () => {
        const cbFn = jest.fn()
        rtcSignaller.setErrorListener(cbFn)
        nodeToTrackerMock.emit(
            NodeToTrackerEvent.RTC_ERROR_RECEIVED,
            new ErrorMessage({
                requestId: '',
                targetNode: 'unknownTargetNode',
                errorCode: ErrorMessage.ERROR_CODES.RTC_UNKNOWN_PEER,
            }),
            'router'
        )
        expect(cbFn).toHaveBeenCalledWith({
            routerId: 'router',
            targetNode: 'unknownTargetNode',
            errorCode: ErrorMessage.ERROR_CODES.RTC_UNKNOWN_PEER
        })
    })
})
