import { webRtcConnectionFactory } from "../../src/connection/webrtc/NodeWebRtcConnection"
import { MessageQueue } from "../../src/connection/MessageQueue"
import { ConstructorOptions } from "../../src/connection/webrtc/WebRtcConnection"
import { DeferredConnectionAttempt } from "../../src/connection/webrtc/DeferredConnectionAttempt"
import { TEST_CONFIG } from '../../src/createNetworkNode'

const connectionOpts1: ConstructorOptions = {
    selfId: 'peer1',
    targetPeerId: 'peer2',
    routerId: 'tracker',
    iceServers: [],
    pingInterval: 5000,
    messageQueue: new MessageQueue<string>(TEST_CONFIG.webrtcSendBufferMaxMessageCount),
    deferredConnectionAttempt: new DeferredConnectionAttempt(),
    portRange: TEST_CONFIG.webrtcPortRange,
    maxMessageSize: TEST_CONFIG.webrtcDatachannelMaxMessageSize
}

const connectionOpts2: ConstructorOptions = {
    selfId: 'peer2',
    targetPeerId: 'peer1',
    routerId: 'tracker',
    iceServers: [],
    pingInterval: 5000,
    messageQueue: new MessageQueue<string>(TEST_CONFIG.webrtcSendBufferMaxMessageCount),
    deferredConnectionAttempt: new DeferredConnectionAttempt(),
    portRange: TEST_CONFIG.webrtcPortRange,
    maxMessageSize: TEST_CONFIG.webrtcDatachannelMaxMessageSize
}

describe('NodeWebRtcConnection', () => {

    const conn1 = webRtcConnectionFactory.createConnection(connectionOpts1)
    const conn2 = webRtcConnectionFactory.createConnection(connectionOpts2)

    conn1.on('localCandidate', (candidate, mid) => {
        conn2.addRemoteCandidate(candidate, mid)
    })
    conn2.on('localCandidate', (_ucandidate, _umid) => {
        //conn1.addRemoteCandidate(candidate, mid)
    })
    conn1.on('localDescription', (type, description) => {
        conn2.setRemoteDescription(description, type)
    })
    conn2.on('localDescription', (_utype, _udescription) => {
        //conn1.setRemoteDescription(description, type)
    })
    beforeAll(async () => {
        conn1.connect()
        conn2.connect()
    })

    afterAll(() => {
        conn1.close()
        conn2.close()
    })

    it('can connect', async () => {
        expect(true)
    })
})
