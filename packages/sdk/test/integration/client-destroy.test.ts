import 'reflect-metadata'

import { collect } from '@streamr/utils'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { createTestStream } from '../test-utils/utils'

describe('client destroy', () => {
    let client: StreamrClient
    let stream: Stream
    let environment: FakeEnvironment

    beforeEach(async () => {
        environment = new FakeEnvironment()
        client = environment.createClient()
        stream = await createTestStream(client, module)
    })

    afterEach(async () => {
        await environment.destroy()
    })

    it('unsubscribes', async () => {
        const sub = await client.subscribe(stream.id)
        jest.spyOn(sub, 'unsubscribe')
        await client.destroy()
        expect(sub.unsubscribe).toHaveBeenCalled()
    })

    it('ongoing subscribe pipeline ends', async () => {
        const sub = await client.subscribe(stream.id)
        const onError: any = jest.fn()
        sub.on('error', onError)
        const outputPromise = collect(sub)
        await client.destroy()
        expect(onError).toHaveBeenCalledTimes(0)
        expect(await outputPromise).toEqual([])
    })

    it('unable to subscribe after destroy called', async () => {
        await client.destroy()
        await expect(async () => {
            await client.subscribe(stream.id)
        }).rejects.toThrowStreamrClientError({ code: 'CLIENT_DESTROYED' })
    })

    it('unable to publish after destroy called', async () => {
        await client.destroy()
        await expect(async () => {
            await client.publish(stream.id, {})
        }).rejects.toThrow(/Failed to publish.*Client is destroyed/)
    })
})
