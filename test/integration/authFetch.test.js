jest.mock('node-fetch')

import fetch from 'node-fetch'

import { StreamrClient } from '../../src/StreamrClient'
import { fakePrivateKey } from '../utils'

import config from './config'

describe('authFetch', () => {
    let client
    afterEach(async () => {
        if (!client) { return }
        await client.ensureDisconnected()
    })

    afterAll(() => {
        jest.restoreAllMocks()
    })

    it('sends Streamr-Client header', async () => {
        const realFetch = jest.requireActual('node-fetch')
        fetch.Response = realFetch.Response
        fetch.Promise = realFetch.Promise
        fetch.Request = realFetch.Request
        fetch.Headers = realFetch.Headers
        fetch.mockImplementation(realFetch)
        client = new StreamrClient({
            auth: {
                privateKey: fakePrivateKey()
            },
            autoConnect: false,
            autoDisconnect: false,
            ...config.clientOptions,
        })
        await client.connect()
        expect(fetch).not.toHaveBeenCalled() // will get called in background though (questionable behaviour)
        await client.session.getSessionToken() // this ensures authentication completed
        expect(fetch).toHaveBeenCalled()
        fetch.mock.calls.forEach(([url, opts]) => {
            expect(typeof url).toEqual('string')
            expect(opts).toMatchObject({
                headers: {
                    'Streamr-Client': expect.stringMatching('streamr-client-javascript'),
                },
            })
        })
    })
})
