export * from '../src/utils/testTools'

const TEST_REPEATS = parseInt(process.env.TEST_REPEATS, 10) || 1

export function describeRepeats(msg, fn, describeFn = describe) {
    for (let k = 0; k < TEST_REPEATS; k++) {
        // eslint-disable-next-line no-loop-func
        describe(msg, () => {
            describeFn(`test repeat ${k + 1} of ${TEST_REPEATS}`, fn)
        })
    }
}

describeRepeats.skip = (msg, fn) => {
    describe.skip(`test repeat ALL of ${TEST_REPEATS}`, fn)
}

describeRepeats.only = (msg, fn) => {
    describeRepeats(msg, fn, describe.only)
}
