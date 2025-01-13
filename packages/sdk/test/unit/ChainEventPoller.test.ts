import { wait, until } from '@streamr/utils'
import { Contract, EventLog, Provider } from 'ethers'
import { ChainEventPoller, POLLS_SINCE_LAST_FROM_BLOCK_UPDATE_THRESHOLD } from './../../src/contracts/ChainEventPoller'
import range from 'lodash/range'

const POLL_INTERVAL = 100

describe('ChainEventPoller', () => {
    it('happy path', async () => {
        const INITIAL_BLOCK_NUMBER = 123
        const EVENT_NAME = 'foo'
        const EVENT_ARGS = ['mock-arg1', 'mock-arg2']
        let blockNumber = INITIAL_BLOCK_NUMBER
        const contract = {
            queryFilter: jest.fn().mockImplementation(() => {
                const result = [
                    {
                        fragment: {
                            name: EVENT_NAME
                        },
                        args: EVENT_ARGS,
                        blockNumber
                    }
                ]
                blockNumber++
                return result
            }),
            runner: {
                provider: {
                    getBlockNumber: jest.fn().mockImplementation(async () => blockNumber)
                }
            }
        } as unknown as Contract
        const poller = new ChainEventPoller([contract], POLL_INTERVAL)

        const listener1 = jest.fn()
        poller.on(EVENT_NAME, listener1)

        // poller starts
        await until(() => listener1.mock.calls.length === 1)
        expect(contract.runner!.provider!.getBlockNumber).toHaveBeenCalledTimes(1)
        expect(contract.queryFilter).toHaveBeenCalledTimes(1)
        expect(contract.queryFilter).toHaveBeenCalledWith([[EVENT_NAME]], INITIAL_BLOCK_NUMBER)
        expect(listener1).toHaveBeenCalledTimes(1)
        expect(listener1).toHaveBeenCalledWith(...EVENT_ARGS, INITIAL_BLOCK_NUMBER)
        await until(() => listener1.mock.calls.length === 2)
        expect(contract.runner!.provider!.getBlockNumber).toHaveBeenCalledTimes(1)
        expect(contract.queryFilter).toHaveBeenCalledTimes(2)
        expect(contract.queryFilter).toHaveBeenNthCalledWith(2, [[EVENT_NAME]], INITIAL_BLOCK_NUMBER + 1)
        expect(listener1).toHaveBeenCalledTimes(2)
        expect(listener1).toHaveBeenNthCalledWith(2, ...EVENT_ARGS, INITIAL_BLOCK_NUMBER + 1)

        poller.off(EVENT_NAME, listener1)

        // poller stops
        await wait(1.5 * POLL_INTERVAL)
        expect(contract.runner!.provider!.getBlockNumber).toHaveBeenCalledTimes(1)
        expect(contract.queryFilter).toHaveBeenCalledTimes(2)
        expect(listener1).toHaveBeenCalledTimes(2)

        const listener2 = jest.fn()
        poller.on(EVENT_NAME, listener2)

        // poller restarts
        await until(() => listener2.mock.calls.length === 1)
        expect(contract.runner!.provider!.getBlockNumber).toHaveBeenCalledTimes(2)
        expect(contract.queryFilter).toHaveBeenCalledTimes(3)
        expect(listener2).toHaveBeenCalledTimes(1)
        expect(listener2).toHaveBeenCalledWith(...EVENT_ARGS, INITIAL_BLOCK_NUMBER + 2)

        poller.off(EVENT_NAME, listener2)

        // poller stops
        await wait(1.5 * POLL_INTERVAL)
        expect(contract.runner!.provider!.getBlockNumber).toHaveBeenCalledTimes(2)
        expect(contract.queryFilter).toHaveBeenCalledTimes(3)
        expect(listener2).toHaveBeenCalledTimes(1)
    })

    it('multiple events and listeners', async () => {
        const EVENT_NAME_1 = 'event-name-1'
        const EVENT_NAME_2 = 'event-name-2'
        const contract = {
            queryFilter: jest.fn().mockImplementation(() => {
                const result = [
                    {
                        fragment: {
                            name: EVENT_NAME_1
                        },
                        args: ['arg-foo1'],
                        blockNumber: 150
                    },
                    {
                        fragment: {
                            name: EVENT_NAME_1
                        },
                        args: ['arg-foo2'],
                        blockNumber: 155
                    },
                    {
                        fragment: {
                            name: EVENT_NAME_2
                        },
                        args: ['arg-bar'],
                        blockNumber: 152
                    }
                ]
                return result
            }),
            runner: {
                provider: {
                    getBlockNumber: jest.fn().mockImplementation(async () => 123)
                }
            }
        } as unknown as Contract
        const poller = new ChainEventPoller([contract], POLL_INTERVAL)

        const listener1 = jest.fn()
        const listener2 = jest.fn()
        const listener3 = jest.fn()
        poller.on(EVENT_NAME_1, listener1)
        poller.on(EVENT_NAME_2, listener2)
        poller.on(EVENT_NAME_2, listener3)

        await until(() => {
            return listener1.mock.calls.length > 0 && listener2.mock.calls.length > 0 && listener3.mock.calls.length > 0
        })
        expect(contract.queryFilter).toHaveBeenNthCalledWith(1, [[EVENT_NAME_1, EVENT_NAME_2]], 123)
        expect(listener1).toHaveBeenCalledTimes(2)
        expect(listener1).toHaveBeenCalledWith('arg-foo1', 150)
        expect(listener1).toHaveBeenCalledWith('arg-foo2', 155)
        expect(listener2).toHaveBeenCalledTimes(1)
        expect(listener2).toHaveBeenCalledWith('arg-bar', 152)
        expect(listener3).toHaveBeenCalledTimes(1)
        expect(listener3).toHaveBeenCalledWith('arg-bar', 152)

        await wait(1.5 * POLL_INTERVAL)
        expect(contract.queryFilter).toHaveBeenNthCalledWith(2, [[EVENT_NAME_1, EVENT_NAME_2]], 155 + 1)

        poller.off(EVENT_NAME_1, listener1)
        poller.off(EVENT_NAME_2, listener2)
        poller.off(EVENT_NAME_2, listener3)
    })

    describe('explicit block number fetching', () => {
        let invocationHistory: string[]
        let onGetBlockNumber: (nthCall: number) => number
        let onQueryFilter: (nthCall: number) => EventLog[]
        let poller: ChainEventPoller

        beforeEach(() => {
            invocationHistory = []
            let getBlockNumberCallCount = 0
            const provider = {
                getBlockNumber: async () => {
                    invocationHistory.push('getBlockNumber')
                    return onGetBlockNumber(getBlockNumberCallCount++)
                }
            } as Pick<Provider, 'getBlockNumber'>
            let queryFilterCallCount = 0
            const contract = {
                runner: {
                    provider
                },
                queryFilter: async (eventName, blockNumber) => {
                    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                    invocationHistory.push(`queryFilter(${eventName}, ${blockNumber})`)
                    return onQueryFilter(queryFilterCallCount++)
                }
            } as Pick<Contract, 'queryFilter'>
            poller = new ChainEventPoller([contract as Contract, contract as Contract], 10)
        })

        it('when no events, fetches block number explicitly after every POLLS_SINCE_LAST_FROM_BLOCK_UPDATE_THRESHOLD', async () => {
            let currentRpcBlockNumber = 10
            onGetBlockNumber = () => {
                return currentRpcBlockNumber++
            }
            onQueryFilter = () => []
            const eventCb = () => {}
            poller.on('event', eventCb)
            const expectedLength = 3 * POLLS_SINCE_LAST_FROM_BLOCK_UPDATE_THRESHOLD + 6
            await until(() => invocationHistory.length >= expectedLength)
            expect(invocationHistory.slice(0, expectedLength)).toEqual([
                'getBlockNumber',
                ...range(POLLS_SINCE_LAST_FROM_BLOCK_UPDATE_THRESHOLD).map(() => 'queryFilter(event, 10)'),
                'getBlockNumber',
                'queryFilter(event, 10)',
                ...range(POLLS_SINCE_LAST_FROM_BLOCK_UPDATE_THRESHOLD).map(() => 'queryFilter(event, 12)'),
                'getBlockNumber',
                'queryFilter(event, 12)',
                ...range(POLLS_SINCE_LAST_FROM_BLOCK_UPDATE_THRESHOLD).map(() => 'queryFilter(event, 13)'),
                'getBlockNumber'
            ])
            poller.off('event', eventCb)
        })

        // TODO: test other cases
    })
})
