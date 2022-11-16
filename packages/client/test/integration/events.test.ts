import 'reflect-metadata'

import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'

describe('events', () => {

    describe('remove listeners when client destroyed', () => {

        const opts = {
            network: {
                entryPoints: [{
                    peerId: 'entrypoint',
                    type: 0
                }],
                stringKademliaId: 'entrypoint'
            }
        }
        it('client', async () => {
            const client = new FakeEnvironment().createClient(opts)
            client.on('addToStorageNode', () => {})
            await client.destroy()
            // @ts-expect-error private
            expect(client.eventEmitter.getListenerCount()).toBe(0)
        })

        it('resend subcription', async () => {
            const client = new FakeEnvironment().createClient(opts)
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
