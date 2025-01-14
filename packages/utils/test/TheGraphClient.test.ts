import { TheGraphClient } from '../src/TheGraphClient'
import { wait } from '../src/wait'

const POLL_INTERVAL = 50
const INDEXING_INTERVAL = 100
const MOCK_QUERY = { query: 'mock-query' }

interface IndexState {
    blockNumber: number
    queryResult: any
}

class EmulatedTheGraphIndex {
    private states: IndexState[]
    private timer: NodeJS.Timeout | undefined

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
        clearInterval(this.timer)
    }
}

describe('TheGraphClient', () => {
    let theGraphIndex: EmulatedTheGraphIndex
    let client: TheGraphClient
    let fetchBlockNumbers: number[]

    beforeEach(() => {
        theGraphIndex = new EmulatedTheGraphIndex([
            {
                blockNumber: 0,
                queryResult: {
                    foo: 'result-0'
                }
            },
            {
                blockNumber: 2,
                queryResult: {
                    foo: 'result-2'
                }
            },
            {
                blockNumber: 4,
                queryResult: {
                    foo: 'result-4'
                }
            },
            {
                blockNumber: 7,
                queryResult: {
                    foo: 'result-7'
                }
            },
            {
                blockNumber: 8,
                queryResult: {
                    foo: 'result-8'
                }
            }
        ])
        fetchBlockNumbers = []
        const fetch = async (_url: string, init: Record<string, unknown>) => {
            return {
                text: async () => {
                    const state = theGraphIndex.getState()
                    fetchBlockNumbers.push(state.blockNumber)
                    const query = JSON.parse(init.body! as string).query
                    const data =
                        query === 'mock-query'
                            ? state.queryResult
                            : {
                                  _meta: {
                                      block: {
                                          number: state.blockNumber
                                      }
                                  }
                              }
                    return JSON.stringify({
                        data
                    })
                }
            }
        }
        client = new TheGraphClient({
            serverUrl: '',
            fetch: fetch as any,
            indexTimeout: 10 * INDEXING_INTERVAL,
            indexPollInterval: POLL_INTERVAL
        })
    })

    afterEach(() => {
        theGraphIndex.stop()
    })

    it('no synchronization', async () => {
        const response = await client.queryEntity(MOCK_QUERY)
        expect(response).toEqual({
            foo: 'result-0'
        })
        expect(fetchBlockNumbers).toEqual([0])
    })

    it('happy path', async () => {
        client.updateRequiredBlockNumber(4)
        const responsePromise = client.queryEntity(MOCK_QUERY)
        theGraphIndex.start()
        expect(await responsePromise).toEqual({
            foo: 'result-4'
        })
        expect(fetchBlockNumbers).toSatisfyAll((n) => n <= 4)
    })

    it('required block number is not a poll result', async () => {
        client.updateRequiredBlockNumber(3)
        const responsePromise = client.queryEntity(MOCK_QUERY)
        theGraphIndex.start()
        expect(await responsePromise).toEqual({
            foo: 'result-4'
        })
        expect(fetchBlockNumbers).toSatisfyAll((n) => n <= 4)
    })

    it('multiple queries for same block', async () => {
        client.updateRequiredBlockNumber(7)
        const responsePromise = Promise.all([client.queryEntity(MOCK_QUERY), client.queryEntity(MOCK_QUERY)])
        theGraphIndex.start()
        const responses = await responsePromise
        expect(responses).toHaveLength(2)
        expect(responses[0]).toEqual({
            foo: 'result-7'
        })
        expect(responses[1]).toEqual({
            foo: 'result-7'
        })
        expect(fetchBlockNumbers).toSatisfyAll((n) => n <= 7)
    })

    it('multiple queries for different blocks', async () => {
        client.updateRequiredBlockNumber(7)
        const responsePromise1 = client.queryEntity(MOCK_QUERY)
        client.updateRequiredBlockNumber(8)
        const responsePromise2 = client.queryEntity(MOCK_QUERY)
        theGraphIndex.start()
        const responses = await Promise.all([responsePromise1, responsePromise2])
        expect(responses).toHaveLength(2)
        expect(responses[0]).toEqual({
            foo: 'result-7'
        })
        expect(responses[1]).toEqual({
            foo: 'result-8'
        })
        expect(fetchBlockNumbers).toSatisfyAll((n) => n <= 8)
    })

    it('timeout', async () => {
        client.updateRequiredBlockNumber(999999)
        theGraphIndex.start()
        return expect(() => client.queryEntity(MOCK_QUERY)).rejects.toThrow(
            'The Graph did not synchronize to block 999999 (timed out after 1000 ms)'
        )
    })

    it('one query timeouts, another succeeds', async () => {
        client.updateRequiredBlockNumber(7)
        const responsePromise1 = client.queryEntity(MOCK_QUERY)
        await wait(800)
        const responsePromise2 = client.queryEntity(MOCK_QUERY)
        theGraphIndex.start()
        await expect(() => responsePromise1).rejects.toThrow(
            'The Graph did not synchronize to block 7 (timed out after 1000 ms)'
        )
        expect(await responsePromise2).toEqual({
            foo: 'result-7'
        })
    })
})
