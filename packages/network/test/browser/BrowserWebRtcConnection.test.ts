import BrowserWebRtcConnectionFactory from "../../src/connection/BrowserWebRtcConnection"
import { runAndWaitForEvents } from "streamr-test-utils"
import { MessageQueue} from "../../src/connection/MessageQueue"
import { ConstructorOptions } from "../../src/connection/WebRtcConnection"
import { DeferredConnectionAttempt } from "../../src/connection/DeferredConnectionAttempt"

const connectionOpts1: ConstructorOptions = {
    selfId: 'peer1',
    targetPeerId: 'peer2',
    routerId: 'tracker',
    stunUrls: [],
    messageQueue: new MessageQueue<string>(),
    deferredConnectionAttempt: new DeferredConnectionAttempt()
}

const connectionOpts2: ConstructorOptions = {
    selfId: 'peer2',
    targetPeerId: 'peer1',
    routerId: 'tracker',
    stunUrls: [],
    messageQueue: new MessageQueue<string>(),
    deferredConnectionAttempt: new DeferredConnectionAttempt()
}

describe('BrowserWebRtcConnection', () => {

    const conn1 = BrowserWebRtcConnectionFactory.createConnection(connectionOpts1)
    const conn2 = BrowserWebRtcConnectionFactory.createConnection(connectionOpts2)

    conn1.on('localCandidate', (candidate, mid) => {
        conn2.addRemoteCandidate(candidate, mid)
    })
    conn2.on('localCandidate', (candidate, mid) => {
        conn1.addRemoteCandidate(candidate, mid)
    })
    conn1.on('localDescription', (type, description) => {
        conn2.setRemoteDescription(description, type)
    })
    conn2.on('localDescription', (type, description) => {
        conn1.setRemoteDescription(description, type)
    })
    beforeAll(async () => {
        await runAndWaitForEvents([
            () => {
                conn1.connect()
            },
            () => {
                conn2.connect()
            }], [
            [conn1, 'open'],
            [conn2, 'open']
        ])
    })

    afterAll(() => {
        conn1.close()
        conn2.close()
        BrowserWebRtcConnectionFactory.cleanUp()
    })

    it('can connect', async () => {
        expect(conn1.isOpen()).toEqual(true)
        expect(conn2.isOpen()).toEqual(true)
    })

    it('can send message', async () => {
        await runAndWaitForEvents([
            () => {
                conn1.send('test')
            },
            () => {
                conn2.send('test')
            }], [
            [conn1, 'message'],
            [conn2, 'message']
        ])
    })
})
