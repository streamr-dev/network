const { EventEmitter } = require('events')

const { ErrorMessage, RelayMessage } = require('streamr-client-protocol').TrackerLayer

const { PeerInfo } = require('../../src/connection/PeerInfo')
const { RtcSignaller } = require('../../src/logic/RtcSignaller')
const { Event: TrackerNodeEvent } = require('../../src/protocol/TrackerNode')

describe('RtcSignaller', () => {
    let peerInfo
    let trackerNodeMock
    let rtcSignaller

    beforeEach(() => {
        peerInfo = PeerInfo.newNode('node')
        trackerNodeMock = new EventEmitter()
        rtcSignaller = new RtcSignaller(peerInfo, trackerNodeMock)
    })

    it('invoking onConnectionNeeded delegates to sendRtcConnect on trackerNode', () => {
        trackerNodeMock.sendRtcConnect = jest.fn().mockResolvedValue(true)
        rtcSignaller.onConnectionNeeded('router', 'targetNode')
        expect(trackerNodeMock.sendRtcConnect).toHaveBeenCalledWith('router', 'targetNode', peerInfo)
    })

    it('invoking onLocalCandidate delegates to sendLocalCandidate on trackerNode', () => {
        trackerNodeMock.sendLocalCandidate = jest.fn().mockResolvedValue(true)
        rtcSignaller.onLocalCandidate('router', 'targetNode', 'candidate', 'mid')
        expect(trackerNodeMock.sendLocalCandidate).toHaveBeenCalledWith('router', 'targetNode', peerInfo, 'candidate', 'mid')
    })

    it('invoking onLocalDescription delegates to sendLocalDescription on trackerNode', () => {
        trackerNodeMock.sendLocalDescription = jest.fn().mockResolvedValue(true)
        rtcSignaller.onLocalDescription('router', 'targetNode', 'type', 'description')
        expect(trackerNodeMock.sendLocalDescription).toHaveBeenCalledWith('router', 'targetNode', peerInfo, 'type', 'description')
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

    it('remoteCandidateListener invoked when trackerNode emits remoteCandidate message', () => {
        const cbFn = jest.fn()
        rtcSignaller.setRemoteCandidateListener(cbFn)
        trackerNodeMock.emit(
            TrackerNodeEvent.RELAY_MESSAGE_RECEIVED,
            new RelayMessage({
                requestId: '',
                originator: PeerInfo.newNode('originator'),
                targetNode: 'node',
                subType: 'remoteCandidate',
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
