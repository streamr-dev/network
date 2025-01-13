import EventEmitter from 'eventemitter3'
import { ConnectionEvents, IConnection } from '../../../src/connection/IConnection'

export class MockConnection extends EventEmitter<ConnectionEvents> implements IConnection {
    public sentData: Uint8Array[] = []

    send(data: Uint8Array): Promise<void> {
        this.sentData.push(data)
        return Promise.resolve()
    }

    close(graceful: boolean): Promise<void> {
        this.emit('disconnected', graceful)
        return Promise.resolve()
    }

    destroy(): void {
        this.removeAllListeners()
    }

    emitData(message: Uint8Array): void {
        this.emit('data', message)
    }
}
