import assert from 'assert'

import { ethers } from 'ethers'

import { StreamrClient } from '../../src/StreamrClient'

import { getCreateClient } from '../utils'

describe('LoginEndpoints', () => {
    let client: StreamrClient

    const createClient = getCreateClient()

    beforeAll(async () => {
        client = await createClient()
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

        it.skip('should get a session token with combined function', async () => {
            // const wallet = ethers.Wallet.createRandom()
            /// /const sessionToken = await client.loginWithChallengeResponse((d) => wallet.signMessage(d), wallet.address)
            // assert(sessionToken)
            // assert(sessionToken.token)
            /// / @ts-expect-error
            // assert(sessionToken.expires)
        })
    })
})
