import 'reflect-metadata'

import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { StreamPermission } from '../../src/permission'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { Msg } from '../test-utils/publish'
import { createTestStream } from '../test-utils/utils'
import { EthereumKeyPairIdentity, Identity, MLDSAKeyPairIdentity, Subscription } from '../../src'

describe('Quantum encryption policies', () => {

    let publisherIdentity: Identity
    let subscriberIdentity: Identity
    let quantumPublisher: StreamrClient
    let quantumSubscriber: StreamrClient
    let nonQuantumClient: StreamrClient
    let stream: Stream
    let environment: FakeEnvironment

    beforeEach(async () => {
        environment = new FakeEnvironment()

        publisherIdentity = MLDSAKeyPairIdentity.generate()
        subscriberIdentity = MLDSAKeyPairIdentity.generate()

        // Client for setting up the stream
        nonQuantumClient = environment.createClient({
            auth: {
                identity: EthereumKeyPairIdentity.generate(),
            }
        })
        // nonQuantumClient also has pub/sub permissions to stream because it created the stream
        stream = await createTestStream(nonQuantumClient, module)
        await stream.grantPermissions({ permissions: [StreamPermission.PUBLISH], userId: await publisherIdentity.getUserId() })
        await stream.grantPermissions({ permissions: [StreamPermission.SUBSCRIBE], userId: await subscriberIdentity.getUserId() })
    })

    afterEach(async () => {
        await environment.destroy()
    })

    describe('pubsub under strict quantum settings', () => {

        let sub: Subscription

        beforeEach(async () => {
            // Clients for pub/sub (can't make transactions)
            quantumPublisher = environment.createClient({
                auth: {
                    identity: publisherIdentity,
                },
                encryption: {
                    requireQuantumResistantSignatures: true,
                    requireQuantumResistantKeyExchange: true,
                    requireQuantumResistantEncryption: true,
                }
            })
            quantumSubscriber = environment.createClient({
                auth: {
                    identity: subscriberIdentity,
                },
                encryption: {
                    requireQuantumResistantSignatures: true,
                    requireQuantumResistantKeyExchange: true,
                    requireQuantumResistantEncryption: true,
                }
            })

            sub = await quantumSubscriber.subscribe({
                streamId: stream.id,
            })
        })

        it('works between quantum identities', async () => {
            const sub = await quantumSubscriber.subscribe({
                streamId: stream.id,
            })
            const testMsg = Msg()
            await quantumPublisher.publish(stream.id, testMsg)
            const received = []
            for await (const msg of sub) {
                received.push(msg.content)
                if (received.length === 1) {
                    break
                }
            }
            expect(received).toEqual([testMsg])
        })

        // Need to use done callback instead of async/await because we use the error listener
        it('fails if requirements are violated', (done) => {
            const testMsg = Msg()

            sub.on('error', (err: Error) => {
                expect(err.message).toContain('signature')
                done()
            })

            nonQuantumClient.publish(stream.id, testMsg)
        })

        it('prevents publishing public data', async () => {
            // Public stream
            await stream.grantPermissions({ permissions: [StreamPermission.SUBSCRIBE], public: true })
            await expect(quantumPublisher.publish(stream.id, Msg())).toReject()
        })

        it('allows subscribing to public data, as long as signatures are compliant', async () => {
            // Public stream
            await stream.grantPermissions({ permissions: [StreamPermission.SUBSCRIBE], public: true })

            // Publisher with relaxed encryption requirement
            quantumPublisher = environment.createClient({
                auth: {
                    identity: publisherIdentity,
                },
                encryption: {
                    requireQuantumResistantSignatures: true,
                    requireQuantumResistantKeyExchange: true,
                    requireQuantumResistantEncryption: false,
                }
            })

            const sub = await quantumSubscriber.subscribe({
                streamId: stream.id,
            })
            const testMsg = Msg()
            await quantumPublisher.publish(stream.id, testMsg)
            const received = []
            for await (const msg of sub) {
                received.push(msg.content)
                if (received.length === 1) {
                    break
                }
            }
            expect(received).toEqual([testMsg])
        })

    })

    describe('pubsub under default settings', () => {
        beforeEach(() => {
            // Clients for pub/sub (can't make transactions)
            quantumPublisher = environment.createClient({
                auth: {
                    identity: publisherIdentity,
                },
            })
            quantumSubscriber = environment.createClient({
                auth: {
                    identity: subscriberIdentity,
                },
            })
        })

        it('works between quantum identities', async () => {
            const sub = await quantumSubscriber.subscribe({
                streamId: stream.id,
            })
            const testMsg = Msg()
            await quantumPublisher.publish(stream.id, testMsg)
            const received = []
            for await (const msg of sub) {
                received.push(msg.content)
                if (received.length === 1) {
                    break
                }
            }
            expect(received).toEqual([testMsg])
        })

        it('works between quantum publisher and non-quantum subscriber', async () => {
            const sub = await nonQuantumClient.subscribe({
                streamId: stream.id,
            })
            const testMsg = Msg()
            await quantumPublisher.publish(stream.id, testMsg)
            const received = []
            for await (const msg of sub) {
                received.push(msg.content)
                if (received.length === 1) {
                    break
                }
            }
            expect(received).toEqual([testMsg])
        })

        it('works between non-quantum publisher and quantum subscriber', async () => {
            const sub = await quantumSubscriber.subscribe({
                streamId: stream.id,
            })
            const testMsg = Msg()
            await nonQuantumClient.publish(stream.id, testMsg)
            const received = []
            for await (const msg of sub) {
                received.push(msg.content)
                if (received.length === 1) {
                    break
                }
            }
            expect(received).toEqual([testMsg])
        })

        // Need to use done callback instead of async/await because we use the error listener
        it('fails between non-quantum publisher and quantum subscriber if subscriber requires quantum signatures', (done) => {
            // Subscriber requiring quantum signatures
            quantumSubscriber = environment.createClient({
                auth: {
                    identity: subscriberIdentity,
                },
                encryption: {
                    requireQuantumResistantSignatures: true,
                }
            })
            quantumSubscriber.subscribe({
                streamId: stream.id,
            }).then((sub) => {
                sub.on('error', (err: Error) => {
                    expect(err.message).toContain('signature')
                    done()
                })
            }).catch(done)

            nonQuantumClient.publish(stream.id, Msg())
        })

    })

})
