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

    async function setTimeAndPublishMessage(time: number, msg: Record<string, unknown>): Promise<void> {
        currentTime = time
        capturedOnMessage(msg, {} as any)
        await wait(0) // let event handlers fire
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
        await setTimeAndPublishMessage(10, { foo: 'bar', 'lorem': 666 })
        await setTimeAndPublishMessage(10, {})
        expect(state.getNodeIds()).toEqual([])
    })

    it('handles nodes coming online', async () => {
        const events = eventsWithArgsToArray(state as any, ['added', 'removed'])
        await state.start()

        await setTimeAndPublishMessage(10, { msgType: 'heartbeat', nodeId: 'a' })
        await setTimeAndPublishMessage(10, { msgType: 'heartbeat', nodeId: 'b' })
        await setTimeAndPublishMessage(10, { msgType: 'heartbeat', nodeId: 'c' })
        await setTimeAndPublishMessage(15, { msgType: 'heartbeat', nodeId: 'a' })
        await setTimeAndPublishMessage(15, { msgType: 'heartbeat', nodeId: 'a' })

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

        await setTimeAndPublishMessage(5, { msgType: 'heartbeat', nodeId: 'a' })
        await setTimeAndPublishMessage(5, { msgType: 'heartbeat', nodeId: 'b' })
        await setTimeAndPublishMessage(5, { msgType: 'heartbeat', nodeId: 'c' })
        await setTimeAndPublishMessage(10, { msgType: 'heartbeat', nodeId: 'd' })
        await setTimeAndPublishMessage(10, { msgType: 'heartbeat', nodeId: 'c' })
        await setTimeAndPublishMessage(19, { msgType: 'heartbeat', nodeId: 'e' })

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

        await setTimeAndPublishMessage(5, { msgType: 'heartbeat', nodeId: 'a' })
        await setTimeAndPublishMessage(5, { msgType: 'heartbeat', nodeId: 'b' })
        expect(state.getNodeIds()).toEqual(['a', 'b'])

        await setTimeAndPublishMessage(15, { msgType: 'heartbeat', nodeId: 'b' })
        await waitForEvent(state as any, 'removed')
        expect(state.getNodeIds()).toEqual(['b'])

        await setTimeAndPublishMessage(18, { msgType: 'heartbeat', nodeId: 'a' })
        expect(state.getNodeIds()).toEqual(['b', 'a'])

        currentTime = 30
        await waitForEvent(state as any, 'removed')
        expect(state.getNodeIds()).toEqual([])
    })
})
