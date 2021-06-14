import { wait } from 'streamr-test-utils'
import { MessageLayer, ControlLayer } from 'streamr-client-protocol'

import { fakePrivateKey, addAfterFn } from '../utils'
import { pipeline } from '../../src/utils/iterators'
import PushQueue from '../../src/utils/PushQueue'
import { StreamrClient } from '../../src/StreamrClient'
import Connection from '../../src/Connection'

import { clientOptions } from './config'
import MessagePipeline from '../../src/subscribe/pipeline'
import { Subscription } from '../../src/subscribe'
import Validator from '../../src/subscribe/Validator'

const { StreamMessage, MessageID } = MessageLayer
const { BroadcastMessage } = ControlLayer

const MOCK_INVALID_GROUP_KEY_MESSAGE = new StreamMessage({
    messageId: new MessageID(
        'SYSTEM/keyexchange/0x848f6fc62d8c6471ab0d0dd7ae7439e6bf927cf8',
        0,
        1614960211925,
        0,
        '0x320e5461c6521fce2df230e0cdfe715baa01b094',
        'nl9gi01z8qnz4st4frdb'
    ),
    prevMsgRef: null,
    messageType: 31,
    contentType: 0,
    encryptionType: 0,
    groupKeyId: null,
    newGroupKey: null,
    signatureType: 2,
    signature: '0xaf53be7ac333480b9dc2fcc5a171a661e1077738bf8446e36f4dd3214582153403e2f2b57ddd5b3dcb8e8ef77212160d8a0cfeb61b212221361a96391d7582fe1c',
    // eslint-disable-next-line max-len
    content: [
        // mock INVALID_GROUP_KEY_REQUEST
        'ff7a68fa-acbd-4540-8e7e-11b5e0413e49:GroupKeyRequest15',
        'VLKnLfRcTLGaG5FDEj2qZw',
        'INVALID_GROUP_KEY_REQUEST',
        '0x848f6fc62d8c6471ab0d0dd7ae7439e6bf927cf8 is not a subscriber on stream VLKnLfRcTLGaG5FDEj2qZw. Group key request: ...',
        ['ff7a68fa-acbd-4540-8e7e-11b5e0413e49:GroupKey11']
    ]
})

