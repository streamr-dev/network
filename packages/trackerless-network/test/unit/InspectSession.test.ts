import { InspectSession } from '../../src/content-delivery-layer/inspection/InspectSession'
import { MessageID } from '../../generated/packages/trackerless-network/protos/NetworkRpc'
import { utf8ToBinary, waitForEvent } from '@streamr/utils'
import { DhtAddress, randomDhtAddress } from '@streamr/dht'

describe('InspectSession', () => {

    let inspectSession: InspectSession
    let inspectedNode: DhtAddress
    let anotherNode: DhtAddress

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
        inspectedNode = randomDhtAddress()
        anotherNode = randomDhtAddress()
        inspectSession = new InspectSession({
            inspectedNode
        })
    })

    afterEach(() => {
        inspectSession.stop()
    })

    it('should mark message', () => {
        inspectSession.markMessage(inspectedNode, messageId1)
        expect(inspectSession.getInspectedMessageCount()).toBe(1)
        inspectSession.markMessage(inspectedNode, messageId2)
        expect(inspectSession.getInspectedMessageCount()).toBe(2)
    })

    it('should emit done event when inspected node sends seen message', async () => {
        inspectSession.markMessage(anotherNode, messageId1)
        await Promise.all([
            waitForEvent(inspectSession, 'done', 100),
            // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression, @typescript-eslint/await-thenable
            inspectSession.markMessage(inspectedNode, messageId1)
        ])
        expect(inspectSession.getInspectedMessageCount()).toBe(1)
    })

    it('should emit done event another node sends message after inspected node', async () => {
        inspectSession.markMessage(inspectedNode, messageId1)
        await Promise.all([
            waitForEvent(inspectSession, 'done', 100),
            // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression, @typescript-eslint/await-thenable
            inspectSession.markMessage(anotherNode, messageId1)
        ])
        expect(inspectSession.getInspectedMessageCount()).toBe(1)
    })

    it('should not emit done if messageIds do not match', async () => {
        inspectSession.markMessage(inspectedNode, messageId1)
        await expect(async () => {
            await Promise.all([
                waitForEvent(inspectSession, 'done', 100),
                // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression, @typescript-eslint/await-thenable
                inspectSession.markMessage(anotherNode, messageId2)
            ])
        }).rejects.toThrow('waitForEvent')
        
        expect(inspectSession.getInspectedMessageCount()).toBe(2)
    })
})
