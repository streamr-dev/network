import { executeSafePromise } from '../src/executeSafePromise'
import { wait } from '../src/wait'

describe('executeSafePromise', () => {
    it('success', async () => {
        let result: number | undefined
        executeSafePromise(async () => {
            await wait(10)
            result = 123
        })
        setTimeout(() => {
            expect(result).toBe(123)
        }, 50)
    })
})
