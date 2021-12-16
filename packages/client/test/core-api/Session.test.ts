import { getCreateClient } from '../utils'

describe('Session', () => {
    const createClient = getCreateClient()

    describe('Token retrievals', () => {
        it('gets the token using private key', async () => {
            const token = await (await createClient()).session.getSessionToken()
            expect(token).toBeTruthy()
        })

        it('can handle multiple client instances', async () => {
            const client1 = await createClient()
            const client2 = await createClient()
            const token1 = await client1.session.getSessionToken()
            const token2 = await client2.session.getSessionToken()
            expect(token1).not.toEqual(token2)
        })

        it('gets no token (undefined) when the auth object is empty', async () => {
            expect(await (await createClient({
                auth: {},
            })).session.getSessionToken()).toBe('')
        })
    })
})
