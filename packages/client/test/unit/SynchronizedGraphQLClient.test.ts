import 'reflect-metadata'
import { wait } from 'streamr-test-utils'
import { SynchronizedGraphQLClient } from '../../src/utils/SynchronizedGraphQLClient'
import { mockContext } from '../test-utils/utils'

const POLL_INTERVAL = 50
const INDEXING_INTERVAL = 100
const MOCK_QUERY = 'mock-query'

interface IndexState {
    blockNumber: number
    queryResult: any
}

class EmulatedTheGraphIndex {

    private states: IndexState[]
    private blockNumber = 0
    // eslint-disable-next-line no-undef
    private timer: NodeJS.Timer | undefined

    constructor(states: IndexState[]) {
        this.states = states
    }

    getState(): IndexState {
        return this.states.find((state) => state.blockNumber >= this.getBlockNumber())!
    }

    getBlockNumber(): number {
        return this.blockNumber
    }

    start(): void {
        const lastBlockNumber = this.states[this.states.length - 1].blockNumber
        this.timer = setInterval(() => {
            if (this.blockNumber < lastBlockNumber) {
                // eslint-disable-next-line no-plusplus
                this.blockNumber++
            }
        }, INDEXING_INTERVAL)
    }

    stop(): void {
        clearInterval(this.timer!)
    }
}

describe('SynchronizedGraphQLClient', () => {

    let theGraphIndex: EmulatedTheGraphIndex
    let sendQuery: jest.Mock<Promise<Object>, []>
    let getIndexBlockNumber: jest.Mock<Promise<number>, []>
    let client: Pick<SynchronizedGraphQLClient, 'sendQuery' | 'updateRequiredBlockNumber'>

    beforeEach(() => {
        theGraphIndex = new EmulatedTheGraphIndex([{
            blockNumber: 1,
            queryResult: {
                foo: 111
            }
        }, {
            blockNumber: 2,
            queryResult: {
                foo: 222
            }
        }, {
            blockNumber: 4,
            queryResult: {
                foo: 444
            }
        }, {
            blockNumber: 7,
            queryResult: {
                foo: 777
            }
        }, {
            blockNumber: 8,
            queryResult: {
                foo: 888
            }
        }])
        sendQuery = jest.fn().mockImplementation((_query: string) => {
            const state = theGraphIndex.getState()
            return state!.queryResult
        })
        getIndexBlockNumber = jest.fn().mockImplementation(() => {
            return theGraphIndex.getBlockNumber()
        })
        client = new SynchronizedGraphQLClient(
            mockContext(),
            {
                sendQuery,
                getIndexBlockNumber
            } as any,
            {
                _timeouts: {
                    theGraph: {
                        timeout: 10 * INDEXING_INTERVAL,
                        retryInterval: POLL_INTERVAL
                    }
                }
            } as any
        )
    })

    afterEach(() => {
        theGraphIndex.stop()
    })

    it('no synchronization', async () => {
        const response = await client.sendQuery(MOCK_QUERY)
        expect(response).toEqual({
            foo: 111
        })
        expect(getIndexBlockNumber).not.toBeCalled()
        expect(sendQuery).toBeCalledTimes(1)
        expect(sendQuery).toBeCalledWith(MOCK_QUERY)
    })

    it('happy path', async () => {
        client.updateRequiredBlockNumber(3)
        const responsePromise = client.sendQuery(MOCK_QUERY)
        theGraphIndex.start()
        expect(await responsePromise).toEqual({
            foo: 444
        })
        expect(getIndexBlockNumber).toBeCalledTimes(3 * (INDEXING_INTERVAL / POLL_INTERVAL) + 1)
        expect(sendQuery).toBeCalledTimes(1)
        expect(sendQuery).toBeCalledWith(MOCK_QUERY)
    })

    it('multiple queries for same block', async () => {
        client.updateRequiredBlockNumber(7)
        const responsePromise = Promise.all([
            client.sendQuery(MOCK_QUERY),
            client.sendQuery(MOCK_QUERY)
        ])
        theGraphIndex.start()
        const responses = await responsePromise
        expect(responses).toHaveLength(2)
        expect(responses[0]).toEqual({
            foo: 777
        })
        expect(responses[1]).toEqual({
            foo: 777
        })
        expect(getIndexBlockNumber).toBeCalledTimes(7 * (INDEXING_INTERVAL / POLL_INTERVAL) + 1)
        expect(sendQuery).toBeCalledTimes(2)
        expect(sendQuery).toBeCalledWith(MOCK_QUERY)
    })

    it('multiple queries for different blocks', async () => {
        client.updateRequiredBlockNumber(7)
        const responsePromise1 = client.sendQuery(MOCK_QUERY)
        client.updateRequiredBlockNumber(8)
        const responsePromise2 = client.sendQuery(MOCK_QUERY)
        theGraphIndex.start()
        const responses = await Promise.all([responsePromise1, responsePromise2])
        expect(responses).toHaveLength(2)
        expect(responses[0]).toEqual({
            foo: 777
        })
        expect(responses[1]).toEqual({
            foo: 888
        })
        expect(getIndexBlockNumber).toBeCalledTimes(8 * (INDEXING_INTERVAL / POLL_INTERVAL) + 1)
        expect(sendQuery).toBeCalledTimes(2)
        expect(sendQuery).toBeCalledWith(MOCK_QUERY)
    })

    it('timeout', async () => {
        client.updateRequiredBlockNumber(999999)
        theGraphIndex.start()
        return expect(() => client.sendQuery(MOCK_QUERY)).rejects.toThrow('timed out while waiting for The Graph index update for block 999999')
    })

    it('one query timeouts, another succeeds', async () => {
        client.updateRequiredBlockNumber(7)
        const responsePromise1 = client.sendQuery(MOCK_QUERY)
        await wait(500)
        const responsePromise2 = client.sendQuery(MOCK_QUERY)
        theGraphIndex.start()
        await expect(() => responsePromise1).rejects.toThrow('timed out while waiting for The Graph index update for block 7')
        expect(await responsePromise2).toEqual({
            foo: 777
        })
    })
})
