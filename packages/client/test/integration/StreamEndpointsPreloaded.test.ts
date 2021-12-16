import 'reflect-metadata'
import '../../src/utils/PatchTsyringe'

import type { StreamrClient } from '../../src/StreamrClient'
import type { Stream } from '../../src/Stream'
import { getCreateClient, createTestStream } from '../utils'
import { preloadStreams, preloadPublishers } from '../../src/StreamEndpointsCached'

jest.setTimeout(30000)

describe('preloaded stream data', () => {
    const createClient = getCreateClient()
    let client: StreamrClient
    let stream: Stream

    beforeEach(async () => {
        client = await createClient()
        stream = await createTestStream(client, module)
    })

    describe('does not fetch remote data if stream is preloaded', () => {
        it('works with getStream', async () => {
            const getStreamMock = jest.spyOn(client.streamEndpoints, 'getStream')
            await client.cached.getStream(stream.id)
            expect(getStreamMock).toHaveBeenCalledTimes(1)

            const preloadedStreamId = [...preloadStreams][0]
            const result = await client.cached.getStream(preloadedStreamId)
            expect(result.id).toEqual(preloadedStreamId)
            expect(getStreamMock).toHaveBeenCalledTimes(1)
        })

        it('works with getStreamValidationInfo', async () => {
            const getStreamMock = jest.spyOn(client.streamEndpoints, 'getStream')
            await client.cached.getStream(stream.id)
            expect(getStreamMock).toHaveBeenCalledTimes(1)

            const preloadedStreamId = [...preloadStreams][0]
            const result = await client.cached.getStream(preloadedStreamId)
            expect(result.id).toEqual(preloadedStreamId)
            expect(getStreamMock).toHaveBeenCalledTimes(1)
        })

        it('works with isStreamPublisher', async () => {
            const getStreamMock = jest.spyOn(client.streamEndpoints, 'isStreamPublisher')

            const clientAddress = await client.getAddress()
            expect(await client.cached.isStreamPublisher(stream.id, clientAddress)).toEqual(true)
            expect(getStreamMock).toHaveBeenCalledTimes(1)
            const preloadedStreamId = [...preloadStreams][0]
            const preloadedPublisherId = [...preloadPublishers][0]

            expect(await client.cached.isStreamPublisher(preloadedStreamId, preloadedPublisherId)).toEqual(true)
            expect(await client.cached.isStreamPublisher(preloadedStreamId, clientAddress)).toEqual(false)
            expect(getStreamMock).toHaveBeenCalledTimes(1)
        })

        it('works with isStreamSubscriber', async () => {
            const getStreamMock = jest.spyOn(client.streamEndpoints, 'isStreamSubscriber')

            const clientAddress = await client.getAddress()
            await client.cached.isStreamSubscriber(stream.id, clientAddress)
            expect(getStreamMock).toHaveBeenCalledTimes(1)
            const preloadedStreamId = [...preloadStreams][0]
            const preloadedPublisherId = [...preloadPublishers][0]

            expect(await client.cached.isStreamSubscriber(preloadedStreamId, preloadedPublisherId)).toEqual(true)
            expect(await client.cached.isStreamSubscriber(preloadedStreamId, clientAddress)).toEqual(true)
            expect(getStreamMock).toHaveBeenCalledTimes(1)
        })
    })
})
