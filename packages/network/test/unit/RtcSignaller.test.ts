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
        rtcSignaller.onLocalDescription('router', 'targetNode', 'type' as any, 'description')
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
        const originator = PeerInfo.newNode('originator')

        expect(cbFn).toHaveBeenCalledWith({
            routerId: 'router',
            originatorInfo: expect.objectContaining({
                peerId: originator.peerId,
                peerType: originator.peerType,
                controlLayerVersions: originator.controlLayerVersions,
                messageLayerVersions: originator.messageLayerVersions,
                peerName: originator.peerName,
                location: originator.location,        
            }),
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
        const originator = PeerInfo.newNode('originator')

        expect(cbFn).toHaveBeenCalledWith({
            routerId: 'router',
            originatorInfo: expect.objectContaining({
                peerId: originator.peerId,
                peerType: originator.peerType,
                controlLayerVersions: originator.controlLayerVersions,
                messageLayerVersions: originator.messageLayerVersions,
                peerName: originator.peerName,
                location: originator.location,        
            }),
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
        const originator = PeerInfo.newNode('originator')

        expect(cbFn).toHaveBeenCalledWith({
            routerId: 'router',
            originatorInfo: expect.objectContaining({
                peerId: originator.peerId,
                peerType: originator.peerType,
                controlLayerVersions: originator.controlLayerVersions,
                messageLayerVersions: originator.messageLayerVersions,
                peerName: originator.peerName,
                location: originator.location,        
            }),
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

        const originator = PeerInfo.newNode('originator')
       

        expect(cbFn).toHaveBeenCalledWith({
            routerId: 'router',
            originatorInfo: expect.objectContaining({
                peerId: originator.peerId,
                peerType: originator.peerType,
                controlLayerVersions: originator.controlLayerVersions,
                messageLayerVersions: originator.messageLayerVersions,
                peerName: originator.peerName,
                location: originator.location,        
            }),
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
