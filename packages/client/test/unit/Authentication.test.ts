import { createAuthentication } from '../../src/Authentication'

const PRIVATE_KEY = '0x348ce564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709'
const AUTHENTICATION = createAuthentication({
    privateKey: PRIVATE_KEY
}, undefined as any)

describe('Authentication', () => {
    
    describe('createMessagePayloadSignature', () => {

        it('happy path', async () => {
            const payload = 'data-to-sign'
            const signature = await AUTHENTICATION.createMessagePayloadSignature(payload)
            expect(signature).toEqual('0x084b3ac0f2ad17d387ca5bbf5d72d8f1dfd1b372e399ce6b0bfc60793e'
                + 'b717d2431e498294f202d8dfd9f56158391d453c018470aea92ed6a80a23c20ab6f7ac1b')
        })
    })
})
