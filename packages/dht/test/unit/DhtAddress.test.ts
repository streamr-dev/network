import { getDhtAddressFromRaw } from "../../src/identifiers"

describe('', () => {
    it('a', () => {
        const id = getDhtAddressFromRaw(new Uint8Array([
            250,  76,  35,  40, 110,  93,
            112,  95,  72, 166,  48,  26,
            159, 136, 229, 108,  98, 182,
            159,  27
        ]))
        console.log(id)
    })
})