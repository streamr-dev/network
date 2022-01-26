import { DisconnectionManager } from '../../src/logic/node/DisconnectionManager'
import { NodeId } from '../../src/logic/node/Node'
import { wait } from 'streamr-test-utils'

const TTL = 20

describe(DisconnectionManager, () => {
    let getAllNodes: jest.Mock<NodeId[], []>
    let hasSharedStreamParts: jest.Mock<boolean, [NodeId]>
    let disconnect: jest.Mock<void, [NodeId, string]>
    let manager: DisconnectionManager

    function setUpManager(disconnectionDelayInMs: number, cleanUpIntervalInMs: number): void {
        manager = new DisconnectionManager({
            getAllNodes,
            hasSharedStreamParts,
            disconnect,
            disconnectionDelayInMs,
            cleanUpIntervalInMs
        })
    }

    beforeEach(() => {
        getAllNodes = jest.fn()
        hasSharedStreamParts = jest.fn()
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
            expect(disconnect).toHaveBeenNthCalledWith(1, 'n1', DisconnectionManager.DISCONNECTION_REASON)
            expect(disconnect).toHaveBeenNthCalledWith(2, 'n2', DisconnectionManager.DISCONNECTION_REASON)
            expect(disconnect).toHaveBeenNthCalledWith(3, 'n3', DisconnectionManager.DISCONNECTION_REASON)
        })

        it('disconnects from nodes with which no shared streams', async () => {
            getAllNodes.mockReturnValue(['n1', 'n2', 'n3', 'n4'])
            hasSharedStreamParts.mockImplementation((nodeId) => ['n1', 'n4'].includes(nodeId))
            await setUpManagerAndRunCleanUpIntervalOnce()
            expect(disconnect).toHaveBeenCalledTimes(2)
            expect(disconnect).toHaveBeenNthCalledWith(1, 'n2', DisconnectionManager.DISCONNECTION_REASON)
            expect(disconnect).toHaveBeenNthCalledWith(2, 'n3', DisconnectionManager.DISCONNECTION_REASON)
        })

        it('longer scenario', async () => {
            getAllNodes.mockReturnValue(['n1', 'n2', 'n3', 'n4'])
            hasSharedStreamParts.mockImplementation((nodeId) => ['n1', 'n4'].includes(nodeId))
            setUpManager(1000, TTL)
            manager.start()

            await wait(TTL + 1)
            expect(disconnect.mock.calls).toEqual([
                ['n2', DisconnectionManager.DISCONNECTION_REASON],
                ['n3', DisconnectionManager.DISCONNECTION_REASON]
            ])

            disconnect.mockReset()
            getAllNodes.mockReturnValue(['n1', 'n3', 'n4'])
            hasSharedStreamParts.mockImplementation((nodeId) => ['n1', 'n4'].includes(nodeId))

            await wait(TTL + 1)
            expect(disconnect.mock.calls).toEqual([
                ['n3', DisconnectionManager.DISCONNECTION_REASON]
            ])

            disconnect.mockReset()
            getAllNodes.mockReturnValue(['n1', 'n4', 'n5', 'n6'])
            hasSharedStreamParts.mockImplementation((nodeId) => ['n1', 'n6'].includes(nodeId))

            await wait(TTL + 1)
            expect(disconnect.mock.calls).toEqual([
                ['n4', DisconnectionManager.DISCONNECTION_REASON],
                ['n5', DisconnectionManager.DISCONNECTION_REASON]
            ])

            disconnect.mockReset()
            getAllNodes.mockReturnValue(['n1', 'n6'])
            hasSharedStreamParts.mockImplementation((nodeId) => ['n1'].includes(nodeId))

            await wait(TTL + 1)
            expect(disconnect.mock.calls).toEqual([
                ['n6', DisconnectionManager.DISCONNECTION_REASON]
            ])

            disconnect.mockReset()
            getAllNodes.mockReturnValue(['n1'])
            hasSharedStreamParts.mockImplementation(() => false)

            await wait(TTL + 1)
            expect(disconnect.mock.calls).toEqual([
                ['n1', DisconnectionManager.DISCONNECTION_REASON]
            ])
        })
    })

    describe('scheduled disconnection', () => {
        beforeEach(() => {
            setUpManager(TTL, 60 * 60 * 1000)
        })

        it('executed after TTL if no shared streams then', async () => {
            manager.scheduleDisconnectionIfNoSharedStreamParts('node')
            await wait(TTL + 1)
            expect(disconnect).toHaveBeenCalledTimes(1)
            expect(disconnect).toHaveBeenNthCalledWith(1, 'node', DisconnectionManager.DISCONNECTION_REASON)
        })

        it('not executed after TTL if has shared streams by then', async () => {
            manager.scheduleDisconnectionIfNoSharedStreamParts('node')
            hasSharedStreamParts.mockReturnValue(true)
            await wait(TTL + 1)
            expect(disconnect).toHaveBeenCalledTimes(0)
        })

        it('not executed after TTL if had shared streams initially', async () => {
            hasSharedStreamParts.mockReturnValue(true)
            manager.scheduleDisconnectionIfNoSharedStreamParts('node')
            hasSharedStreamParts.mockReturnValue(false)
            await wait(TTL + 1)
            expect(disconnect).toHaveBeenCalledTimes(0)
        })

        it('re-scheduling same disconnection causes debounce', async () => {
            manager.scheduleDisconnectionIfNoSharedStreamParts('node')
            await wait(TTL / 2)
            manager.scheduleDisconnectionIfNoSharedStreamParts('node')
            await wait((TTL / 2) + 1)
            expect(disconnect).toHaveBeenCalledTimes(0)
            await wait((TTL / 2) + 1)
            expect(disconnect).toHaveBeenCalledTimes(1)
            expect(disconnect).toHaveBeenNthCalledWith(1, 'node', DisconnectionManager.DISCONNECTION_REASON)
        })

        it('not executed after TTL if canceled before', async () => {
            manager.scheduleDisconnectionIfNoSharedStreamParts('node')
            await wait(TTL / 2)
            manager.cancelScheduledDisconnection('node')
            await wait((TTL / 2) + 1)
            expect(disconnect).toHaveBeenCalledTimes(0)
        })

        it('executed after TTL if canceling other (unrelated) node', async () => {
            manager.scheduleDisconnectionIfNoSharedStreamParts('node-1')
            manager.scheduleDisconnectionIfNoSharedStreamParts('node-2')
            await wait(TTL / 2)
            manager.cancelScheduledDisconnection('node-2')
            await wait((TTL / 2) + 1)
            expect(disconnect).toHaveBeenCalledTimes(1)
            expect(disconnect).toHaveBeenNthCalledWith(1, 'node-1', DisconnectionManager.DISCONNECTION_REASON)
        })

        it('canceling non-existing disconnection does not throw', () => {
            expect(() => {
                manager.cancelScheduledDisconnection('non-existing-node')
            }).not.toThrowError()
        })
    })
})