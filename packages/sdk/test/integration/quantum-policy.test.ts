import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { StreamPermission } from '../../src/permission'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { Msg } from '../test-utils/publish'
import { createTestStream } from '../test-utils/utils'
import { EthereumKeyPairIdentity, Identity, MLDSAKeyPairIdentity } from '../../src'
import { collect } from '@streamr/utils'

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

        // This client uses an EthereumKeyPairIdentity so that it can create streams and set permissions
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

        beforeEach(async () => {
            // Note that these clients can't create streams or set permissions due to non-Ethereum identity
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
        })

        it('works between quantum identities', async () => {
            const sub = await quantumSubscriber.subscribe({
                streamId: stream.id,
            })
            const testMsg = Msg()
            await quantumPublisher.publish(stream.id, testMsg)
            const received = await collect(sub, 1)
            expect(received.map((m) => m.content)).toEqual([testMsg])
        })

        it('fails if requireQuantumResistantSignatures is violated', async () => {
            quantumSubscriber = environment.createClient({
                auth: {
                    identity: subscriberIdentity,
                },
                encryption: {
                    requireQuantumResistantSignatures: true,
                }
            })

            const sub = await quantumSubscriber.subscribe({
                streamId: stream.id,
            }, (_msg) => {
                throw new Error('Message should not have been received, but it was!')
            })

            const errorPromise = new Promise<Error>((resolve) => {
                sub.on('error', resolve)
            })

            nonQuantumClient.publish(stream.id, Msg())
            const err = await errorPromise
            expect(err).toEqualStreamrClientError({ code: 'SIGNATURE_POLICY_VIOLATION' })
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
            const received = await collect(sub, 1)
            expect(received.map((m) => m.content)).toEqual([testMsg])
        })

    })

    describe('pubsub under default settings', () => {
        beforeEach(() => {
            // Note that these clients can't create streams or set permissions due to non-Ethereum identity
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
            const received = await collect(sub, 1)
            expect(received.map((m) => m.content)).toEqual([testMsg])
        })

        it('works between quantum publisher and non-quantum subscriber', async () => {
            const sub = await nonQuantumClient.subscribe({
                streamId: stream.id,
            })
            const testMsg = Msg()
            await quantumPublisher.publish(stream.id, testMsg)
            const received = await collect(sub, 1)
            expect(received.map((m) => m.content)).toEqual([testMsg])
        })

        it('works between non-quantum publisher and quantum subscriber', async () => {
            const sub = await quantumSubscriber.subscribe({
                streamId: stream.id,
            })
            const testMsg = Msg()
            await nonQuantumClient.publish(stream.id, testMsg)
            const received = await collect(sub, 1)
            expect(received.map((m) => m.content)).toEqual([testMsg])
        })

    })

})
