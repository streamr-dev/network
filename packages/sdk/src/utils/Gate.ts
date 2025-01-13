/**
 * Async Gate
 * Useful for blocking actions until some condition is met.
 * Starts open.
 *
 * gate.open() Opens gate
 * gate.close() Closes gate
 * gate.lock() Permanently lock gate. Pending & future check calls resolve false.
 * gate.check() Will async block if gate closed.
 * gate.check() Calls resolve true when gate opened.
 * gate.check() Calls resolve false when gate locked.
 *
 * ```ts
 * const gate = new Gate()
 * gate.close() // prevent gate.check() from resolving
 * const onOpen = gate.check().then(() => console.log('opened'))
 * await wait(100)
 * gate.open() // onOpen will now resolve
 * await gate.check() // gate is open so this will resolve immediately
 * gate.close()
 * // will block until open/lock is called
 * const onOpenAgain = gate.check().then((isOk) => console.log('is locked?', !isOk))
 * gate.lock() // prevent open/close.
 * // with lock() outstanding check() calls will resolve, but with false value
 * console.log(await gate.check()) // false
 * console.log(await gate.check()) // false
 * gate.open() // noop
 * console.log(await gate.check()) // false
 * gate.close() // noop
 * ```
 */
import { Defer } from '@streamr/utils'

// This is similar to the Gate class of @streamr/utils, but implements also locking featute
// TODO remove this class if the lock() feature is no longer needed and use the class
// from @streamr/utils instead

export class Gate {
    public isLocked = false
    private pending?: Defer<undefined>

    /**
     * Opens gate.
     * Pending check calls will resolve true.
     * Future check calls will resolve true, until close or lock called.
     */
    open(): void {
        if (this.isLocked) {
            // do nothing
            return
        }

        this.clearPending()
    }

    /**
     * Stops gate opening or closing. Pending and future calls will resolve false.
     */
    lock(): void {
        if (this.isLocked) {
            // do nothing
            return
        }

        this.isLocked = true
        this.clearPending()
    }

    /**
     * Opens gate but resolves pending with an error.
     * TODO: remove? might not be needed.
     */
    error(err: Error): void {
        if (this.isLocked) {
            // do nothing
            return
        }

        this.clearPending(err)
    }

    /**
     * Closes gate.
     * Noop if already closed.
     * Future check calls will block, until open or lock called.
     */
    close(): void {
        if (this.isLocked) {
            // do nothing
            return
        }

        if (!this.pending) {
            this.pending = new Defer<undefined>()
        }
    }

    /**
     * Calls open/close based on shouldBeOpen parameter.
     * Convenience.
     */
    setOpenState(shouldBeOpen: boolean): void {
        if (shouldBeOpen) {
            this.open()
        } else {
            this.close()
        }
    }

    /**
     * @returns True iff gate is open. False if locked or closed.
     */
    isOpen(): boolean {
        return !this.isLocked && !this.pending
    }

    private clearPending(err?: Error): void {
        const { pending } = this
        if (!pending) {
            return
        }
        this.pending = undefined

        if (err) {
            pending.reject(err)
        } else {
            pending.resolve(undefined)
        }
    }

    /**
     * @returns Promise<true> iff opened successfully
     */
    async check(): Promise<boolean> {
        if (this.pending) {
            await this.pending
        }

        return !this.isLocked
    }
}
