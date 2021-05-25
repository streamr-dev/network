import { Defer } from '../utils'
import { pipeline } from '../utils/iterators'
import { validateOptions } from '../stream/utils'

import messageStream from './messageStream'
import resendStream from './resendStream'
import Subscription from './Subscription'
import Subscriptions from './Subscriptions'
import { Todo, MaybeAsync } from '../types'
import StreamrClient, { StreamPartDefinition, SubscribeOptions } from '..'

type StreamOptions = Subscription | StreamPartDefinition | { options: Subscription|StreamPartDefinition }

/**
 * Top-level user-facing interface for creating/destroying subscriptions.
 */
export class Subscriber {

    client: StreamrClient
    subscriptions: Subscriptions

    constructor(client: StreamrClient) {
        this.client = client
        this.subscriptions = new Subscriptions(client)
    }

    getSubscriptionSession(...args: Todo[]) {
        // @ts-expect-error
        return this.subscriptions.getSubscriptionSession(...args)
    }

    get(opts: StreamPartDefinition) {
        return this.subscriptions.get(opts)
    }

    getAll() {
        return this.subscriptions.getAll()
    }

    count(options?: StreamPartDefinition) {
        return this.subscriptions.count(options)
    }

    async subscribe(opts: StreamPartDefinition, onFinally?: Todo) {
        return this.subscriptions.add(opts, onFinally)
    }

    async unsubscribe(options: StreamOptions): Promise<Todo> {
        if (options instanceof Subscription) {
            const sub = options
            return sub.cancel()
        }

        // @ts-expect-error
        if (options && options.options) {
            // @ts-expect-error
            return this.unsubscribe(options.options)
        }

        // @ts-expect-error
        return this.subscriptions.removeAll(options)
    }

    async resend(opts: Todo) {
        const resendMsgStream = resendStream(this.client, opts)

        const sub = new Subscription(this.client, {
            msgStream: resendMsgStream,
            ...opts,
        }, async (...args) => {
            sub.emit('resent')
            await sub.cancel(...args)
        })

        await resendMsgStream.subscribe().catch(async (err) => {
            await sub.cancel()
            throw err
        })
        return sub
    }

    async resendSubscribe(opts: SubscribeOptions & StreamPartDefinition, onFinally?: MaybeAsync<(err?: any) => void>) {
        const onEndFns: any[] = []
        // This works by passing a custom message stream to a subscription
        // the custom message stream iterates resends, then iterates realtime
        const options = validateOptions(opts)

        const resendMessageStream = resendStream(this.client, options)
        onEndFns.push(async () => resendMessageStream.cancel())
        // @ts-expect-error
        const realtimeMessageStream = messageStream(this.client.connection, options)
        onEndFns.push(async () => realtimeMessageStream.cancel())

        // cancel both streams on end
        async function end(optionalErr?: Error) {
            const tasks = onEndFns.slice().reverse()
            onEndFns.length = 0
            await tasks.reduce((prev, next) => (
                prev.finally(async () => next())
            ), Promise.resolve())

            if (optionalErr) {
                throw optionalErr
            }
        }

        let resendSubscribeSub: Todo

        let lastResentMsgId: Todo
        let lastProcessedMsgId: Todo
        const resendDone = Defer()
        let isResendDone = false
        let resentEmitted = false
        onEndFns.push(() => resendDone.resolve(undefined))

        function messageIDString(msg: Todo) {
            return msg.getMessageID().serialize()
        }

        function maybeEmitResend() {
            if (resentEmitted || !isResendDone) { return }

            // need to account for both cases:
            // resent finished after last message got through pipeline
            // resent finished before last message got through pipeline
            if (!lastResentMsgId || lastProcessedMsgId === lastResentMsgId) {
                lastResentMsgId = undefined
                resentEmitted = true
                resendSubscribeSub.emit('resent')
            }
        }

        const it = pipeline([
            async function* HandleResends() {
                // Inconvience here
                // emitting the resent event is a bit tricky in this setup because the subscription
                // doesn't know anything about the source of the messages
                // can't emit resent immediately after resent stream end since
                // the message is not yet through the message pipeline
                let currentMsgId
                try {
                    for await (const msg of resendSubscribeSub.resend) {
                        currentMsgId = messageIDString(msg.streamMessage)
                        yield msg
                    }
                } finally {
                    lastResentMsgId = currentMsgId
                    isResendDone = true
                    maybeEmitResend()
                    // @ts-expect-error
                    resendDone.resolve()
                }
            },
            async function* ResendThenRealtime(src: Todo) {
                yield* src
                await resendDone // ensure realtime doesn't start until resend ends
                yield* resendSubscribeSub.realtime
            },
        ], end)
        onEndFns.push(async () => it.cancel())

        const resendTask = resendMessageStream.subscribe()

        const realtimeTask = this.subscribe({
            ...options,
            // @ts-expect-error
            msgStream: it,
            afterSteps: [
                async function* detectEndOfResend(src: Todo) {
                    for await (const msg of src) {
                        const id = messageIDString(msg)
                        try {
                            yield msg
                        } finally {
                            lastProcessedMsgId = id
                            maybeEmitResend()
                        }
                    }
                },
            ],
        }, onFinally).then((sub) => {
            resendSubscribeSub = sub
            onEndFns.push(async () => {
                if (!resendSubscribeSub.isCancelled()) {
                    await resendSubscribeSub.cancel()
                }
            })
            return sub
        })

        const tasks: Promise<any>[] = [
            realtimeTask,
            resendTask,
        ]

        try {
            await Promise.allSettled(tasks)
            await Promise.all(tasks)
        } catch (err) {
            await end()
            throw err
        }

        // attach additional utility functions
        return Object.assign(resendSubscribeSub, {
            realtime: realtimeMessageStream,
            resend: resendMessageStream,
        })
    }
}
