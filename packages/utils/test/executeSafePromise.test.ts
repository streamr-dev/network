import { executeSafePromise } from '../src/executeSafePromise'
import { wait } from '../src/wait'

describe('executeSafePromise', () => {
    it('success', async () => {
        const result = await executeSafePromise(async () => {
            await wait(10)
            return 123
        })
        expect(result).toBe(123)
    })
})
