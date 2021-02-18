import pLimit from 'p-limit'

import { MaybeAsync } from '../types'
import AggregatedError from './AggregatedError'

/**
 * Takes a sequence of async steps & a check function.
 * While check function is true, will execute steps in order until all done.
 * Each step optionally returns a cleanup function.
 * If/when check fails (or there's an error) cleanup functions will be executed in order.
 * onChange fires when up/down direction changes.
 * onDone fires when no more up/down steps to execute.
 * onError fires when something errors. Rethrow in onError to keep error, don't rethrow to suppress.
 * returns a function which should be called whenever something changes that could affect the check.
 */
type Step = StepUp | MaybeAsync<() => void> // possibly no StepDown
type StepUp = MaybeAsync<() => StepDown>
type StepDown = MaybeAsync<() => void>

type ScaffoldOptions = {
 onError?: (error: Error) => void
 onDone?: MaybeAsync<(shouldUp: boolean, error?: Error) => void>
 onChange?: MaybeAsync<(shouldUp: boolean) => void>
}

const noop = () => {}

export default function Scaffold(
    sequence: Step[] = [],
    _checkFn: () => Promise<boolean>,
    { onError, onDone, onChange }: ScaffoldOptions = {}
) {
    let error: Error | undefined
    // ignore error if check fails

    const nextSteps: StepUp[] = sequence.slice().reverse().map((fn) => (
        async () => {
            const downFn = await fn()
            return (
                typeof downFn === 'function'
                    ? downFn
                    : noop
            )
        }
    ))

    const prevSteps: StepUp[] = []
    const onDownSteps: StepDown[] = []
    const queue = pLimit(1)

    let isDone = false
    let didStart = false

    function collectErrors(err: Error) {
        try {
            if (typeof onError === 'function') {
                onError(err) // give option to suppress error
            } else {
                throw err // rethrow
            }
        } catch (newErr) {
            error = AggregatedError.from(error, newErr)
        }
    }

    const checkShouldUp = async () => {
        if (error) { return false }
        try {
            return await _checkFn()
        } catch (err) {
            collectErrors(err)
        }
        return false
    }

    let shouldUp = false
    let prevShouldUp = false
    const innerQueue = pLimit(1)

    async function next(): Promise<void> {
        shouldUp = await checkShouldUp()
        const didChange = prevShouldUp !== shouldUp
        prevShouldUp = shouldUp
        if (didChange && typeof onChange === 'function') {
            try {
                await onChange(shouldUp)
            } catch (err) {
                collectErrors(err)
            }
            return next()
        }

        if (shouldUp) {
            if (nextSteps.length) {
                isDone = false
                didStart = true
                let onDownStep
                const stepFn = nextSteps.pop() as StepUp
                prevSteps.push(stepFn)
                try {
                    onDownStep = await stepFn()
                } catch (err) {
                    collectErrors(err)
                }
                onDownSteps.push(onDownStep || (() => {}))
                return next()
            }
        } else if (onDownSteps.length) {
            isDone = false
            didStart = true
            const stepFn = onDownSteps.pop() as StepDown // exists because checked onDownSteps.length
            try {
                await stepFn()
            } catch (err) {
                collectErrors(err)
            }
            nextSteps.push(prevSteps.pop() as StepUp)
            return next()
        } else if (error) {
            const err = error
            // eslint-disable-next-line require-atomic-updates
            error = undefined
            isDone = true
            throw err
        }

        isDone = true

        return Promise.resolve()
    }

    function isActive() {
        return !(
            didStart
            && isDone
            && !queue.activeCount
            && !queue.pendingCount
        )
    }

    const nextDone = async () => {
        await innerQueue(() => next())
    }

    let currentStep: Promise<void>
    const queuedNext = async () => {
        let stepErr
        try {
            currentStep = queue(() => nextDone())
            await currentStep
        } catch (err) {
            stepErr = err
            throw err
        } finally {
            if (!isActive()) {
                didStart = false
                if (typeof onDone === 'function') {
                    const err = stepErr
                    stepErr = undefined
                    await onDone(shouldUp, err)
                }
            }
        }
    }

    return Object.assign(queuedNext, {
        next: nextDone,
        isActive,
        getCurrentStep() {
            return currentStep
        },
        get activeCount() {
            return queue.activeCount
        },
        get pendingCount() {
            return queue.pendingCount
        },
        setError(err: Error) {
            error = AggregatedError.from(error, err)
        },
        getError() {
            return error
        },
        clearError() {
            const err = error
            error = undefined
            return err
        }
    })
}
