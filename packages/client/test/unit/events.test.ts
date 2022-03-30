import 'reflect-metadata'
import { initEventGateway, ObservableEventEmitter } from '../../src/events'

interface FooPayload {
    x: string,
    y: number
}

interface MockEvents {
    foo: (payload: FooPayload) => void
    bar: (payload: number) => void
}

type MockGatewayListener = () => void

const MOCK_EVENT_NAME = 'foo'
const MOCK_EVENT_PAYLOAD = {
    x: 'mock',
    y: 123
}
const OTHER_EVENT_NAME = 'bar'

describe('events', () => {

    it('observable listeners', () => {
        const emitter = new ObservableEventEmitter<MockEvents>()
        const listenerCounts: number[] = []
        const onEventEmitterChange = (name: string) => {
            if (name === MOCK_EVENT_NAME) {
                listenerCounts.push(emitter.getListenerCount(MOCK_EVENT_NAME))
            }
        }
        emitter.getObserver().on('addEventListener', onEventEmitterChange)
        emitter.getObserver().on('removeEventListener', onEventEmitterChange)
        const listener1 = () => {}
        const listener2 = () => {}
        emitter.on(MOCK_EVENT_NAME, listener1)
        emitter.on(MOCK_EVENT_NAME, listener2)
        emitter.once(MOCK_EVENT_NAME, () => {})
        emitter.emit(MOCK_EVENT_NAME, MOCK_EVENT_PAYLOAD)
        emitter.off(MOCK_EVENT_NAME, listener1)
        emitter.off(MOCK_EVENT_NAME, listener2)
        expect(listenerCounts).toEqual([1, 2, 3, 2, 1, 0])
    })

    describe('gateway', () => {

        let emitter: ObservableEventEmitter<MockEvents>
        let start: () => MockGatewayListener
        let stop: (listener: MockGatewayListener) => void

        beforeEach(() => {
            emitter = new ObservableEventEmitter<MockEvents>()
            start = jest.fn().mockReturnValue(() => {})
            stop = jest.fn()
        })

        it('happy path', () => {
            initEventGateway(MOCK_EVENT_NAME, start, stop, emitter)
            const listener = () => {}
            expect(start).toBeCalledTimes(0)
            expect(stop).toBeCalledTimes(0)
            emitter.on(MOCK_EVENT_NAME, listener)
            expect(start).toBeCalledTimes(1)
            expect(stop).toBeCalledTimes(0)
            emitter.off(MOCK_EVENT_NAME, listener)
            expect(start).toBeCalledTimes(1)
            expect(stop).toBeCalledTimes(1)
        })

        it('multiple listeners', () => {
            initEventGateway(MOCK_EVENT_NAME, start, stop, emitter)
            const listener1 = () => {}
            const listener2 = () => {}
            expect(start).toBeCalledTimes(0)
            emitter.on(MOCK_EVENT_NAME, listener1)
            expect(start).toBeCalledTimes(1)
            emitter.on(MOCK_EVENT_NAME, listener2)
            expect(start).toBeCalledTimes(1)
            emitter.off(MOCK_EVENT_NAME, listener1)
            expect(stop).toBeCalledTimes(0)
            emitter.off(MOCK_EVENT_NAME, listener2)
            expect(stop).toBeCalledTimes(1)
        })

        it('once', () => {
            initEventGateway(MOCK_EVENT_NAME, start, stop, emitter)
            const listener = () => {}
            expect(start).toBeCalledTimes(0)
            emitter.once(MOCK_EVENT_NAME, listener)
            expect(start).toBeCalledTimes(1)
            expect(stop).toBeCalledTimes(0)
            emitter.emit(MOCK_EVENT_NAME, MOCK_EVENT_PAYLOAD)
            expect(stop).toBeCalledTimes(1)
        })

        it('ignorable event', () => {
            initEventGateway(MOCK_EVENT_NAME, start, stop, emitter)
            emitter.on(OTHER_EVENT_NAME, () => {})
            expect(start).toBeCalledTimes(0)
        })

        it('start if initial listeners', () => {
            emitter.on(MOCK_EVENT_NAME, () => {})
            initEventGateway(MOCK_EVENT_NAME, start, stop, emitter)
            expect(start).toBeCalledTimes(1)
        })

        it('restart', () => {
            initEventGateway(MOCK_EVENT_NAME, start, stop, emitter)
            const listener = () => {}
            expect(start).toBeCalledTimes(0)
            expect(stop).toBeCalledTimes(0)
            emitter.on(MOCK_EVENT_NAME, listener)
            expect(start).toBeCalledTimes(1)
            expect(stop).toBeCalledTimes(0)
            emitter.off(MOCK_EVENT_NAME, listener)
            expect(start).toBeCalledTimes(1)
            expect(stop).toBeCalledTimes(1)
            emitter.on(MOCK_EVENT_NAME, listener)
            expect(start).toBeCalledTimes(2)
            expect(stop).toBeCalledTimes(1)
            emitter.off(MOCK_EVENT_NAME, listener)
            expect(start).toBeCalledTimes(2)
            expect(stop).toBeCalledTimes(2)
        })
    })
})
