import { StreamrClient } from '../../src/StreamrClient'
import { fakePrivateKey } from '../utils'

import clientOptions from './config'

describe('Session', () => {
    const createClient = (opts = {}) => new StreamrClient({
        ...clientOptions,
        ...opts,
        autoConnect: false,
        autoDisconnect: false,
    })

    describe('Token retrievals', () => {
        it('fails if trying to use apiKey', async () => {
            expect.assertions(1)
            await expect(() => createClient({
                auth: {
                    apiKey: 'tester1-api-key',
                },
            }).session.getSessionToken()).rejects.toThrow('no longer supported')
        })

        it('gets the token using private key', async () => {
            expect.assertions(1)
            await expect(createClient({
                auth: {
                    privateKey: fakePrivateKey(),
                },
            }).session.getSessionToken()).resolves.toBeTruthy()
        })

        it('can handle multiple client instances', async () => {
            expect.assertions(1)
            const client1 = createClient({
                auth: {
                    privateKey: fakePrivateKey(),
                },
            })
            const client2 = createClient({
                auth: {
                    privateKey: fakePrivateKey(),
                },
            })
            const token1 = await client1.session.getSessionToken()
            const token2 = await client2.session.getSessionToken()
            expect(token1).not.toEqual(token2)
        })

        it('fails if trying to get the token using username and password', async () => {
            expect.assertions(1)
            await expect(() => createClient({
                auth: {
                    username: 'tester2@streamr.com',
                    password: 'tester2',
                },
            }).session.getSessionToken()).rejects.toThrow('no longer supported')
        })

        it('gets no token (undefined) when the auth object is empty', async () => {
            expect.assertions(1)
            await expect(createClient({
                auth: {},
            }).session.getSessionToken()).resolves.toBeUndefined()
        })
    })
})
