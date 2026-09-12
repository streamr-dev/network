import { wait } from '@streamr/utils'
import { ManagedConnection } from '../../src/connection/ManagedConnection'
import { ConnectionType } from '../../src/connection/IConnection'
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

    it('exposes connection type and live connection info', async () => {
        connection.connectionType = ConnectionType.WEBRTC
        connection.connectionInfo = { local: 'relay/udp', remote: 'host/udp', rttMs: 12 }
        expect(managedConnection.getConnectionType()).toBe(ConnectionType.WEBRTC)
        expect(await managedConnection.getConnectionInfo()).toEqual({ local: 'relay/udp', remote: 'host/udp', rttMs: 12 })
        expect(managedConnection.getDiagnosticInfo().connectionType).toBe(ConnectionType.WEBRTC)
    })

    it('getConnectionInfo never rejects', async () => {
        connection.connectionInfo = 'throw'
        expect(await managedConnection.getConnectionInfo()).toBeUndefined()
    })

    it('getStatistics is undefined for transports without statistics', () => {
        expect(managedConnection.getStatistics()).toBeUndefined()
        expect(managedConnection.getDiagnosticInfo().statistics).toBeUndefined()
    })

    it('getStatistics merges the transport snapshot with the receive rate', () => {
        connection.sendStatistics = {
            bufferedAmount: 10, queuedMessages: 2, queuedBytes: 30, oldestQueuedMs: 5, offeredBytesPerSecond: 100, sentBytesPerSecond: 60
        }
        connection.emitData(new Uint8Array(300))
        const statistics = managedConnection.getStatistics()!
        expect(statistics).toMatchObject({
            bufferedAmount: 10, queuedMessages: 2, queuedBytes: 30, oldestQueuedMs: 5, offeredBytesPerSecond: 100, sentBytesPerSecond: 60,
            backlogBytes: 40, receivedBytesPerSecond: 300
        })
        expect(Math.abs(statistics.sampledAt - Date.now())).toBeLessThan(1000)
        expect(managedConnection.getDiagnosticInfo().statistics).toMatchObject({ backlogBytes: 40 })
    })

    it('getStatistics never throws', () => {
        connection.sendStatistics = 'throw'
        expect(managedConnection.getStatistics()).toBeUndefined()
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
