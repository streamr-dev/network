export type Stoppable = {
    isStopped: boolean
    stop(): void | Promise<void>
}
