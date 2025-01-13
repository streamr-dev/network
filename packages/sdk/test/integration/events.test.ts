import 'reflect-metadata'

import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'

describe('events', () => {
    describe('remove listeners when client destroyed', () => {
        let environment: FakeEnvironment

        beforeEach(() => {
            environment = new FakeEnvironment()
        })

        afterEach(async () => {
            await environment.destroy()
        })

        it('client', async () => {
            const client = environment.createClient()
            client.on('streamAddedToStorageNode', () => {})
            await client.destroy()
            // @ts-expect-error private
            expect(client.eventEmitter.getListenerCount()).toBe(0)
        })

        it('resend subcription', async () => {
            const client = environment.createClient()
            const stream = await client.createStream('/foobar')
            const subscription = await client.subscribe(
                {
                    streamId: stream.id,
                    resend: {
                        last: 1
                    }
                },
                () => {}
            )
            const onResendComplete = jest.fn()
            subscription.once('resendCompleted', onResendComplete)
            await client.destroy()
            expect(onResendComplete).not.toHaveBeenCalled()
            // @ts-expect-error private
            expect(subscription.eventEmitter.listenerCount()).toBe(0)
        })
    })
})
