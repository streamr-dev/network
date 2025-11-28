import once from 'lodash/once'

type ResolveFn<T> = (value: T | PromiseLike<T>) => void

type RejectFn = (reason?: unknown) => void

const noopExecutor = () => {}

/**
 * Deferred promise allowing external control of resolve / reject.
 */
export class Defer<T> extends Promise<T> {
    private readonly resolveFn: ResolveFn<T>
    private readonly rejectFn: RejectFn
    private readonly ensureNoopCatchAttached: () => void
    private settled = false

    constructor(executor: (resolve: ResolveFn<T>, reject: RejectFn) => void = noopExecutor) {
        let localResolve: ResolveFn<T> | undefined
        let localReject: RejectFn | undefined
        super((resolve, reject) => {
            localResolve = resolve
            localReject = reject
            executor(resolve, reject)
        })
        if (localResolve === undefined) {
            throw new Error('invariant violation: resolveFn was undefined')
        }
        if (localReject === undefined) {
            throw new Error('invariant violation: rejectFn was undefined')
        }
        this.resolveFn = localResolve
        this.rejectFn = localReject
        this.ensureNoopCatchAttached = once(() => {
            super.catch(() => {})
        })
    }

    resolve(value: T): void {
        this.ensureNoopCatchAttached()
        if (!this.settled) {
            this.settled = true
            this.resolveFn(value)
        }
    }

    reject(error: unknown): void {
        this.ensureNoopCatchAttached()
        if (!this.settled) {
            this.settled = true
            this.rejectFn(error)
        }
    }

    wrap<ArgsType extends unknown[]>(fn: (...args: ArgsType) => T | PromiseLike<T>): (...args: ArgsType) => Promise<T> {
        this.ensureNoopCatchAttached()
        return async (...args: ArgsType) => {
            try {
                const value = await fn(...args)
                this.resolve(value)
                return value
            } catch (err) {
                // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
                this.reject(err)
                throw err
            }
        }
    }
}
