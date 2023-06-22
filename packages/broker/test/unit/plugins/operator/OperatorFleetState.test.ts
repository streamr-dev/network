import { OperatorFleetState } from '../../../../src/plugins/operator/OperatorFleetState'
import { mock, MockProxy } from 'jest-mock-extended'
import StreamrClient, { MessageListener, Subscription } from 'streamr-client'
import { toEthereumAddress, wait } from '@streamr/utils'
import { toStreamID } from '@streamr/protocol'
import { eventsWithArgsToArray } from '@streamr/test-utils'

const ADDRESS = toEthereumAddress('0x61BBf708Fb7bB1D4dA10D1958C88A170988d3d1F')
const coordinationStreamId = toStreamID('/operator/coordination', ADDRESS)

describe(OperatorFleetState, () => {
    let streamrClient: MockProxy<StreamrClient>
    let subscription: MockProxy<Subscription>
    let currentTime: number
    let state: OperatorFleetState
    let capturedOnMessage: MessageListener

    async function incrementTimeAndPublishMessage(msg: Record<string, unknown>) {
        currentTime += 1
        capturedOnMessage(msg, {} as any)
        await wait(0)
    }

    beforeEach(() => {
        streamrClient = mock<StreamrClient>()
        subscription = mock<Subscription>()
        streamrClient.subscribe.mockImplementation(async (_options, onMessage) => {
            capturedOnMessage = onMessage!
            return subscription
        })
        currentTime = 0
        state = new OperatorFleetState(streamrClient, coordinationStreamId, () => currentTime, 100)
    })

    afterEach(() => {
        state?.destroy()
    })

    it('cannot double start', async () => {
        await state.start()
        await expect(() => state.start()).rejects.toEqual(new Error('already started'))
    })

    it('unsubscribes on destroy', async () => {
        await state.start()
        await state.destroy()
        expect(subscription.unsubscribe).toHaveBeenCalledTimes(1)
    })

    it('can handle invalid messages in coordination stream', async () => {
        await state.start()
        await incrementTimeAndPublishMessage({ foo: 'bar', 'lorem': 666 })
        await incrementTimeAndPublishMessage({})
        expect(state.getNodeIds()).toEqual([])
    })

    it('handles new nodes emerging', async () => {
        const events = eventsWithArgsToArray(state as any, ['added', 'removed'])
        await state.start()

        currentTime = 1
        capturedOnMessage({ msgType: 'heartbeat', nodeId: 'a' })
        currentTime = 2
        capturedOnMessage({ msgType: 'heartbeat', nodeId: 'b' })
        currentTime = 2
        capturedOnMessage({ msgType: 'heartbeat', nodeId: 'c' })
    })
})
