import { NodeWebRtcConnection } from "../../src/connection/NodeWebRtcConnection"
import { runAndWaitForEvents, waitForEvent } from "streamr-test-utils"
import { MessageQueue} from "../../src/connection/MessageQueue"
import { ConstructorOptions, DeferredConnectionAttempt } from "../../src/connection/WebRtcConnection"
import { DescriptionType } from "node-datachannel"


const connectionOpts1: ConstructorOptions = {
    selfId: 'peer1',
    targetPeerId: 'peer2',
    routerId: 'tracker',
    stunUrls: [],
    messageQueue: new MessageQueue<string>(),
    deferredConnectionAttempt: new DeferredConnectionAttempt('peer2')
}

const connectionOpts2: ConstructorOptions = {
    selfId: 'peer2',
    targetPeerId: 'peer1',
    routerId: 'tracker',
    stunUrls: [],
    messageQueue: new MessageQueue<string>(),
    deferredConnectionAttempt: new DeferredConnectionAttempt('peer1')
}

describe('NodeWebRtcConnection', () => {

    const conn1 = new NodeWebRtcConnection(connectionOpts1)
    const conn2 = new NodeWebRtcConnection(connectionOpts2)

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

    afterAll(async () => {
        conn1.close()
        conn2.close()
    })

    it('can connect', async () => {
        expect(conn1.isOpen()).toEqual(true)
        expect(conn2.isOpen()).toEqual(true)
    })

    it('can send message', (done) => {
        conn2.on('message', (msg) => {
            expect(msg).toEqual('test1')
            done()
        })
        conn1.on('message', (msg) => {
            expect(msg).toEqual('test2')
            done()
        })
        conn1.send('test1')
        conn2.send('test1')
    })
})
