import { DhtAddress } from '@streamr/dht'
import { eventsWithArgsToArray, randomEthereumAddress } from '@streamr/test-utils'
import { wait, until, waitForEvent } from '@streamr/utils'
import { mock, MockProxy } from 'jest-mock-extended'
import { MessageListener, StreamrClient, Subscription } from '@streamr/sdk'
import { formCoordinationStreamId } from '../../../../src/plugins/operator/formCoordinationStreamId'
import { createHeartbeatMessage } from '../../../../src/plugins/operator/heartbeatUtils'
import { OperatorFleetState } from '../../../../src/plugins/operator/OperatorFleetState'

const ADDRESS = randomEthereumAddress()
const coordinationStreamId = formCoordinationStreamId(ADDRESS)

const READY_WAIT_MS = 500
const JITTER = 100

function createHeartbeatMsg(nodeId: string): Record<string, unknown> {
    return createHeartbeatMessage({ nodeId })
}

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
        const createOperatorFleetState = OperatorFleetState.createOperatorFleetStateBuilder(
            streamrClient,
            READY_WAIT_MS,
            10,
            100,
            0,
            0,
            () => currentTime
        )
        state = createOperatorFleetState(coordinationStreamId)
    })

    afterEach(() => {
        state.destroy()
    })

    it('cannot double start', async () => {
        await state.start()
        await expect(() => state.start()).rejects.toEqual(new Error('already started'))
    })

    it('subscribes to coordination stream', async () => {
        await state.start()
        expect(streamrClient.subscribe).toHaveBeenCalledWith(coordinationStreamId, expect.anything())
    })

    it('unsubscribes on destroy', async () => {
        await state.start()
        await state.destroy()
        expect(subscription.unsubscribe).toHaveBeenCalledTimes(1)
    })

    it('can handle invalid messages in coordination stream', async () => {
        await state.start()
        await setTimeAndPublishMessage(10, { foo: 'bar', lorem: 666 })
        await setTimeAndPublishMessage(10, {})
        expect(state.getNodeIds()).toEqual([])
    })

    it('ignores non-heartbeat messages', async () => {
        await state.start()
        await setTimeAndPublishMessage(10, { ...createHeartbeatMsg('a'), msgType: 'somethingElse' })
        expect(state.getNodeIds()).toEqual([])
    })

    it('handles nodes coming online', async () => {
        const events = eventsWithArgsToArray(state as any, ['added', 'removed'])
        await state.start()

        await setTimeAndPublishMessage(10, createHeartbeatMsg('a'))
        await setTimeAndPublishMessage(10, createHeartbeatMsg('b'))
        await setTimeAndPublishMessage(10, createHeartbeatMsg('c'))
        await setTimeAndPublishMessage(15, createHeartbeatMsg('a'))
        await setTimeAndPublishMessage(15, createHeartbeatMsg('a'))

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

        await setTimeAndPublishMessage(5, createHeartbeatMsg('a'))
        await setTimeAndPublishMessage(5, createHeartbeatMsg('b'))
        await setTimeAndPublishMessage(5, createHeartbeatMsg('c'))
        await setTimeAndPublishMessage(10, createHeartbeatMsg('d'))
        await setTimeAndPublishMessage(10, createHeartbeatMsg('c'))
        await setTimeAndPublishMessage(19, createHeartbeatMsg('e'))

        await until(() => state.getNodeIds().length <= 3)
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

        await setTimeAndPublishMessage(5, createHeartbeatMsg('a'))
        await setTimeAndPublishMessage(5, createHeartbeatMsg('b'))
        expect(state.getNodeIds()).toEqual(['a', 'b'])

        await setTimeAndPublishMessage(15, createHeartbeatMsg('b'))
        await waitForEvent(state as any, 'removed')
        expect(state.getNodeIds()).toEqual(['b'])

        await setTimeAndPublishMessage(18, createHeartbeatMsg('a'))
        expect(state.getNodeIds()).toEqual(['b', 'a'])

        currentTime = 30
        await waitForEvent(state as any, 'removed')
        expect(state.getNodeIds()).toEqual([])
    })

    it('getLeaderNodeId returns undefined when no nodes', async () => {
        await state.start()
        expect(state.getLeaderNodeId()).toBeUndefined()
    })

    it('getLeaderNodeId returns leader node when nodes', async () => {
        await state.start()
        await setTimeAndPublishMessage(5, createHeartbeatMsg('d'))
        await setTimeAndPublishMessage(5, createHeartbeatMsg('a'))
        await setTimeAndPublishMessage(5, createHeartbeatMsg('c'))
        await setTimeAndPublishMessage(5, createHeartbeatMsg('b'))

        expect(state.getLeaderNodeId()).toEqual('a')
    })

    it('getPeerDescriptorOf returns descriptor for online nodes', async () => {
        await state.start()
        await setTimeAndPublishMessage(10, createHeartbeatMsg('a'))

        expect(state.getPeerDescriptor('a' as DhtAddress)).toEqual({ nodeId: 'a' })
        expect(state.getPeerDescriptor('unknown' as DhtAddress)).toBeUndefined()

        currentTime = 30
        await waitForEvent(state as any, 'removed')

        expect(state.getPeerDescriptor('a' as DhtAddress)).toBeUndefined()
    })

    describe('waitUntilReady', () => {
        let ready: boolean

        beforeEach(() => {
            ready = false
            // eslint-disable-next-line promise/catch-or-return
            state.waitUntilReady().then(() => {
                ready = true
            })
        })

        it('does not become ready if no heartbeat arrives', async () => {
            await state.start()
            await wait(READY_WAIT_MS + JITTER)
            expect(ready).toBeFalse()
        })

        it('eventually becomes ready if heartbeat arrives', async () => {
            await state.start()
            await setTimeAndPublishMessage(5, createHeartbeatMsg('a'))
            await setTimeAndPublishMessage(5, createHeartbeatMsg('b'))
            await setTimeAndPublishMessage(10, createHeartbeatMsg('c'))
            expect(ready).toBeFalse()
            await wait(READY_WAIT_MS + JITTER)
            expect(ready).toBeTrue()
        })
    })
})
