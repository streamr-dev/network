export const addManagedEventListener = <TEventName extends string, TListener extends (...payloads: any[]) => void>(
    emitter: {
        on: (eventName: TEventName, listener: TListener) => unknown
        off: (eventName: TEventName, listener: TListener) => unknown
    },
    eventName: TEventName,
    listener: TListener,
    abortSignal: AbortSignal
): void => {
    if (!abortSignal.aborted) {
        emitter.on(eventName, listener)
        abortSignal.addEventListener(
            'abort',
            () => {
                emitter.off(eventName, listener)
            },
            {
                once: true
            }
        )
    }
}
