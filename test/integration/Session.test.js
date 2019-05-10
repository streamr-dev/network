import { ethers } from 'ethers'
import StreamrClient from '../../src'
import config from './config'

describe('Session', () => {
    const createClient = (opts = {}) => new StreamrClient({
        url: config.websocketUrl,
        restUrl: config.restUrl,
        autoConnect: false,
        autoDisconnect: false,
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

        it('fails when the used api key is ivalid', async () => {
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

        it('gets the token using username and password', async () => {
            expect.assertions(1)
            await expect(createClient({
                auth: {
                    username: 'tester2@streamr.com',
                    password: 'tester2',
                },
            }).session.getSessionToken()).resolves.toBeTruthy()
        })

        it('fails when the used username and password is invalid', async () => {
            expect.assertions(1)
            await expect(createClient({
                auth: {
                    username: 'tester2@streamr.com',
                    password: 'WRONG',
                },
            }).session.getSessionToken()).rejects.toMatchObject({
                body: expect.stringMatching(/invalid username or password/i),
            })
        })

        it('gets no token (undefined) when the auth object is empty', async () => {
            expect.assertions(1)
            await expect(createClient({
                auth: {},
            }).session.getSessionToken()).resolves.toBeUndefined()
        })
    })
})
