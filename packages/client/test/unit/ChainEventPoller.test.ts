import { wait, waitForCondition } from '@streamr/utils'
import { Contract } from 'ethers'
import { ChainEventPoller, POLL_INTERVAL } from './../../src/contracts/ChainEventPoller'

const INITIAL_BLOCK_NUMBER = 123
const EVENT_NAME = 'foo'
const EVENT_ARGS = [ 'mock-arg1', 'mock-arg2' ]

describe('ChainEventPoller', () => {

    it('happy path', async () => {
        let blockNumber = INITIAL_BLOCK_NUMBER
        const contract = {
            queryFilter: jest.fn().mockImplementation(() => {
                const result = [{
                    fragment: {
                        name: EVENT_NAME
                    },
                    args: EVENT_ARGS,
                    blockNumber
                }]
                blockNumber++
                return result
            }),
            runner: {
                provider: {
                    getBlockNumber: jest.fn().mockImplementation(async () => blockNumber)
                }
            }
        } as unknown as Contract
        const poller = new ChainEventPoller([contract])

        const listener1 = jest.fn()
        poller.on(EVENT_NAME, listener1)

        // poller starts
        await waitForCondition(() => listener1.mock.calls.length === 1)
        expect(contract.runner!.provider!.getBlockNumber).toHaveBeenCalledTimes(1)
        expect(contract.queryFilter).toHaveBeenCalledTimes(1)
        expect(contract.queryFilter).toHaveBeenCalledWith([[EVENT_NAME]], INITIAL_BLOCK_NUMBER)
        expect(listener1).toHaveBeenCalledTimes(1)
        expect(listener1).toHaveBeenCalledWith(...EVENT_ARGS, INITIAL_BLOCK_NUMBER)
        await waitForCondition(() => listener1.mock.calls.length === 2)
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
        await waitForCondition(() => listener2.mock.calls.length === 1)
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
})
