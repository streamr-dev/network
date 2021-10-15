import { DisconnectionManager } from '../../src/logic/node/DisconnectionManager'
import { NodeId } from '../../src/logic/node/Node'
import { wait } from 'streamr-test-utils'

const TTL = 20

describe(DisconnectionManager, () => {
    let getAllNodes: jest.Mock<NodeId[], []>
    let hasSharedStreams: jest.Mock<boolean, [NodeId]>
    let disconnect: jest.Mock<void, [NodeId, string]>
    let manager: DisconnectionManager

    function setUpManager(disconnectionDelayInMs: number, cleanUpIntervalInMs: number): void {
        manager = new DisconnectionManager({
            getAllNodes,
            hasSharedStreams,
            disconnect,
            disconnectionDelayInMs,
            cleanUpIntervalInMs
        })
    }

    beforeEach(() => {
        getAllNodes = jest.fn()
        hasSharedStreams = jest.fn()
        disconnect = jest.fn()
    })

    afterEach(() => {
        manager?.stop()
    })

    describe('clean up interval', () => {
        async function setUpManagerAndRunCleanUpIntervalOnce(): Promise<void> {
            setUpManager(1000, TTL)
            manager.start()
            await wait(TTL + 1)
            manager?.stop()
        }

        it('works (noop) with empty values', async () => {
            getAllNodes.mockReturnValue([])
            await setUpManagerAndRunCleanUpIntervalOnce()
            expect(getAllNodes.mock.calls.length).toBeGreaterThanOrEqual(1)
            expect(disconnect).toHaveBeenCalledTimes(0)
        })

        it('disconnects from all nodes if no streams', async () => {
            getAllNodes.mockReturnValue(['n1', 'n2', 'n3'])
            await setUpManagerAndRunCleanUpIntervalOnce()
            expect(disconnect).toHaveBeenCalledTimes(3)
            expect(disconnect).toHaveBeenNthCalledWith(1, 'n1', 'no shared streams')
            expect(disconnect).toHaveBeenNthCalledWith(2, 'n2', 'no shared streams')
            expect(disconnect).toHaveBeenNthCalledWith(3, 'n3', 'no shared streams')
        })

        it('disconnects from nodes with which no shared streams', async () => {
            getAllNodes.mockReturnValue(['n1', 'n2', 'n3', 'n4'])
            hasSharedStreams.mockImplementation((nodeId) => ['n1', 'n4'].includes(nodeId))
            await setUpManagerAndRunCleanUpIntervalOnce()
            expect(disconnect).toHaveBeenCalledTimes(2)
            expect(disconnect).toHaveBeenNthCalledWith(1, 'n2', 'no shared streams')
            expect(disconnect).toHaveBeenNthCalledWith(2, 'n3', 'no shared streams')
        })

        it('longer scenario', async () => {
            getAllNodes.mockReturnValue(['n1', 'n2', 'n3', 'n4'])
            hasSharedStreams.mockImplementation((nodeId) => ['n1', 'n4'].includes(nodeId))
            setUpManager(1000, TTL)
            manager.start()

            await wait(TTL + 1)
            expect(disconnect.mock.calls).toEqual([
                ['n2', 'no shared streams'],
                ['n3', 'no shared streams']
            ])

            disconnect.mockReset()
            getAllNodes.mockReturnValue(['n1', 'n3', 'n4'])
            hasSharedStreams.mockImplementation((nodeId) => ['n1', 'n4'].includes(nodeId))

            await wait(TTL + 1)
            expect(disconnect.mock.calls).toEqual([
                ['n3', 'no shared streams']
            ])

            disconnect.mockReset()
            getAllNodes.mockReturnValue(['n1', 'n4', 'n5', 'n6'])
            hasSharedStreams.mockImplementation((nodeId) => ['n1', 'n6'].includes(nodeId))

            await wait(TTL + 1)
            expect(disconnect.mock.calls).toEqual([
                ['n4', 'no shared streams'],
                ['n5', 'no shared streams']
            ])

            disconnect.mockReset()
            getAllNodes.mockReturnValue(['n1', 'n6'])
            hasSharedStreams.mockImplementation((nodeId) => ['n1'].includes(nodeId))

            await wait(TTL + 1)
            expect(disconnect.mock.calls).toEqual([
                ['n6', 'no shared streams']
            ])

            disconnect.mockReset()
            getAllNodes.mockReturnValue(['n1'])
            hasSharedStreams.mockImplementation(() => false)

            await wait(TTL + 1)
            expect(disconnect.mock.calls).toEqual([
                ['n1', 'no shared streams']
            ])
        })
    })

    describe('scheduled disconnection', () => {
        beforeEach(() => {
            setUpManager(TTL, 60 * 60 * 1000)
        })

        it('executed after TTL if no shared streams then', async () => {
            manager.scheduleDisconnectionIfNoSharedStreams('node')
            await wait(TTL + 1)
            expect(disconnect).toHaveBeenCalledTimes(1)
            expect(disconnect).toHaveBeenNthCalledWith(1, 'node', 'no shared streams')
        })

        it('not executed after TTL if has shared streams by then', async () => {
            manager.scheduleDisconnectionIfNoSharedStreams('node')
            hasSharedStreams.mockReturnValue(true)
            await wait(TTL + 1)
            expect(disconnect).toHaveBeenCalledTimes(0)
        })

        it('not executed after TTL if had shared streams initially', async () => {
            hasSharedStreams.mockReturnValue(true)
            manager.scheduleDisconnectionIfNoSharedStreams('node')
            hasSharedStreams.mockReturnValue(false)
            await wait(TTL + 1)
            expect(disconnect).toHaveBeenCalledTimes(0)
        })

        it('not executed after TTL if canceled before', async () => {
            manager.scheduleDisconnectionIfNoSharedStreams('node')
            await wait(TTL / 2)
            manager.cancelScheduledDisconnection('node')
            await wait((TTL / 2) + 1)
            expect(disconnect).toHaveBeenCalledTimes(0)
        })

        it('executed after TTL if canceling other (unrelated) node', async () => {
            manager.scheduleDisconnectionIfNoSharedStreams('node-1')
            manager.scheduleDisconnectionIfNoSharedStreams('node-2')
            await wait(TTL / 2)
            manager.cancelScheduledDisconnection('node-2')
            await wait((TTL / 2) + 1)
            expect(disconnect).toHaveBeenCalledTimes(1)
            expect(disconnect).toHaveBeenNthCalledWith(1, 'node-1', 'no shared streams')
        })

        it('canceling non-existing disconnection does not throw', () => {
            expect(() => {
                manager.cancelScheduledDisconnection('non-existing-node')
            }).not.toThrowError()
        })
    })
})