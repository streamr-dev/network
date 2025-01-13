import { AggregatedError } from '../../src/utils/AggregatedError'

const TEST_REPEATS = process.env.TEST_REPEATS ? parseInt(process.env.TEST_REPEATS, 10) : 1

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function describeRepeats(msg: string, fn: any, describeFn = describe): void {
    for (let k = 0; k < TEST_REPEATS; k++) {
        describe(msg, () => {
            describeFn(`test repeat ${k + 1} of ${TEST_REPEATS}`, fn)
        })
    }
}

describeRepeats.skip = (msg: any, fn: any) => {
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    describe.skip(`${msg} – test repeat ALL of ${TEST_REPEATS}`, fn)
}

describeRepeats.only = (msg: any, fn: any) => {
    describeRepeats(msg, fn, describe.only)
}

export function addAfterFn(): (fn: any) => void {
    let afterFns: any[] = []
    afterEach(async () => {
        const fns = afterFns.slice()
        afterFns = []
        // @ts-expect-error invalid parameter
        AggregatedError.throwAllSettled(await Promise.allSettled(fns.map((fn) => fn())))
    })

    return (fn: any) => {
        afterFns.push(fn)
    }
}
