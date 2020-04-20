jest.mock('node-fetch', () => jest.fn(jest.requireActual('node-fetch')))

import fetch from 'node-fetch'
import { ethers } from 'ethers'

import StreamrClient from '../../src'

import config from './config'

describe('authFetch', () => {
    let client
    afterEach(async () => {
        if (!client) { return }
        await client.ensureDisconnected()
    })

    it('sends Streamr-Client header', async () => {
        client = new StreamrClient({
            auth: {
                privateKey: ethers.Wallet.createRandom().privateKey,
            },
            autoConnect: false,
            autoDisconnect: false,
            ...config.clientOptions,
        })
        await client.connect()
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
