import pLimit from 'p-limit'

import AggregatedError from './AggregatedError'

/**
 * Takes a sequence of async steps & a check function.
 * While check function is true, will execute steps in order until all done.
 * Each step optionally returns a cleanup function.
 * If/when check fails (or there's an error) cleanup functions will be executed in order.
 * onChange fires when up/down direction changes.
 * onDone fires when no more up/down steps to execute.
 * returns a function which should be called whenever something changes that could affect the check.
 */

export default function Scaffold(sequence = [], _checkFn, { onDone, onChange } = {}) {
    let error

    const nextSteps = sequence.slice().reverse()
    const prevSteps = []
    const onDownSteps = []
    const queue = pLimit(1)

    let isDone = false
    let didStart = false

    function onError(err) {
        // eslint-disable-next-line require-atomic-updates
        error = AggregatedError.from(error, err)
    }

    const checkFn = async (...args) => {
        try {
            return await _checkFn(...args)
        } catch (err) {
            onError(err, 'in check')
        }
        return false
    }

    let shouldUp = false
    let prevShouldUp = false
    const innerQueue = pLimit(1)

    const checkShouldUp = async () => !!(!error && await checkFn())

    async function next(...args) {
        shouldUp = await checkShouldUp()
        const didChange = prevShouldUp !== shouldUp
        prevShouldUp = shouldUp
        if (didChange && typeof onChange === 'function') {
            try {
                await onChange(shouldUp)
            } catch (err) {
                onError(err)
            }
            return next(...args)
        }

        if (shouldUp) {
            if (nextSteps.length) {
                isDone = false
                didStart = true
                let onDownStep
                const stepFn = nextSteps.pop()
                prevSteps.push(stepFn)
                try {
                    onDownStep = await stepFn(...args)
                } catch (err) {
                    onError(err)
                }
                onDownSteps.push(onDownStep || (() => {}))
                return next(...args)
            }
        } else if (onDownSteps.length) {
            isDone = false
            didStart = true
            const stepFn = onDownSteps.pop()
            try {
                await stepFn()
            } catch (err) {
                onError(err)
            }
            nextSteps.push(prevSteps.pop())
            return next(...args)
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

    const nextDone = async (...args) => {
        await innerQueue(() => next(...args))
    }

    let currentStep
    const queuedNext = async (...args) => {
        let stepErr
        try {
            currentStep = queue(() => nextDone(...args))
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
        setError(err) {
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
