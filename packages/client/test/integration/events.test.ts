import 'reflect-metadata'
import { createClientFactory } from '../test-utils/fake/fakeEnvironment'

describe('events', () => {

    describe('remove listeners when client destroyed', () => {

        it('client', async () => {
            const client = createClientFactory().createClient()
            client.on('addToStorageNode', () => {})
            await client.destroy()
            // @ts-expect-error private
            expect(client.eventEmitter.getListenerCount()).toBe(0)
        })

        it('resend subcription', async () => {
            const client = createClientFactory().createClient()
            const stream = await client.createStream('/foobar')
            const subscription = await client.subscribe({
                streamId: stream.id,
                resend: {
                    last: 1
                }
            }, () => {})
            const onResendComplete = jest.fn()
            subscription.once('resendComplete', onResendComplete)
            await client.destroy()
            expect(onResendComplete).not.toBeCalled()
            // @ts-expect-error private
            expect(subscription.eventEmitter.listenerCount()).toBe(0)
        })

    })

})
