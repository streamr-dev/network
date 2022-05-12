import { getWindowNumber, WINDOW_LENGTH } from '../../src/logic/receipts/Bucket'

const TIMESTAMP = 1652252050000

describe(getWindowNumber, () => {
    const BASE_WINDOW_NUMBER = getWindowNumber(TIMESTAMP)
    const LOWER_BOUND = BASE_WINDOW_NUMBER * WINDOW_LENGTH
    const UPPER_BOUND = (BASE_WINDOW_NUMBER + 1) * WINDOW_LENGTH - 1

    it('works as expected', () => {
        expect(TIMESTAMP).toBeWithin(LOWER_BOUND, UPPER_BOUND)
        expect(getWindowNumber(LOWER_BOUND)).toEqual(BASE_WINDOW_NUMBER)
        expect(getWindowNumber(LOWER_BOUND + Math.floor(WINDOW_LENGTH * (1/2)))).toEqual(BASE_WINDOW_NUMBER)
        expect(getWindowNumber(UPPER_BOUND)).toEqual(BASE_WINDOW_NUMBER)

        // previous and next buckets
        expect(getWindowNumber(LOWER_BOUND - 1)).toEqual(BASE_WINDOW_NUMBER - 1)
        expect(getWindowNumber(UPPER_BOUND + 1)).toEqual(BASE_WINDOW_NUMBER + 1)
    })
})
