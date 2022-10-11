import { wait } from '@streamr/utils'
import { range } from 'lodash'
import { createDecoratedContract, ObservableContract } from '../../src/utils/contract'
import { mockLoggerFactory } from '../test-utils/utils'

interface MockContract {
    foo: () => Promise<number>
    functions: {
        foo: string
    }
}

const createContract = (fooFn: () => Promise<number>, maxConcurrentCalls = 999999): ObservableContract<any> => {
    const mockContract: MockContract = {
        foo: fooFn,
        functions: {
            foo: 'mock-artifact-definition'
        }
    } as any
    return createDecoratedContract(mockContract as any, 'mock-contract', mockLoggerFactory(), maxConcurrentCalls)
}

describe('contracts', () => {

    it('happy path', async () => {
        const wrappedContract = createContract(async () => 123)
        expect(await wrappedContract.foo()).toBe(123)
    })

    it('concurrency limit', async () => {
        const INVOCATION_DURATION = 50
        const startTime = Date.now()
        const invocationSlots: number[] = []
        const wrappedContract = createContract(async () => {
            invocationSlots.push(Math.round((Date.now() - startTime) / INVOCATION_DURATION))
            await wait(INVOCATION_DURATION)
            return 123
        }, 2)

        await Promise.all(range(5).map(() => wrappedContract.foo()))

        expect(invocationSlots).toEqual([0, 0, 1, 1, 2])
    })
})
