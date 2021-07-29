import { once } from 'events'
import { waitForCondition, wait } from 'streamr-test-utils'
import { MessageQueue } from '../../src/connection/MessageQueue'
import { BrowserWebRtcConnection } from '../../src/connection/BrowserWebRtcConnection'
import { DeferredConnectionAttempt } from '../../src/connection/DeferredConnectionAttempt'
import { ConstructorOptions } from "../../src/connection/WebRtcConnection"
/**
 * Test that Connections can be established and message sent between them successfully. Tracker
 * is "abstracted away" by local functions.
 */
describe('Connection', () => {
    let conn1: BrowserWebRtcConnection
    let conn2: BrowserWebRtcConnection

    let expectErrors = false // set to true in a test to disable 'no error' assertion
    let oneErrors: Error[] = []
    let twoErrors: Error[] = []

    beforeEach(async () => {
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

        conn1 = new BrowserWebRtcConnection(connectionOpts1)
        conn2 = new BrowserWebRtcConnection(connectionOpts2)

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

    })

    beforeEach(() => {
        // capture errors
        oneErrors = []
        twoErrors = []
        expectErrors = false
        conn1.on('error', (err) => oneErrors.push(err))
        conn2.on('error', (err) => twoErrors.push(err))
    })

    afterEach(() => {
        if (expectErrors === false) {
            expect(oneErrors).toEqual([])
            expect(twoErrors).toEqual([])
        }
    })

    afterEach(()  => {
        conn1.close()
        conn2.close()
    })

    it('connection can be established', async () => {
        conn1.connect()
        conn2.connect()

        await Promise.all([once(conn1, 'open'), once(conn2, 'open')])

        expect(conn1.isOpen()).toEqual(true)
        expect(conn2.isOpen()).toEqual(true)
    })

    it('can send messages to each other', async () => {
        conn1.once('open', () => conn1.send('hello, world!'))
        conn2.once('open', () => conn2.send('lorem ipsum dolor sit amet'))

        const p1 = once(conn1, 'message')
        const p2 = once(conn2, 'message')
        conn1.connect()
        conn2.connect()
        const [connectionOneReceivedMsg, connectionTwoReceivedMsg] = await Promise.all([p1, p2])
        expect(connectionOneReceivedMsg[0]).toEqual('lorem ipsum dolor sit amet')
        expect(connectionTwoReceivedMsg[0]).toEqual('hello, world!')
    })

    it('ping-pong functionality', async () => {
        conn1.connect()
        conn2.connect()

        await Promise.all([once(conn1, 'open'), once(conn2, 'open')])

        expect(conn1.getRtt()).toEqual(null)
        expect(conn2.getRtt()).toEqual(null)

        conn1.ping()
        await waitForCondition(() => conn1.getRtt() != null)

        expect(conn1.getRtt()).toBeGreaterThanOrEqual(0)
        expect(conn2.getRtt()).toEqual(null)

        conn2.ping()
        await waitForCondition(() => conn2.getRtt() != null)
        expect(conn1.getRtt()).toBeGreaterThanOrEqual(0)
        expect(conn1.getRtt()).toBeGreaterThanOrEqual(0)
    })

    it('connection does not timeout if connection succeeds', async () => {
        // this test ensures failed connection timeout has been cleared
        const TIMEOUT = 3000
        // @ts-expect-error access private, only in test
        conn1.newConnectionTimeout = TIMEOUT
        // @ts-expect-error access private, only in test
        conn2.newConnectionTimeout = TIMEOUT
        conn1.connect()
        conn2.connect()
        await Promise.all([
            once(conn1, 'open'),
            once(conn2, 'open'),
        ])
        await wait(TIMEOUT * 2) // give enough time to time out
    }, 10000)

    it('connection gets closed if other end does not respond to pings', async () => {
        conn1.connect()
        conn2.connect()

        await Promise.all([once(conn1, 'open'), once(conn2, 'open')])

        conn2.pong = () => {
        } // hacky: prevent connectionTwo from responding
        // @ts-expect-error access private, only in test
        // eslint-disable-next-line require-atomic-updates
        conn1.pingPongTimeout = 50 // would be better to pass via constructor

        await Promise.allSettled([
            once(conn1, 'close'),
            once(conn2, 'close'),
            conn1.ping(),
            conn1.ping(),
            conn1.ping(),
            conn1.ping(),
            conn1.ping(),
            conn1.ping()
        ])

        expect(conn1.isOpen()).toEqual(false)
        expect(conn2.isOpen()).toEqual(false)
    })

    it('can not connect if closed then opened again in series', async () => {
        // open
        const t1 = Promise.allSettled([once(conn1, 'open'), once(conn2, 'open')])
        conn1.connect()
        conn2.connect()
        await t1
        expect(conn1.isOpen()).toEqual(true)
        expect(conn2.isOpen()).toEqual(true)
        const t2 = Promise.allSettled([once(conn1, 'close'), once(conn2, 'close')])
        // then close
        conn1.close()
        conn2.close()
        await t2
        expect(conn1.isOpen()).toEqual(false)
        expect(conn2.isOpen()).toEqual(false)

        await expect(async () => {
            conn1.connect()
        }).rejects.toThrow('closed')

        await expect(async () => {
            conn2.connect()
        }).rejects.toThrow('closed')

        expect(conn1.isOpen()).toEqual(false)
        expect(conn2.isOpen()).toEqual(false)
    })

    it('can not connect if closed then opened again in parallel', async () => {
        const connectResolved = jest.fn()
        const onConnect = once(conn1, 'open').finally(connectResolved)
        const onClose = once(conn1, 'close')
        conn1.connect()
        conn1.close()
        expect(() => {
            conn1.connect()
        }).toThrow('closed')
        await Promise.race([
            onConnect,
            wait(3000),
        ])
        await onClose // close should resolve
        expect(connectResolved).not.toHaveBeenCalled()
        expect(conn1.isOpen()).toEqual(false)
    })
})
