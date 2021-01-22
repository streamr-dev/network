import { MessageQueue, QueueItem } from '../../src/connection/MessageQueue'
import Mock = jest.Mock

describe(QueueItem, () => {
    it('starts as non-failed', () => {
        const item = new QueueItem('message', () => {}, () => {})
        expect(item.isFailed()).toEqual(false)
        expect(item.getErrorInfos()).toEqual([])
    })

    it('does not become failed if incrementTries invoked less than MAX_RETRIES times', () => {
        const item = new QueueItem('message', () => {}, () => {})
        for (let i = 0; i < MessageQueue.MAX_TRIES - 1; ++i) {
            item.incrementTries({ error: 'error' })
        }
        expect(item.isFailed()).toEqual(false)
    })

    it('becomes failed if incrementTries invoked MAX_RETRIES times', () => {
        const item = new QueueItem('message', () => {}, () => {})
        for (let i = 0; i < MessageQueue.MAX_TRIES; ++i) {
            item.incrementTries({ error: 'error' })
        }
        expect(item.isFailed()).toEqual(true)
        expect(item.getErrorInfos()).toEqual(Array(MessageQueue.MAX_TRIES).fill({ error: 'error' }))
    })

    it('becomes failed immediately if immediateFail invoked', () => {
        const item = new QueueItem('message', () => {}, () => {})
        item.immediateFail('error')
        expect(item.isFailed()).toEqual(true)
        expect(item.getErrorInfos()).toEqual([])
    })

    describe('when method delivered() invoked', () => {
        let successFn: Mock
        let errorFn: Mock

        beforeEach(() => {
            successFn = jest.fn()
            errorFn = jest.fn()
            const item = new QueueItem<string>('message', successFn, errorFn)
            item.delivered()
        })

        it('onSuccess callback invoked', () => {
            expect(successFn).toHaveBeenCalledTimes(1)
        })

        it('onError callback not invoked', () => {
            expect(errorFn).toHaveBeenCalledTimes(0)
        })
    })

    describe('after method incrementTries invoked() MAX_RETRIES times', () => {
        let successFn: Mock
        let errorFn: Mock

        beforeEach(() => {
            successFn = jest.fn()
            errorFn = jest.fn()
            const item = new QueueItem<string>('message', successFn, errorFn)
            for (let i = 0; i < MessageQueue.MAX_TRIES; ++i) {
                item.incrementTries({ error: `error ${i}` })
            }
        })

        it('onSuccess callback invoked', () => {
            expect(successFn).toHaveBeenCalledTimes(0)
        })

        it('onError callback invoked with supplied error message', () => {
            expect(errorFn.mock.calls).toEqual([
                [new Error('Failed to deliver message.')]
            ])
        })
    })

    describe('when method immediateFail() invoked', () => {
        let successFn: Mock
        let errorFn: Mock

        beforeEach(() => {
            successFn = jest.fn()
            errorFn = jest.fn()
            const item = new QueueItem<string>('message', successFn, errorFn)
            item.immediateFail('here is error message')
        })

        it('onSuccess callback invoked', () => {
            expect(successFn).toHaveBeenCalledTimes(0)
        })

        it('onError callback invoked with supplied error message', () => {
            expect(errorFn.mock.calls).toEqual([
                [new Error('here is error message')]
            ])
        })
    })
})
