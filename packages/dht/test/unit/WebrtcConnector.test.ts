import { WebrtcConnector } from '../../src/connection/webrtc/WebrtcConnector'
import { MockConnection } from '../utils/mock/MockConnection'
import { MockTransport } from '../utils/mock/MockTransport'
import { createMockPeerDescriptor } from '../utils/utils'

describe('WebrtcConnector', () => {
    let connector: WebrtcConnector

    beforeEach(() => {
        connector = new WebrtcConnector({
            transport: new MockTransport()
        } as any)
    })

    afterEach(() => {
        connector.stop()
    })

    describe('Connect', () => {
        it('Returns existing connecting connection', () => {
            connector.setLocalPeerDescriptor(createMockPeerDescriptor())
            const remotePeerDescriptor = createMockPeerDescriptor()
            const firstConnection = connector.connect(remotePeerDescriptor, false)
            const secondConnection = connector.connect(remotePeerDescriptor, false)
            expect(firstConnection).toEqual(secondConnection)
            firstConnection.close(false)
        })

        it('Disconnected event removes connecting connection', () => {
            connector.setLocalPeerDescriptor(createMockPeerDescriptor())
            const remotePeerDescriptor = createMockPeerDescriptor()
            const firstConnection = connector.connect(remotePeerDescriptor, false)
            firstConnection.emit('disconnected', false)
            const secondConnection = connector.connect(remotePeerDescriptor, false)
            expect(firstConnection).not.toEqual(secondConnection)
            firstConnection.close(false)
            secondConnection.close(false)
        })

        it('Connected event removes connecting connection', () => {
            connector.setLocalPeerDescriptor(createMockPeerDescriptor())
            const remotePeerDescriptor = createMockPeerDescriptor()
            const firstConnection = connector.connect(remotePeerDescriptor, false)
            firstConnection.onHandshakeCompleted(new MockConnection())
            const secondConnection = connector.connect(remotePeerDescriptor, false)
            expect(firstConnection).not.toEqual(secondConnection)
            firstConnection.close(false)
            secondConnection.close(false)
        })
    })
})
