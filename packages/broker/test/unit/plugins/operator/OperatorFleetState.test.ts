import { OperatorFleetState } from '../../../../src/plugins/operator/OperatorFleetState'
import { mock, MockProxy } from 'jest-mock-extended'
import StreamrClient, { MessageListener, Subscription } from 'streamr-client'
import { toEthereumAddress, wait, waitForCondition, waitForEvent } from '@streamr/utils'
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

    async function setTimeAndPublishMessage(msg: Record<string, unknown>, time: number): Promise<void> {
        currentTime = time
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
        state = new OperatorFleetState(streamrClient, coordinationStreamId, () => currentTime, 10, 100)
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
        await setTimeAndPublishMessage({ foo: 'bar', 'lorem': 666 }, 10)
        await setTimeAndPublishMessage({}, 10)
        expect(state.getNodeIds()).toEqual([])
    })

    it('handles nodes coming online', async () => {
        const events = eventsWithArgsToArray(state as any, ['added', 'removed'])
        await state.start()

        await setTimeAndPublishMessage({ msgType: 'heartbeat', nodeId: 'a' }, 10)
        await setTimeAndPublishMessage({ msgType: 'heartbeat', nodeId: 'b' }, 10)
        await setTimeAndPublishMessage({ msgType: 'heartbeat', nodeId: 'c' }, 10)
        await setTimeAndPublishMessage({ msgType: 'heartbeat', nodeId: 'a' }, 15)
        await setTimeAndPublishMessage({ msgType: 'heartbeat', nodeId: 'a' }, 15)

        expect(state.getNodeIds()).toEqual(['a', 'b', 'c'])
        expect(events).toEqual([
            ['added', 'a'],
            ['added', 'b'],
            ['added', 'c']
        ])
    })

    it('handles node going offline', async () => {
        const events = eventsWithArgsToArray(state as any, ['added', 'removed'])
        await state.start()

        await setTimeAndPublishMessage({ msgType: 'heartbeat', nodeId: 'a' }, 5)
        await setTimeAndPublishMessage({ msgType: 'heartbeat', nodeId: 'b' }, 5)
        await setTimeAndPublishMessage({ msgType: 'heartbeat', nodeId: 'c' }, 5)
        await setTimeAndPublishMessage({ msgType: 'heartbeat', nodeId: 'd' }, 10)
        await setTimeAndPublishMessage({ msgType: 'heartbeat', nodeId: 'c' }, 10)
        await setTimeAndPublishMessage({ msgType: 'heartbeat', nodeId: 'e' }, 19)

        await waitForCondition(() => state.getNodeIds().length <= 3)
        expect(state.getNodeIds()).toEqual(['c', 'd', 'e'])
        expect(events).toEqual([
            ['added', 'a'],
            ['added', 'b'],
            ['added', 'c'],
            ['added', 'd'],
            ['added', 'e'],
            ['removed', 'a'],
            ['removed', 'b']
        ])
    })

    it('nodes can go and come back up again', async () => {
        await state.start()

        await setTimeAndPublishMessage({ msgType: 'heartbeat', nodeId: 'a' }, 5)
        await setTimeAndPublishMessage({ msgType: 'heartbeat', nodeId: 'b' }, 5)
        expect(state.getNodeIds()).toEqual(['a', 'b'])

        await setTimeAndPublishMessage({ msgType: 'heartbeat', nodeId: 'b' }, 15)
        await waitForEvent(state as any, 'removed')
        expect(state.getNodeIds()).toEqual(['b'])

        await setTimeAndPublishMessage({ msgType: 'heartbeat', nodeId: 'a' }, 18)
        expect(state.getNodeIds()).toEqual(['b', 'a'])

        currentTime = 30
        await waitForEvent(state as any, 'removed')
        expect(state.getNodeIds()).toEqual([])
    })
})
