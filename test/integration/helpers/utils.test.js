const { isTimestampTooFarInTheFuture } = require('../../../src/helpers/utils')

describe('utils', () => {
    test('test isTimestampTooFarInTheFuture', async () => {
        const currentTimestamp = Date.now()

        expect(isTimestampTooFarInTheFuture(currentTimestamp, 1)).toBeFalsy()
        expect(isTimestampTooFarInTheFuture(currentTimestamp, 0)).toBeFalsy()

        expect(isTimestampTooFarInTheFuture(currentTimestamp, -1)).toBeTruthy()
        expect(isTimestampTooFarInTheFuture(currentTimestamp + 3 * 1000, 2)).toBeTruthy()
    })
})
