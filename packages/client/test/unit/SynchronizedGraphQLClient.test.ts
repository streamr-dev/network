import 'reflect-metadata'
import { SynchronizedGraphQLClient } from '../../src/utils/SynchronizedGraphQLClient'

const MOCK_QUERY = 'mock-query'

interface IndexState {
    blockNumber: number
    queryResult: any
}

class FakeIndex {

    private states: IndexState[]
    private blockNumber = 0
    // eslint-disable-next-line no-undef
    private timer: NodeJS.Timer | undefined

    constructor(states: IndexState[]) {
        this.states = states
    }

    getState() {
        return this.states.find((state) => state.blockNumber >= this.getBlockNumber())
    }

    getBlockNumber() {
        return this.blockNumber
    }

    start() {
        // eslint-disable-next-line no-plusplus
        this.timer = setInterval(() => this.blockNumber++, 100)
    }

    stop() {
        clearInterval(this.timer!)
    }
}

describe('SynchronizedGraphQLClient', () => {

    let fakeIndex: FakeIndex
    let sendQuery: jest.Mock<Promise<Object>, []>
    let getIndexBlockNumber: jest.Mock<Promise<number>, []>
    let client: Pick<SynchronizedGraphQLClient, 'sendQuery' | 'updateRequiredBlockNumber'>

    beforeEach(() => {
        fakeIndex = new FakeIndex([{
            blockNumber: 1,
            queryResult: {
                foo: 111
            }
        },
        {
            blockNumber: 3,
            queryResult: {
                foo: 333
            }
        },
        {
            blockNumber: 5,
            queryResult: {
                foo: 555
            }
        }])
        sendQuery = jest.fn().mockImplementation((_query: string) => {
            const state = fakeIndex.getState()
            return state!.queryResult
        })
        getIndexBlockNumber = jest.fn().mockImplementation(() => {
            return fakeIndex.getBlockNumber()
        })
        client = new SynchronizedGraphQLClient(
            {
                sendQuery,
                getIndexBlockNumber
            } as any,
            {
                _timeouts: {
                    theGraph: {
                        timeout: 60 * 1000,
                        retryInterval: 100
                    }
                }
            } as any
        )
    })

    it('no synchronization', async () => {
        const response = await client.sendQuery(MOCK_QUERY)
        expect(response).toEqual({
            foo: 111
        })
        expect(sendQuery).toBeCalledTimes(1)
        expect(sendQuery).toBeCalledWith(MOCK_QUERY)
        expect(getIndexBlockNumber).not.toBeCalled()
    })

    it('happy path', async () => {
        client.updateRequiredBlockNumber(4)
        const responsePromise = client.sendQuery(MOCK_QUERY)
        fakeIndex.start()
        expect(await responsePromise).toEqual({
            foo: 555
        })
        expect(getIndexBlockNumber).toBeCalledTimes(5)
        expect(sendQuery).toBeCalledTimes(1)
        expect(sendQuery).toBeCalledWith(MOCK_QUERY)
        fakeIndex.stop()
    })

    it('multiple queries for same block', async () => {
        client.updateRequiredBlockNumber(4)
        const responsePromise = Promise.all([
            client.sendQuery(MOCK_QUERY),
            client.sendQuery(MOCK_QUERY)
        ])
        fakeIndex.start()
        const responses = await responsePromise
        expect(responses).toHaveLength(2)
        expect(responses[0]).toEqual({
            foo: 555
        })
        expect(responses[1]).toEqual({
            foo: 555
        })
        expect(getIndexBlockNumber).toBeCalledTimes(5)
        expect(sendQuery).toBeCalledTimes(2)
        expect(sendQuery).toBeCalledWith(MOCK_QUERY)
        fakeIndex.stop()
    })

    it('concurrent queries for different blocks', async () => {
        client.updateRequiredBlockNumber(2)
        const responsePromise1 = client.sendQuery(MOCK_QUERY)
        client.updateRequiredBlockNumber(4)
        const responsePromise2 = client.sendQuery(MOCK_QUERY)
        fakeIndex.start()
        const responses = await Promise.all([responsePromise1, responsePromise2])
        expect(responses).toHaveLength(2)
        expect(responses[0]).toEqual({
            foo: 333
        })
        expect(responses[1]).toEqual({
            foo: 555
        })
        expect(getIndexBlockNumber).toBeCalledTimes(3 + 5)
        expect(sendQuery).toBeCalledTimes(2)
        expect(sendQuery).toBeCalledWith(MOCK_QUERY)
        fakeIndex.stop()
    })
})
