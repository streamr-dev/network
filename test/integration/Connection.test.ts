import { DescriptionType } from 'node-datachannel'
import { waitForCondition, wait } from 'streamr-test-utils'

import { Connection } from '../../src/connection/Connection'

interface ConnectionFunctions {
    onOpen: (data?: any) => void
    onClose: (data?: any) => void
    onError: () => void
    onMessage: (msg: string) => void
    onLocalDescription: (type: DescriptionType, description: string) => void
    onLocalCandidate: (candidate: string, mid: string) => void
}

function onConnectPromise(functions: ConnectionFunctions) {
    return new Promise((resolve, reject) => {
        // eslint-disable-next-line no-param-reassign
        functions.onOpen = resolve
        // eslint-disable-next-line no-param-reassign
        functions.onError = reject
    })
}

function onClosePromise(functions: ConnectionFunctions) {
    return new Promise((resolve, reject) => {
        // eslint-disable-next-line no-param-reassign
        functions.onClose = resolve
        // eslint-disable-next-line no-param-reassign
        functions.onError = reject
    })
}

/**
 * Test that Connections can be established and message sent between them successfully. Tracker
 * is "abstracted away" by local functions.
 */
describe('Connection', () => {
    let connectionOne: any
    let connectionTwo: any
    let oneFunctions: any
    let twoFunctions: any

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
            onOpen: () => {

            },
            onMessage: (msg: string) => {

            },
            onClose: () => {

            },
            onError: (err: Error) => {
                throw err
            }
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
            onOpen: () => {

            },
            onMessage: (msg: string) => {

            },
            onClose: () => {

            },
            onError: (err: Error) => {
                throw err
            }
        }
        connectionOne = new Connection({
            selfId: 'one',
            targetPeerId: 'two',
            routerId: 'routerId',
            stunUrls: [],
            isOffering: true,
            onLocalDescription: (...args) => oneFunctions.onLocalDescription(...args),
            onLocalCandidate: (...args) => oneFunctions.onLocalCandidate(...args),
            onOpen: (...args) => oneFunctions.onOpen(...args),
            onMessage: (...args) => oneFunctions.onMessage(...args),
            onClose: (...args) => oneFunctions.onClose(...args),
            onError: (...args) => oneFunctions.onError(...args),
            onBufferLow: () => {},
            onBufferHigh: () => {}
        })
        connectionTwo = new Connection({
            selfId: 'two',
            targetPeerId: 'one',
            routerId: 'routerId',
            stunUrls: [],
            isOffering: false,
            onLocalDescription: (...args) => twoFunctions.onLocalDescription(...args),
            onLocalCandidate: (...args) => twoFunctions.onLocalCandidate(...args),
            onOpen: (...args) => twoFunctions.onOpen(...args),
            onMessage: (...args) => twoFunctions.onMessage(...args),
            onClose: (...args) => twoFunctions.onClose(...args),
            onError: (...args) => twoFunctions.onError(...args),
            onBufferLow: () => {},
            onBufferHigh: () => {}
        })
    })

    afterEach(() => {
        connectionOne.close()
        connectionTwo.close()
    })

    it('connection can be established', async () => {
        connectionOne.connect()
        connectionTwo.connect()

        await Promise.all([onConnectPromise(oneFunctions), onConnectPromise(twoFunctions)])

        expect(connectionOne.isOpen()).toEqual(true)
        expect(connectionTwo.isOpen()).toEqual(true)
    })

    it('can send messages to each other', async () => {
        const p1 = new Promise((resolve) => {
            oneFunctions.onMessage = (message: string) => {
                resolve(message)
            }
        })
        const p2 = new Promise((resolve) => {
            twoFunctions.onMessage = (message: string) => {
                resolve(message)
            }
        })
        oneFunctions.onOpen = () => {
            connectionOne.send('hello, world!')
        }
        twoFunctions.onOpen = () => {
            connectionTwo.send('lorem ipsum dolor sit amet')
        }

        connectionOne.connect()
        connectionTwo.connect()
        const [connectionOneReceivedMsg, connectionTwoReceivedMsg] = await Promise.all([p1, p2])
        expect(connectionOneReceivedMsg).toEqual('lorem ipsum dolor sit amet')
        expect(connectionTwoReceivedMsg).toEqual('hello, world!')
    })

    it('ping-pong functionality', async () => {
        connectionOne.connect()
        connectionTwo.connect()

        await Promise.all([onConnectPromise(oneFunctions), onConnectPromise(twoFunctions)])

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

    it('messages delivered again on temporary loss of connectivity', async () => {
        connectionOne.connect()
        connectionTwo.connect()

        await Promise.all([onConnectPromise(oneFunctions), onConnectPromise(twoFunctions)])

        const msgsReceivedByConnectionTwo: string[] = []
        twoFunctions.onMessage = (msg: string) => msgsReceivedByConnectionTwo.push(msg)

        for (let i = 1; i <= 10; ++i) {
            connectionOne.send(`msg-${i}`)
            if (i % 5 === 0) {
                // eslint-disable-next-line no-await-in-loop
                await waitForCondition(() => msgsReceivedByConnectionTwo.length === 5)
                connectionTwo.close()
            }
        }
        await wait(50)
        connectionOne.connect()
        connectionTwo.connect()

        await waitForCondition(() => msgsReceivedByConnectionTwo.length >= 10, undefined, undefined, () => {
            return `expected msgsReceivedByConnectionTwo.length >= 10 but was ${msgsReceivedByConnectionTwo.length}`
        })
        expect(msgsReceivedByConnectionTwo).toEqual([
            'msg-1', 'msg-2', 'msg-3', 'msg-4', 'msg-5', 'msg-6', 'msg-7', 'msg-8', 'msg-9', 'msg-10'
        ])
    })

    it('connection timeouts if other end does not connect too', (done) => {
        connectionOne.newConnectionTimeout = 200 // would be better to pass via constructor
        connectionOne.connect()
        oneFunctions.onError = (err: Error) => {
            expect(err).toEqual(new Error('timed out'))
            expect(connectionOne.isOpen()).toEqual(false)
            done()
        }
    })

    it('connection gets closed if other end does not respond to pings', async () => {
        connectionOne.connect()
        connectionTwo.connect()

        await Promise.all([onConnectPromise(oneFunctions), onConnectPromise(twoFunctions)])

        connectionTwo.pong = () => {} // hacky: prevent connectionTwo from responding
        // eslint-disable-next-line require-atomic-updates
        connectionOne.pingPongTimeout = 50 // would be better to pass via constructor
        connectionOne.ping()
        connectionOne.ping()

        await Promise.allSettled([onClosePromise(oneFunctions), onClosePromise(twoFunctions)])

        expect(connectionOne.isOpen()).toEqual(false)
        expect(connectionTwo.isOpen()).toEqual(false)
    })
})
