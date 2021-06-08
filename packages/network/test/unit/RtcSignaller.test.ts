import { EventEmitter } from 'events'
import { TrackerLayer } from 'streamr-client-protocol'

import { PeerInfo } from '../../src/connection/PeerInfo'
import { RtcSignaller } from '../../src/logic/RtcSignaller'
import { Event as TrackerNodeEvent } from '../../src/protocol/TrackerNode'

const { ErrorMessage, RelayMessage } = TrackerLayer

describe('RtcSignaller', () => {
    let peerInfo: PeerInfo
    let trackerNodeMock: any
    let rtcSignaller: RtcSignaller

    beforeEach(() => {
        peerInfo = PeerInfo.newNode('node')
        trackerNodeMock = new EventEmitter()
        rtcSignaller = new RtcSignaller(peerInfo, trackerNodeMock)
    })

    it('invoking onConnectionNeeded delegates to sendRtcConnect on trackerNode', () => {
        trackerNodeMock.sendRtcConnect = jest.fn().mockResolvedValue(true)
        rtcSignaller.sendRtcConnect('router', 'targetNode')
        expect(trackerNodeMock.sendRtcConnect).toHaveBeenCalledWith('router', 'targetNode', peerInfo)
    })

    it('invoking sendRtcIceCandidate delegates to sendRtcIceCandidate on trackerNode', () => {
        trackerNodeMock.sendRtcIceCandidate = jest.fn().mockResolvedValue(true)
        rtcSignaller.sendRtcIceCandidate('router', 'targetNode', 'connectionid', 'candidate', 'mid')
        expect(trackerNodeMock.sendRtcIceCandidate).toHaveBeenCalledWith('router', 'targetNode', 'connectionid', peerInfo, 'candidate', 'mid')
    })

    it('invoking sendRtcOffer delegates to sendRtcOffer on trackerNode', () => {
        trackerNodeMock.sendRtcOffer = jest.fn().mockResolvedValue(true)
        rtcSignaller.sendRtcOffer('router', 'targetNode', 'connectionid', 'description')
        expect(trackerNodeMock.sendRtcOffer).toHaveBeenCalledWith('router', 'targetNode', 'connectionid', peerInfo, 'description')
    })

    it('connectListener invoked when trackerNode emits rtcConnect message', () => {
        const cbFn = jest.fn()
        rtcSignaller.setConnectListener(cbFn)
        trackerNodeMock.emit(
            TrackerNodeEvent.RELAY_MESSAGE_RECEIVED,
            new RelayMessage({
                requestId: '',
                originator: PeerInfo.newNode('originator'),
                targetNode: 'node',
                subType: 'rtcConnect',
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

    it('offerListener invoked when trackerNode emits rtcOffer message', () => {
        const cbFn = jest.fn()
        rtcSignaller.setOfferListener(cbFn)
        trackerNodeMock.emit(
            TrackerNodeEvent.RELAY_MESSAGE_RECEIVED,
            new RelayMessage({
                requestId: '',
                originator: PeerInfo.newNode('originator'),
                targetNode: 'node',
                subType: 'rtcOffer',
                data: {
                    description: 'description'
                }
            }),
            'router'
        )
        expect(cbFn).toHaveBeenCalledWith({
            routerId: 'router',
            originatorInfo: PeerInfo.newNode('originator'),
            description: 'description',
        })
    })

    it('answerListener invoked when trackerNode emits rtcAnswer message', () => {
        const cbFn = jest.fn()
        rtcSignaller.setAnswerListener(cbFn)
        trackerNodeMock.emit(
            TrackerNodeEvent.RELAY_MESSAGE_RECEIVED,
            new RelayMessage({
                requestId: '',
                originator: PeerInfo.newNode('originator'),
                targetNode: 'node',
                subType: 'rtcAnswer',
                data: {
                    description: 'description'
                }
            }),
            'router'
        )
        expect(cbFn).toHaveBeenCalledWith({
            routerId: 'router',
            originatorInfo: PeerInfo.newNode('originator'),
            description: 'description'
        })
    })

    it('iceCandidateListener invoked when trackerNode emits iceCandidate message', () => {
        const cbFn = jest.fn()
        rtcSignaller.setIceCandidateListener(cbFn)
        trackerNodeMock.emit(
            TrackerNodeEvent.RELAY_MESSAGE_RECEIVED,
            new RelayMessage({
                requestId: '',
                originator: PeerInfo.newNode('originator'),
                targetNode: 'node',
                subType: 'iceCandidate',
                data: {
                    candidate: 'candidate',
                    mid: 'mid'
                }
            }),
            'router'
        )
        expect(cbFn).toHaveBeenCalledWith({
            routerId: 'router',
            originatorInfo: PeerInfo.newNode('originator'),
            candidate: 'candidate',
            mid: 'mid'
        })
    })

    it('errorListener invoked when trackerNode emits RTC_ERROR_RECEIVED', () => {
        const cbFn = jest.fn()
        rtcSignaller.setErrorListener(cbFn)
        trackerNodeMock.emit(
            TrackerNodeEvent.RTC_ERROR_RECEIVED,
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
