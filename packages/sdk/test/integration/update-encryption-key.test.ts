import 'reflect-metadata'

import { StreamPartID, StreamPartIDUtils, until } from '@streamr/utils'
import { Message } from '../../src/Message'
import { GroupKey } from '../../src/encryption/GroupKey'
import { StreamPermission } from '../../src/permission'
import { nextValue } from '../../src/utils/iterators'
import { StreamrClient } from './../../src/StreamrClient'
import { FakeEnvironment } from './../test-utils/fake/FakeEnvironment'

/*
 * Subscriber has subscribed to a stream, and the publisher updates the encryption key for that stream.
 * The subscriber can get the updated key and decrypt received messages with it.
 */
describe('update encryption key', () => {
    let publisher: StreamrClient
    let subscriber: StreamrClient
    let streamPartId: StreamPartID
    let messageIterator: AsyncIterator<Message>
    let onError: jest.Mock<(err: Error) => void>
    let environment = new FakeEnvironment()

    beforeEach(async () => {
        environment = new FakeEnvironment()
        publisher = environment.createClient()
        subscriber = environment.createClient({
            encryption: {
                keyRequestTimeout: 200
            }
        })
        const stream = await publisher.createStream('/path')
        await stream.grantPermissions({
            userId: await subscriber.getUserId(),
            permissions: [StreamPermission.SUBSCRIBE]
        })
        streamPartId = (await stream.getStreamParts())[0]
        const sub = await subscriber.subscribe(streamPartId)
        messageIterator = sub[Symbol.asyncIterator]()
        onError = jest.fn()
        sub.on('error', onError)
    })

    afterEach(async () => {
        await environment.destroy()
    })

    it('rotate', async () => {
        await publisher.publish(streamPartId, {
            mockId: 1
        })
        const msg1 = await nextValue(messageIterator)
        expect(msg1!.content).toEqual({
            mockId: 1
        })

        const rotatedKey = GroupKey.generate()
        await publisher.updateEncryptionKey({
            key: rotatedKey,
            distributionMethod: 'rotate',
            streamId: StreamPartIDUtils.getStreamID(streamPartId)
        })

        await publisher.publish(streamPartId, {
            mockId: 2
        })
        const msg2 = await nextValue(messageIterator)
        expect(msg2!.content).toEqual({
            mockId: 2
        })
        expect(msg2!.streamMessage.newGroupKey!.id).toBe(rotatedKey.id)

        await publisher.publish(streamPartId, {
            mockId: 3
        })
        const msg3 = await nextValue(messageIterator)
        expect(msg3!.content).toEqual({
            mockId: 3
        })
        expect(msg3?.streamMessage.groupKeyId).toBe(rotatedKey.id)
    })

    it('rekey', async () => {
        await publisher.publish(streamPartId, {
            mockId: 1
        })
        const msg1 = await nextValue(messageIterator)
        expect(msg1!.content).toEqual({
            mockId: 1
        })

        const rekeyedKey = GroupKey.generate()
        await publisher.updateEncryptionKey({
            key: rekeyedKey,
            distributionMethod: 'rekey',
            streamId: StreamPartIDUtils.getStreamID(streamPartId)
        })

        await publisher.publish(streamPartId, {
            mockId: 2
        })
        const msg2 = await nextValue(messageIterator)
        expect(msg2!.content).toEqual({
            mockId: 2
        })
        expect(msg2?.streamMessage.groupKeyId).toBe(rekeyedKey.id)
    })

    describe('permission revoked', () => {
        it('rotate', async () => {
            await publisher.publish(streamPartId, {
                mockId: 1
            })
            const msg1 = await nextValue(messageIterator)
            expect(msg1!.content).toEqual({
                mockId: 1
            })

            await publisher.revokePermissions(StreamPartIDUtils.getStreamID(streamPartId), {
                userId: await subscriber.getUserId(),
                permissions: [StreamPermission.SUBSCRIBE]
            })
            const rotatedKey = GroupKey.generate()
            await publisher.updateEncryptionKey({
                key: rotatedKey,
                distributionMethod: 'rotate',
                streamId: StreamPartIDUtils.getStreamID(streamPartId)
            })

            await publisher.publish(streamPartId, {
                mockId: 2
            })
            const msg2 = await nextValue(messageIterator)
            expect(msg2!.content).toEqual({
                mockId: 2
            })
        })

        it(
            'rekey',
            async () => {
                await publisher.publish(streamPartId, {
                    mockId: 1
                })
                const msg1 = await nextValue(messageIterator)
                expect(msg1!.content).toEqual({
                    mockId: 1
                })

                await publisher.revokePermissions(StreamPartIDUtils.getStreamID(streamPartId), {
                    userId: await subscriber.getUserId(),
                    permissions: [StreamPermission.SUBSCRIBE]
                })
                await publisher.updateEncryptionKey({
                    key: GroupKey.generate(),
                    distributionMethod: 'rekey',
                    streamId: StreamPartIDUtils.getStreamID(streamPartId)
                })

                await publisher.publish(streamPartId, {
                    mockId: 2
                })
                await until(() => onError.mock.calls.length > 0, 10 * 1000)
                expect(onError.mock.calls[0][0]).toEqualStreamrClientError({
                    code: 'DECRYPT_ERROR'
                })
            },
            10 * 1000
        )
    })
})
