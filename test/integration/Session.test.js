import { ethers } from 'ethers'

import StreamrClient from '../../src'

import config from './config'

describe('Session', () => {
    const createClient = (opts = {}) => new StreamrClient({
        autoConnect: false,
        autoDisconnect: false,
        ...config.clientOptions,
        ...opts,
    })

    describe('Token retrievals', () => {
        it('gets the token using api key', async () => {
            expect.assertions(1)
            await expect(createClient({
                auth: {
                    apiKey: 'tester1-api-key',
                },
            }).session.getSessionToken()).resolves.toBeTruthy()
        })

        it('fails when the used api key is invalid', async () => {
            expect.assertions(1)
            await expect(createClient({
                auth: {
                    apiKey: 'wrong-api-key',
                },
            }).session.getSessionToken()).rejects.toMatchObject({
                body: expect.stringMatching(/invalid api key/i),
            })
        })

        it('gets the token using private key', async () => {
            expect.assertions(1)
            await expect(createClient({
                auth: {
                    privateKey: ethers.Wallet.createRandom().privateKey,
                },
            }).session.getSessionToken()).resolves.toBeTruthy()
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
