import 'reflect-metadata'
import { wait } from 'streamr-test-utils'
import { SynchronizedGraphQLClient } from '../../src/utils/SynchronizedGraphQLClient'
import { mockContext } from '../test-utils/utils'

const POLL_INTERVAL = 50
const INDEXING_INTERVAL = 100
const MOCK_QUERY = 'mock-query'

const getMockCallResults = (fn: jest.Mock<Promise<number>>) => {
    return fn.mock.results
        .filter((item) => item.type === 'return')
        .map((item) => item.value)
}

interface IndexState {
    blockNumber: number
    queryResult: any
}

class EmulatedTheGraphIndex {

    private states: IndexState[]
    // eslint-disable-next-line no-undef
    private timer: NodeJS.Timer | undefined

    constructor(states: IndexState[]) {
        this.states = states
    }

    getState(): IndexState {
        return this.states[0]
    }

    start(): void {
        this.timer = setInterval(() => {
            if (this.states.length > 1) {
                this.states = this.states.slice(1)
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
            blockNumber: 0,
            queryResult: {
                foo: 'result-0'
            }
        }, {
            blockNumber: 2,
            queryResult: {
                foo: 'result-2'
            }
        }, {
            blockNumber: 4,
            queryResult: {
                foo: 'result-4'
            }
        }, {
            blockNumber: 7,
            queryResult: {
                foo: 'result-7'
            }
        }, {
            blockNumber: 8,
            queryResult: {
                foo: 'result-8'
            }
        }])
        sendQuery = jest.fn().mockImplementation((_query: string) => {
            const state = theGraphIndex.getState()
            return state!.queryResult
        })
        getIndexBlockNumber = jest.fn().mockImplementation(() => {
            return theGraphIndex.getState().blockNumber
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
            foo: 'result-0'
        })
        expect(getIndexBlockNumber).not.toBeCalled()
        expect(sendQuery).toBeCalledTimes(1)
        expect(sendQuery).toBeCalledWith(MOCK_QUERY)
    })

    it('happy path', async () => {
        client.updateRequiredBlockNumber(4)
        const responsePromise = client.sendQuery(MOCK_QUERY)
        theGraphIndex.start()
        expect(await responsePromise).toEqual({
            foo: 'result-4'
        })
        expect(sendQuery).toBeCalledTimes(1)
        expect(sendQuery).toBeCalledWith(MOCK_QUERY)
        expect(getMockCallResults(getIndexBlockNumber)).toEqual([0, 0, 2, 2, 4])
    })

    it('required block number is not a poll result', async () => {
        client.updateRequiredBlockNumber(3)
        const responsePromise = client.sendQuery(MOCK_QUERY)
        theGraphIndex.start()
        expect(await responsePromise).toEqual({
            foo: 'result-4'
        })
        expect(sendQuery).toBeCalledTimes(1)
        expect(sendQuery).toBeCalledWith(MOCK_QUERY)
        expect(getMockCallResults(getIndexBlockNumber)).toEqual([0, 0, 2, 2, 4])
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
            foo: 'result-7'
        })
        expect(responses[1]).toEqual({
            foo: 'result-7'
        })
        expect(sendQuery).toBeCalledTimes(2)
        expect(sendQuery).toBeCalledWith(MOCK_QUERY)
        expect(getMockCallResults(getIndexBlockNumber)).toEqual([0, 0, 2, 2, 4, 4, 7])
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
            foo: 'result-7'
        })
        expect(responses[1]).toEqual({
            foo: 'result-8'
        })
        expect(sendQuery).toBeCalledTimes(2)
        expect(sendQuery).toBeCalledWith(MOCK_QUERY)
        expect(getMockCallResults(getIndexBlockNumber)).toEqual([0, 0, 2, 2, 4, 4, 7, 7, 8])
    })

    it('timeout', async () => {
        client.updateRequiredBlockNumber(999999)
        theGraphIndex.start()
        return expect(() => client.sendQuery(MOCK_QUERY)).rejects.toThrow('timed out while waiting for The Graph to synchronized to block 999999')
    })

    it('one query timeouts, another succeeds', async () => {
        client.updateRequiredBlockNumber(7)
        const responsePromise1 = client.sendQuery(MOCK_QUERY)
        await wait(800)
        const responsePromise2 = client.sendQuery(MOCK_QUERY)
        theGraphIndex.start()
        await expect(() => responsePromise1).rejects.toThrow('timed out while waiting for The Graph to synchronized to block 7')
        expect(await responsePromise2).toEqual({
            foo: 'result-7'
        })
    })
})
