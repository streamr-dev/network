import { PeerIDKey, PeerID } from '@streamr/dht'
import { InspectSession, Events } from '../../src/logic/inspect/InspectSession'
import { MessageRef } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { waitForEvent3 } from '../../../utils/dist/src/waitForEvent3'

describe('InspectSession', () => {

    let inspectSession: InspectSession
    let inspectedPeer: PeerIDKey
    let anotherPeer: PeerIDKey

    const publisherId = new TextEncoder().encode('publisherId')
    const messageRef1: MessageRef = {
        streamId: 'stream',
        messageChainId: 'messageChain0',
        streamPartition: 0,
        sequenceNumber: 0,
        timestamp: 12345,
        publisherId
    }

    const messageRef2: MessageRef = {
        streamId: 'stream',
        messageChainId: 'messageChain1',
        streamPartition: 0,
        sequenceNumber: 0,
        timestamp: 12345,
        publisherId
    }

    beforeEach(() => {
        inspectedPeer = PeerID.fromString('inspectedPeer').toKey()
        anotherPeer = PeerID.fromString('anotherPeer').toKey()
        inspectSession = new InspectSession({
            inspectedPeer
        })
    })

    afterEach(() => {
        inspectSession.stop()
    })

    it('should mark message', () => {
        inspectSession.markMessage(inspectedPeer, messageRef1)
        expect(inspectSession.getInspectedMessageCount()).toBe(1)
        inspectSession.markMessage(inspectedPeer, messageRef2)
        expect(inspectSession.getInspectedMessageCount()).toBe(2)
    })

    it('should emit done event when inspected peer sends seen message', async () => {
        inspectSession.markMessage(anotherPeer, messageRef1)
        await Promise.all([
            waitForEvent3<Events>(inspectSession, 'done', 100),
            inspectSession.markMessage(inspectedPeer, messageRef1)
        ])
        expect(inspectSession.getInspectedMessageCount()).toBe(1)
    })

    it('should emit done event another peer sends message after inspected peer', async () => {
        inspectSession.markMessage(inspectedPeer, messageRef1)
        await Promise.all([
            waitForEvent3<Events>(inspectSession, 'done', 100),
            inspectSession.markMessage(anotherPeer, messageRef1)
        ])
        expect(inspectSession.getInspectedMessageCount()).toBe(1)
    })

    it('should not emit done if messageRefs do not match', async () => {
        inspectSession.markMessage(inspectedPeer, messageRef1)
        await expect(async () => {
            await Promise.all([
                waitForEvent3<Events>(inspectSession, 'done', 100),
                inspectSession.markMessage(anotherPeer, messageRef2)
            ])
        }).rejects.toThrow('waitForEvent3')
        
        expect(inspectSession.getInspectedMessageCount()).toBe(2)
    })
})
