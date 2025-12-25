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

    describe('error handling', () => {
        describe('Node/Electron environment', () => {
            const originalProcessExit = process.exit

            beforeEach(() => {
                // Mock process.exit to prevent actual exit during tests
                process.exit = jest.fn() as any
            })

            afterEach(() => {
                // Restore original process.exit
                process.exit = originalProcessExit
            })

            it('should call process.exit(1) when promise rejects', async () => {
                const testError = new Error('Test error')
                
                await executeSafePromise(async () => {
                    throw testError
                })

                expect(process.exit).toHaveBeenCalledWith(1)
            })

            it('should log fatal error before exiting', async () => {
                // We can't easily test the logger output without mocking it,
                // but we can verify process.exit is called
                const testError = new Error('Fatal test error')
                
                await executeSafePromise(async () => {
                    throw testError
                })

                expect(process.exit).toHaveBeenCalled()
            })
        })

        describe('browser environment', () => {
            const originalProcess = global.process

            beforeEach(() => {
                // Simulate browser environment by removing process.exit
                // @ts-expect-error - intentionally deleting for test
                delete (global as any).process.exit
            })

            afterEach(() => {
                // Restore process
                global.process = originalProcess
            })

            it('should throw error with proper error chaining when promise rejects', async () => {
                const testError = new Error('Test error in browser')
                
                await expect(executeSafePromise(async () => {
                    throw testError
                })).rejects.toThrow('executeSafePromise: Assertion failure!')
            })

            it('should chain the original error as cause', async () => {
                const originalError = new Error('Original error')
                
                try {
                    await executeSafePromise(async () => {
                        throw originalError
                    })
                    fail('Should have thrown an error')
                } catch (err: any) {
                    expect(err.message).toBe('executeSafePromise: Assertion failure!')
                    expect(err.cause).toBe(originalError)
                }
            })
        })

        describe('environment detection', () => {
            it('should detect Node environment when process.exit is defined', async () => {
                const mockExit = jest.fn() as any
                const originalProcessExit = process.exit
                process.exit = mockExit

                await executeSafePromise(async () => {
                    throw new Error('Test')
                })

                expect(mockExit).toHaveBeenCalled()
                // eslint-disable-next-line require-atomic-updates
                process.exit = originalProcessExit
            })

            it('should detect browser environment when process.exit is undefined', async () => {
                const originalProcess = global.process
                // @ts-expect-error - intentionally setting to undefined for test
                delete (global as any).process.exit

                await expect(executeSafePromise(async () => {
                    throw new Error('Test')
                })).rejects.toThrow('executeSafePromise: Assertion failure!')

                // eslint-disable-next-line require-atomic-updates
                global.process = originalProcess
            })
        })
    })
})
