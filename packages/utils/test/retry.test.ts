import { retry } from '../src/retry'

describe('retry', () => {
    it('first success', async () => {
        const task = jest.fn().mockResolvedValue(123)
        const onRetryableFailure = jest.fn()
        const result = await retry(task, onRetryableFailure, 'foobar', 4, 10)
        expect(result).toBe(123)
        expect(task).toHaveBeenCalledTimes(1)
        expect(onRetryableFailure).not.toHaveBeenCalled()
    })

    it('non-first success', async () => {
        const error = new Error('mock-error')
        const task = jest.fn().mockRejectedValueOnce(error).mockRejectedValueOnce(error).mockResolvedValue(123)
        const onRetryableFailure = jest.fn()
        const result = await retry(task, onRetryableFailure, 'foobar', 4, 10)
        expect(result).toBe(123)
        expect(task).toHaveBeenCalledTimes(3)
        expect(onRetryableFailure).toHaveBeenCalledTimes(2)
        for (let i = 1; i <= 2; i++) {
            expect(onRetryableFailure).toHaveBeenNthCalledWith(1, 'foobar failed, retrying in 10 ms', error)
            expect(onRetryableFailure).toHaveBeenNthCalledWith(2, 'foobar failed, retrying in 10 ms', error)
        }
    })

    it('all fail', async () => {
        const error = new Error('mock-error')
        const task = jest.fn().mockRejectedValue(error)
        const onRetryableFailure = jest.fn()
        await expect(() => retry(task, onRetryableFailure, 'foobar', 4, 10)).rejects.toThrow(
            'foobar failed after 4 attempts'
        )
        expect(task).toHaveBeenCalledTimes(4)
        expect(onRetryableFailure).toHaveBeenCalledTimes(3)
        for (let i = 1; i <= 4; i++) {
            expect(onRetryableFailure).toHaveBeenNthCalledWith(1, 'foobar failed, retrying in 10 ms', error)
            expect(onRetryableFailure).toHaveBeenNthCalledWith(2, 'foobar failed, retrying in 10 ms', error)
        }
    })

    it('no tasks', async () => {
        await expect(() => retry(undefined as any, undefined as any, 'foobar', 0, 10)).rejects.toThrow(
            'foobar failed after 0 attempts'
        )
    })
})
