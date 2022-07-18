import { StreamMessage } from 'streamr-client-protocol'

import { Defer, Deferred } from '../utils/Defer'
import { DestroySignal } from '../DestroySignal'

import { Subscription } from '../subscribe/Subscription'

export type MessageMatch = (streamMessage: StreamMessage) => boolean

const waitForSubMessage = (
    sub: Subscription<unknown>,
    matchFn: MessageMatch,
    timeoutMs?: number
): Deferred<StreamMessage> => {
    const task = Defer<StreamMessage>()
    let timeoutRef: ReturnType<typeof setTimeout>
    if (timeoutMs !== undefined) {
        timeoutRef = setTimeout(() => {
            task.reject(new Error('Timeout'))
        }, timeoutMs)
    }
    const onMessage = (streamMessage: StreamMessage) => {
        try {
            if (matchFn(streamMessage)) {
                task.resolve(streamMessage)
            }
        } catch (err) {
            task.reject(err)
        }
    }
    task.finally(async () => {
        await sub.unsubscribe()
        clearTimeout(timeoutRef)
    }).catch(() => {}) // important: prevent unchained finally cleanup causing unhandled rejection
    sub.consume(onMessage).catch((err) => task.reject(err))
    sub.onError.listen(task.reject)
    return task
}

export const publishAndWaitForResponseMessage = async (
    publish: () => Promise<unknown>,
    matchFn: MessageMatch,
    createSubscription: () => Promise<Subscription<unknown>>,
    onBeforeUnsubscribe: () => void,
    destroySignal: DestroySignal,
    timeoutMs?: number
): Promise<StreamMessage<unknown> | undefined> => {
    let responseTask: Deferred<StreamMessage<unknown>> | undefined
    const onDestroy = () => {
        if (responseTask) {
            responseTask.resolve(undefined)
        }
    }

    destroySignal.onDestroy.listen(onDestroy)
    let sub: Subscription<unknown> | undefined
    try {
        sub = await createSubscription()
        responseTask = waitForSubMessage(sub, matchFn, timeoutMs)

        await publish()

        return await responseTask
    } catch (err) {
        if (responseTask) {
            responseTask.reject(err)
        }
        throw err
    } finally {
        destroySignal.onDestroy.unlisten(onDestroy)
        if (sub) {
            onBeforeUnsubscribe()
            await sub.unsubscribe()
        }
        await responseTask
    }
}
