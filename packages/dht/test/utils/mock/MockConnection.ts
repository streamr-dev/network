import { EventEmitter } from 'eventemitter3'
import { ConnectionInfo } from '../../../src/connection/ConnectionDiagnostics'
import { ConnectionEvents, ConnectionType, IConnection } from '../../../src/connection/IConnection'

export class MockConnection extends EventEmitter<ConnectionEvents> implements IConnection {

    public sentData: Uint8Array[] = []
    public connectionType?: ConnectionType
    public connectionInfo?: ConnectionInfo | 'throw'

    async getConnectionInfo(): Promise<ConnectionInfo | undefined> {
        if (this.connectionInfo === 'throw') {
            throw new Error('mock getConnectionInfo failure')
        }
        return this.connectionInfo
    }

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