describe('MessagePipeline', () => {
    let expectErrors = 0 // check no errors by default
    let errors = []

    const getOnError = (errs) => jest.fn((err) => {
        errs.push(err)
    })

    let onError = jest.fn()
    let client

    const createClient = (opts = {}) => {
        const c = new StreamrClient({
            ...clientOptions,
            auth: {
                privateKey: fakePrivateKey(),
            },
            autoConnect: false,
            autoDisconnect: false,
            disconnectDelay: 1,
            publishAutoDisconnectDelay: 50,
            maxRetries: 2,
            cache: {
                maxAge: 1,
            },
            ...opts,
        })
        c.onError = jest.fn()
        c.on('error', onError)

        return c
    }

    const addAfter = addAfterFn()

    beforeEach(() => {
        errors = []
        expectErrors = 0
        onError = getOnError(errors)
    })

    afterEach(async () => {
        await wait()
        // ensure no unexpected errors
        expect(errors).toHaveLength(expectErrors)
        if (client) {
            expect(client.onError).toHaveBeenCalledTimes(expectErrors)
        }
    })

    afterEach(async () => {
        await wait()
        if (client) {
            client.debug('disconnecting after test')
            await client.disconnect()
        }

        const openSockets = Connection.getOpen()
        if (openSockets !== 0) {
            throw new Error(`sockets not closed: ${openSockets}`)
        }
    })

    async function setupClient(opts) {
        client = createClient(opts)
        await Promise.all([
            client.session.getSessionToken(),
            client.connect(),
        ])
    }

    beforeEach(async () => {
        await setupClient()
    })

    it('handles errors', async () => {
        const validate = Validator(client, MOCK_INVALID_GROUP_KEY_MESSAGE.messageId)
        let p
        const onPipelineError = jest.fn(async (err) => {
            await wait(10)
            return p.cancel(err)
        })
        p = pipeline([
            async function* generate() {
                await wait(10)
                yield MOCK_INVALID_GROUP_KEY_MESSAGE
            },
            async function* ValidateMessages(src) {
                for await (const streamMessage of src) {
                    try {
                        await validate(streamMessage)
                    } catch (err) {
                        await onPipelineError(err)
                    }
                    yield streamMessage
                }
            },
            async function* Delay(src) {
                for await (const streamMessage of src) {
                    await wait(10)
                    yield streamMessage
                }
            },
            pipeline([
                async function* ValidateMessages2(src) {
                    yield* (async function* validate2() {
                        for await (const streamMessage of src) {
                            try {
                                await wait(10)
                                await validate(streamMessage)
                            } catch (err) {
                                await onPipelineError(err)
                            }
                            yield streamMessage
                        }
                    }())
                },
            ])
        ])

        const received = []
        await expect(async () => {
            for await (const streamMessage of p) {
                received.push(streamMessage)
            }
        }).rejects.toThrow()
        expect(received).toHaveLength(0)
        expect(onPipelineError).toHaveBeenCalledTimes(1)
    })

    it('handles errors in MessagePipeline', async () => {
        const onPipelineError = jest.fn((err) => {
            throw err
        })
        const msgStream = new PushQueue([])
        const p = MessagePipeline(client, {
            ...MOCK_INVALID_GROUP_KEY_MESSAGE.messageId,
            msgStream,
            onError: onPipelineError,
        }, (err) => {
            if (err) {
                throw err
            }
        })
        const t = setTimeout(() => {
            msgStream.push(new BroadcastMessage({
                streamMessage: MOCK_INVALID_GROUP_KEY_MESSAGE,
                requestId: '',
            }))
        }, 15)
        addAfter(() => clearTimeout(t))

        const received = []
        await expect(async () => {
            for await (const streamMessage of p) {
                received.push(streamMessage)
            }
        }).rejects.toThrow()
        expect(received).toHaveLength(0)
        expect(onPipelineError).toHaveBeenCalledTimes(1)
    })

    it('handles errors in Subscription', async () => {
        const onPipelineError = jest.fn((err) => {
            throw err
        })
        const msgStream = new PushQueue()
        const sub = new Subscription(client, {
            ...MOCK_INVALID_GROUP_KEY_MESSAGE.messageId,
            msgStream,
        }, (err) => {
            if (err) {
                throw err
            }
        })
        sub.on('error', onPipelineError)

        const t = setTimeout(() => {
            msgStream.push(new BroadcastMessage({
                streamMessage: MOCK_INVALID_GROUP_KEY_MESSAGE,
                requestId: '',
            }))
        }, 15)
        addAfter(() => clearTimeout(t))
        const received = []
        await expect(async () => {
            for await (const streamMessage of sub) {
                received.push(streamMessage)
            }
        }).rejects.toThrow()
        expect(received).toHaveLength(0)
        expect(onPipelineError).toHaveBeenCalledTimes(1)
    })

    it('handles errors in client.subscribe', async () => {
        const onPipelineError = jest.fn((err) => {
            throw err
        })
        const msgStream = new PushQueue()
        const sub = await client.subscribe({
            ...MOCK_INVALID_GROUP_KEY_MESSAGE.messageId,
            msgStream,
            subscribe: async () => {
                await wait(10)
            },
            unsubscribe: async () => {
                await wait(10)
            },
        })
        sub.on('error', onPipelineError)

        const t = setTimeout(() => {
            msgStream.push(new BroadcastMessage({
                streamMessage: MOCK_INVALID_GROUP_KEY_MESSAGE,
                requestId: '',
            }))
        }, 15)
        addAfter(() => clearTimeout(t))

        const received = []
        await expect(async () => {
            for await (const streamMessage of sub) {
                received.push(streamMessage)
            }
        }).rejects.toThrow()
        expect(received).toHaveLength(0)
        expect(onPipelineError).toHaveBeenCalledTimes(1)
    })
})
