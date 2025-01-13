import { ObservableEventEmitter } from '../src/ObservableEventEmitter'

interface FooPayload {
    x: string
    y: number
}

interface MockEvents {
    foo: (payload: FooPayload) => void
    bar: (payload: number) => void
}

const MOCK_EVENT_NAME = 'foo'
const MOCK_EVENT_PAYLOAD = {
    x: 'mock',
    y: 123
}
const OTHER_EVENT_NAME = 'bar'

describe('ObservableEventEmitter', () => {
    it('happy path', () => {
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

    it('removeAllListeners: emits removeEventListener for all registered StreamrClientEvents', () => {
        const emitter = new ObservableEventEmitter<MockEvents>()
        const eventNames: string[] = []
        emitter.on(MOCK_EVENT_NAME, () => {})
        emitter.getObserver().on('removeEventListener', (eventName: string) => eventNames.push(eventName))
        emitter.on(OTHER_EVENT_NAME, () => {})
        emitter.removeAllListeners()
        expect(eventNames).toEqual([MOCK_EVENT_NAME, OTHER_EVENT_NAME])
    })
})
