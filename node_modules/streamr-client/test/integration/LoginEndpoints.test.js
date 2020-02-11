import assert from 'assert'

import { ethers } from 'ethers'

import StreamrClient from '../../src'

import config from './config'

describe('LoginEndpoints', () => {
    let client

    const createClient = (opts = {}) => new StreamrClient({
        url: config.websocketUrl,
        restUrl: config.restUrl,
        apiKey: 'tester1-api-key',
        autoConnect: false,
        autoDisconnect: false,
        ...opts,
    })

    beforeAll(() => {
        client = createClient()
    })

    afterAll(async (done) => {
        await client.ensureDisconnected()
        done()
    })

    describe('Challenge generation', () => {
        it('should retrieve a challenge', () => client.getChallenge('some-address')
            .then((challenge) => {
                assert(challenge)
                assert(challenge.id)
                assert(challenge.challenge)
                assert(challenge.expires)
            }))
    })

    async function assertThrowsAsync(fn, regExp) {
        let f = () => {}
        try {
            await fn()
        } catch (e) {
            f = () => {
                throw e
            }
        } finally {
            assert.throws(f, regExp)
        }
    }

    describe('Challenge response', () => {
        it('should fail to get a session token', async () => {
            await assertThrowsAsync(async () => client.sendChallengeResponse(
                {
                    id: 'some-id',
                    challenge: 'some-challenge',
                },
                'some-sig',
                'some-address',
            ), /Error/)
        })
        it('should get a session token', () => {
            const wallet = ethers.Wallet.createRandom()
            return client.getChallenge(wallet.address)
                .then(async (challenge) => {
                    assert(challenge.challenge)
                    const signature = await wallet.signMessage(challenge.challenge)
                    return client.sendChallengeResponse(challenge, signature, wallet.address)
                        .then((sessionToken) => {
                            assert(sessionToken)
                            assert(sessionToken.token)
                            assert(sessionToken.expires)
                        })
                })
        })
        it('should get a session token with combined function', () => {
            const wallet = ethers.Wallet.createRandom()
            return client.loginWithChallengeResponse((d) => wallet.signMessage(d), wallet.address)
                .then((sessionToken) => {
                    assert(sessionToken)
                    assert(sessionToken.token)
                    assert(sessionToken.expires)
                })
        })
    })

    describe('API key login', () => {
        it('should fail to get a session token', async () => {
            await assertThrowsAsync(async () => client.loginWithApiKey('apikey'), /Error/)
        })
        it('should get a session token', () => client.loginWithApiKey('tester1-api-key')
            .then((sessionToken) => {
                assert(sessionToken)
                assert(sessionToken.token)
                assert(sessionToken.expires)
            }))
    })

    describe('Username/password login', () => {
        it('should fail to get a session token', async () => {
            await assertThrowsAsync(async () => client.loginWithUsernamePassword('username', 'password'), /Error/)
        })
        it('should get a session token', () => client.loginWithUsernamePassword('tester2@streamr.com', 'tester2')
            .then((sessionToken) => {
                assert(sessionToken)
                assert(sessionToken.token)
                assert(sessionToken.expires)
            }))
    })

    describe('UserInfo', () => {
        it('should get user info', () => client.getUserInfo().then((userInfo) => {
            assert(userInfo.name)
            assert(userInfo.username)
        }))
    })

    describe('logout', () => {
        it('should not be able to use the same session token after logout', async () => {
            await client.getUserInfo() // first fetches the session token, then requests the endpoint
            const sessionToken1 = client.session.options.sessionToken
            await client.logoutEndpoint() // invalidates the session token in engine-and-editor
            await client.getUserInfo() // requests the endpoint with sessionToken1, receives 401, fetches a new session token
            const sessionToken2 = client.session.options.sessionToken
            assert.notDeepStrictEqual(sessionToken1, sessionToken2)
        })
    })
})
