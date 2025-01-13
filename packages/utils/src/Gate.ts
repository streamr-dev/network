import { Defer } from './Defer'

/*
 * Gate to lock access to some resource.
 */
export class Gate {
    private pending?: Defer<undefined>

    constructor(isOpen: boolean) {
        if (!isOpen) {
            this.close()
        }
    }

    open(): void {
        this.clearPending()
    }

    close(): void {
        if (this.pending === undefined) {
            this.pending = new Defer<undefined>()
        }
    }

    isOpen(): boolean {
        return !this.pending
    }

    private clearPending(): void {
        const { pending } = this
        if (pending === undefined) {
            return
        }
        this.pending = undefined
        pending.resolve(undefined)
    }

    async waitUntilOpen(): Promise<void> {
        if (this.pending) {
            await this.pending
        }
    }
}
