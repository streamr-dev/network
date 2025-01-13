import { Defer } from '@streamr/utils'
import { SendFailed } from '../helpers/errors'

export class OutputBuffer {
    private readonly buffer: Uint8Array[] = []
    private readonly deferredPromise: Defer<void> = new Defer<void>()

    push(message: Uint8Array): Defer<void> {
        this.buffer.push(message)
        return this.deferredPromise
    }

    getBuffer(): Uint8Array[] {
        return this.buffer
    }

    resolve(): void {
        this.buffer.length = 0
        this.deferredPromise.resolve()
    }

    reject(): void {
        this.buffer.length = 0
        this.deferredPromise.reject(new SendFailed('Could not send buffered messages'))
    }
}
