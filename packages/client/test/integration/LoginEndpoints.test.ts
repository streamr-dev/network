import assert from 'assert'

import { ethers } from 'ethers'

import { StreamrClient } from '../../src/StreamrClient'

import { clientOptions } from './devEnvironment'
import { fakePrivateKey } from '../utils'

describe('LoginEndpoints', () => {
    let client: StreamrClient

    const createClient = (opts = {}) => new StreamrClient({
        ...clientOptions,
        auth: {
            privateKey: fakePrivateKey()
        },
        autoConnect: false,
        autoDisconnect: false,
        ...opts,
    })

    beforeAll(() => {
        client = createClient()
    })

    afterAll(async () => {
        await client.disconnect()
    })

    describe('Challenge generation', () => {
        it('should retrieve a challenge', async () => {
            const challenge = await client.getChallenge('some-address')
            assert(challenge)
            // @ts-expect-error
            assert(challenge.id)
            assert(challenge.challenge)
            // @ts-expect-error
            assert(challenge.expires)
        })
    })

    describe('Challenge response', () => {
        it('should fail to get a session token', async () => {
            await expect(async () => {
                await client.sendChallengeResponse({
                    // @ts-expect-error
                    id: 'some-id',
                    challenge: 'some-challenge',
                }, 'some-sig', 'some-address')
            }).rejects.toThrow()
        })

        it('should get a session token', async () => {
            const wallet = ethers.Wallet.createRandom()
            const challenge = await client.getChallenge(wallet.address)
            assert(challenge.challenge)
            const signature = await wallet.signMessage(challenge.challenge)
            const sessionToken = await client.sendChallengeResponse(challenge, signature, wallet.address)
            assert(sessionToken)
            assert(sessionToken.token)
            // @ts-expect-error
            assert(sessionToken.expires)
        })

        it('should get a session token with combined function', async () => {
            const wallet = ethers.Wallet.createRandom()
            const sessionToken = await client.loginWithChallengeResponse((d) => wallet.signMessage(d), wallet.address)
            assert(sessionToken)
            assert(sessionToken.token)
            // @ts-expect-error
            assert(sessionToken.expires)
        })
    })

    describe('API key login', () => {
        it('should fail', async () => {
            await expect(async () => {
                await client.loginWithApiKey('apikey')
            }).rejects.toThrow()
        })
    })

    describe('Username/password login', () => {
        it('should fail', async () => {
            await expect(async () => {
                await client.loginWithUsernamePassword('username', 'password')
            }).rejects.toThrow('no longer supported')
        })
    })

    describe('UserInfo', () => {
        it('should get user info', async () => {
            const userInfo = await client.getUserInfo()
            assert(userInfo.name)
            assert(userInfo.username)
        })
    })

    describe('logout', () => {
        it('should not be able to use the same session token after logout', async () => {
            await client.getUserInfo() // first fetches the session token, then requests the endpoint
            const sessionToken1 = client.session.options.sessionToken
            await client.logoutEndpoint() // invalidates the session token in core-api
            await client.getUserInfo() // requests the endpoint with sessionToken1, receives 401, fetches a new session token
            const sessionToken2 = client.session.options.sessionToken
            assert.notDeepStrictEqual(sessionToken1, sessionToken2)
        })

        it('should be able to log in after logging out', async () => {
            await client.getUserInfo()
            await client.logout()
            await client.getUserInfo()
        })
    })
})
