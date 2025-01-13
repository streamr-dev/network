import { wait } from '@streamr/utils'
import { ManagedConnection } from '../../src/exports'
import { MockConnection } from '../utils/mock/MockConnection'
import { createMockPeerDescriptor } from '../utils/utils'

describe('ManagedConnection', () => {
    let managedConnection: ManagedConnection
    let connection: MockConnection
    beforeEach(() => {
        connection = new MockConnection()
        managedConnection = new ManagedConnection(createMockPeerDescriptor(), connection)
    })

    afterEach(() => {
        managedConnection.close(false)
    })

    it('emits disconnected after close', (done) => {
        managedConnection.once('disconnected', (graceful) => {
            expect(graceful).toBe(true)
            done()
        })
        managedConnection.close(true)
    })

    it('sends data', () => {
        const data = new Uint8Array([1, 2, 3])
        managedConnection.send(data)
        expect(connection.sentData[0]).toEqual(data)
    })

    it('emits data', (done) => {
        const data = new Uint8Array([1, 2, 3])
        managedConnection.on('managedData', (data) => {
            expect(data).toEqual(data)
            done()
        })
        connection.emitData(data)
    })

    it('sets lastUsedTimestamp on send', async () => {
        const createdTimestamp = managedConnection.getLastUsedTimestamp()
        await wait(5)
        managedConnection.send(new Uint8Array([1, 2, 3]))
        expect(managedConnection.getLastUsedTimestamp()).toBeGreaterThan(createdTimestamp)
    })

    it('replace as duplicate', async () => {
        managedConnection.once('disconnected', () => {
            throw new Error('disconnected')
        })
        managedConnection.replaceAsDuplicate()
        managedConnection.close(true)
        await wait(50)
    })
})
