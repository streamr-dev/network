const { isTimestampTooFarInTheFuture } = require('../../../src/helpers/utils')

describe('utils', () => {
    test('test isTimestampTooFarInTheFuture', () => {
        const now = Date.now()

        expect(isTimestampTooFarInTheFuture(now, 1, now)).toBeFalsy()
        expect(isTimestampTooFarInTheFuture(now, 0, now)).toBeFalsy()

        expect(isTimestampTooFarInTheFuture(now, -1, now)).toBeTruthy()
        expect(isTimestampTooFarInTheFuture(now + 3 * 1000, 2, now)).toBeTruthy()
    })
})
