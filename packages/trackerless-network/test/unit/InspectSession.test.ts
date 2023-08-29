import { PeerID } from '@streamr/dht'
import { InspectSession, Events } from '../../src/logic/inspect/InspectSession'
import { MessageID } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { waitForEvent3 } from '../../../utils/dist/src/waitForEvent3'
import { utf8ToBinary } from '../../src/logic/utils'
import { NodeID } from '../../src/identifiers'

describe('InspectSession', () => {

    let inspectSession: InspectSession
    let inspectedPeer: NodeID
    let anotherPeer: NodeID

    const publisherId = utf8ToBinary('publisherId')
    const messageId1: MessageID = {
        streamId: 'stream',
        messageChainId: 'messageChain0',
        streamPartition: 0,
        sequenceNumber: 0,
        timestamp: 12345,
        publisherId
    }

    const messageId2: MessageID = {
        streamId: 'stream',
        messageChainId: 'messageChain1',
        streamPartition: 0,
        sequenceNumber: 0,
        timestamp: 12345,
        publisherId
    }

    beforeEach(() => {
        inspectedPeer = PeerID.fromString('inspectedPeer').toKey() as unknown as NodeID
        anotherPeer = PeerID.fromString('anotherPeer').toKey() as unknown as NodeID
        inspectSession = new InspectSession({
            inspectedPeer
        })
    })

    afterEach(() => {
        inspectSession.stop()
    })

    it('should mark message', () => {
        inspectSession.markMessage(inspectedPeer, messageId1)
        expect(inspectSession.getInspectedMessageCount()).toBe(1)
        inspectSession.markMessage(inspectedPeer, messageId2)
        expect(inspectSession.getInspectedMessageCount()).toBe(2)
    })

    it('should emit done event when inspected peer sends seen message', async () => {
        inspectSession.markMessage(anotherPeer, messageId1)
        await Promise.all([
            waitForEvent3<Events>(inspectSession, 'done', 100),
            inspectSession.markMessage(inspectedPeer, messageId1)
        ])
        expect(inspectSession.getInspectedMessageCount()).toBe(1)
    })

    it('should emit done event another peer sends message after inspected peer', async () => {
        inspectSession.markMessage(inspectedPeer, messageId1)
        await Promise.all([
            waitForEvent3<Events>(inspectSession, 'done', 100),
            inspectSession.markMessage(anotherPeer, messageId1)
        ])
        expect(inspectSession.getInspectedMessageCount()).toBe(1)
    })

    it('should not emit done if messageIds do not match', async () => {
        inspectSession.markMessage(inspectedPeer, messageId1)
        await expect(async () => {
            await Promise.all([
                waitForEvent3<Events>(inspectSession, 'done', 100),
                inspectSession.markMessage(anotherPeer, messageId2)
            ])
        }).rejects.toThrow('waitForEvent3')
        
        expect(inspectSession.getInspectedMessageCount()).toBe(2)
    })
})
