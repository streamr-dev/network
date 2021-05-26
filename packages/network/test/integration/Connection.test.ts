import { once } from 'events'
import { DescriptionType } from 'node-datachannel'
import { waitForCondition, wait } from 'streamr-test-utils'

import { MessageQueue } from '../../src/connection/MessageQueue'
import { Connection } from '../../src/connection/Connection'

/**
 * Test that Connections can be established and message sent between them successfully. Tracker
 * is "abstracted away" by local functions.
 */
describe('Connection', () => {
    let connectionOne: Connection
    let connectionTwo: Connection
    let oneFunctions: any
    let twoFunctions: any

    let expectErrors = false // set to true in a test to disable 'no error' assertion
    let oneErrors: Error[] = []
    let twoErrors: Error[] = []

    beforeEach(async () => {
        oneFunctions = {
            onLocalDescription: (type: DescriptionType, description: string) => {
                // Simulate tracker relay behaviour
                connectionTwo.setRemoteDescription(description, type)
            },
            onLocalCandidate: (candidate: string, mid: string) => {
                // Simulate tracker relay behaviour
                connectionTwo.addRemoteCandidate(candidate, mid)
            },
        }
        twoFunctions = {
            onLocalDescription: (type: DescriptionType, description: string) => {
                // Simulate tracker relay behaviour
                connectionOne.setRemoteDescription(description, type)
            },
            onLocalCandidate: (candidate: string, mid: string) => {
                // Simulate tracker relay behaviour
                connectionOne.addRemoteCandidate(candidate, mid)
            },
        }
        const messageQueueOne = new MessageQueue<string>()
        const messageQueueTwo = new MessageQueue<string>()
        connectionOne = new Connection({
            selfId: 'one',
            targetPeerId: 'two',
            routerId: 'routerId',
            stunUrls: [],
            isOffering: true,
            messageQueue: messageQueueOne,
        })
        connectionOne.on('localDescription', (...args) => oneFunctions.onLocalDescription(...args))
        connectionOne.on('localCandidate', (...args) => oneFunctions.onLocalCandidate(...args))

        connectionTwo = new Connection({
            selfId: 'two',
            targetPeerId: 'one',
            routerId: 'routerId',
            stunUrls: [],
            isOffering: false,
            messageQueue: messageQueueTwo,
        })

        connectionTwo.on('localDescription', (...args) => twoFunctions.onLocalDescription(...args))
        connectionTwo.on('localCandidate', (...args) => twoFunctions.onLocalCandidate(...args))
    })

    beforeEach(() => {
        // capture errors
        oneErrors = []
        twoErrors = []
        expectErrors = false
        connectionTwo.on('error', (err) => oneErrors.push(err))
        connectionTwo.on('error', (err) => twoErrors.push(err))
    })

    afterEach(() => {
        if (expectErrors === false) {
            expect(oneErrors).toEqual([])
            expect(twoErrors).toEqual([])
        }
    })

    afterEach(async () => {
        if (connectionOne.isOpen()) {
            const onClose1 = once(connectionOne, 'close')
            connectionOne.close()
            await onClose1
        }
        if (connectionTwo.isOpen()) {
            const onClose2 = once(connectionTwo, 'close')
            connectionTwo.close()
            await onClose2
        }
    })

    it('connection can be established', async () => {
        connectionOne.connect()
        connectionTwo.connect()

        await Promise.all([once(connectionOne, 'open'), once(connectionTwo, 'open')])

        expect(connectionOne.isOpen()).toEqual(true)
        expect(connectionTwo.isOpen()).toEqual(true)
    })

    it('can send messages to each other', async () => {
        connectionOne.once('open', () => connectionOne.send('hello, world!'))
        connectionTwo.once('open', () => connectionTwo.send('lorem ipsum dolor sit amet'))

        const p1 = once(connectionOne, 'message')
        const p2 = once(connectionTwo, 'message')
        connectionOne.connect()
        connectionTwo.connect()
        const [connectionOneReceivedMsg, connectionTwoReceivedMsg] = await Promise.all([p1, p2])
        expect(connectionOneReceivedMsg[0]).toEqual('lorem ipsum dolor sit amet')
        expect(connectionTwoReceivedMsg[0]).toEqual('hello, world!')
    })

    it('ping-pong functionality', async () => {
        connectionOne.connect()
        connectionTwo.connect()

        await Promise.all([once(connectionOne, 'open'), once(connectionTwo, 'open')])

        expect(connectionOne.getRtt()).toEqual(null)
        expect(connectionTwo.getRtt()).toEqual(null)

        connectionOne.ping()
        await waitForCondition(() => connectionOne.getRtt() != null)

        expect(connectionOne.getRtt()).toBeGreaterThanOrEqual(0)
        expect(connectionTwo.getRtt()).toEqual(null)

        connectionTwo.ping()
        await waitForCondition(() => connectionTwo.getRtt() != null)
        expect(connectionOne.getRtt()).toBeGreaterThanOrEqual(0)
        expect(connectionTwo.getRtt()).toBeGreaterThanOrEqual(0)
    })

    /* Condition is not valid anymore, as onOffer creates connection if it does not exist
    it('connection timeouts if other end does not connect too', async () => {
        expectErrors = true
        // @ts-expect-error access private, only in test
        connectionOne.newConnectionTimeout = 3000 // would be better to pass via constructor
        connectionOne.connect()
        await expect(async () => (
            once(connectionOne, 'open')
        )).rejects.toThrow('timed out')
    })
    */

    it('connection does not timeout if connection succeeds', async () => {
        // this test ensures failed connection timeout has been cleared
        const TIMEOUT = 3000
        // @ts-expect-error access private, only in test
        connectionOne.newConnectionTimeout = TIMEOUT
        // @ts-expect-error access private, only in test
        connectionTwo.newConnectionTimeout = TIMEOUT
        connectionOne.connect()
        connectionTwo.connect()
        await Promise.all([
            once(connectionOne, 'open'),
            once(connectionTwo, 'open'),
        ])
        await wait(TIMEOUT * 2) // give enough time to time out
    })

    it('connection gets closed if other end does not respond to pings', async () => {
        connectionOne.connect()
        connectionTwo.connect()

        await Promise.all([once(connectionOne, 'open'), once(connectionTwo, 'open')])

        connectionTwo.pong = () => {} // hacky: prevent connectionTwo from responding
        // @ts-expect-error access private, only in test
        // eslint-disable-next-line require-atomic-updates
        connectionOne.pingPongTimeout = 50 // would be better to pass via constructor
        connectionOne.ping()
        connectionOne.ping()

        await Promise.allSettled([once(connectionOne, 'close'), once(connectionTwo, 'close')])

        expect(connectionOne.isOpen()).toEqual(false)
        expect(connectionTwo.isOpen()).toEqual(false)
    })

    it('can not connect if closed then opened again in series', async () => {
        // open
        const t1 = Promise.allSettled([once(connectionOne, 'open'), once(connectionTwo, 'open')])
        connectionOne.connect()
        connectionTwo.connect()
        await t1
        expect(connectionOne.isOpen()).toEqual(true)
        expect(connectionTwo.isOpen()).toEqual(true)
        const t2 = Promise.allSettled([once(connectionOne, 'close'), once(connectionTwo, 'close')])
        // then close
        connectionOne.close()
        connectionTwo.close()
        await t2
        expect(connectionOne.isOpen()).toEqual(false)
        expect(connectionTwo.isOpen()).toEqual(false)

        await expect(async () => {
            connectionOne.connect()
        }).rejects.toThrow('closed')

        await expect(async () => {
            connectionTwo.connect()
        }).rejects.toThrow('closed')

        expect(connectionOne.isOpen()).toEqual(false)
        expect(connectionTwo.isOpen()).toEqual(false)
    })

    it('can not connect if closed then opened again in parallel', async () => {
        const connectResolved = jest.fn()
        const onConnect = once(connectionOne, 'open').finally(connectResolved)
        const onClose = once(connectionOne, 'close')
        connectionOne.connect()
        connectionOne.close()
        expect(() => {
            connectionOne.connect()
        }).toThrow('closed')
        await Promise.race([
            onConnect,
            wait(3000),
        ])
        await onClose // close should resolve
        expect(connectResolved).not.toHaveBeenCalled()
        expect(connectionOne.isOpen()).toEqual(false)
    })
})
