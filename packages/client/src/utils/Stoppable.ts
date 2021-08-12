import { scoped, Lifecycle, injectable } from 'tsyringe'
import Signal from './Signal'
import Scaffold from './Scaffold'

export type Stoppable = {
    isStopped: boolean
    stop(): void | Promise<void>
}

export class StartStop {
    static registry = new WeakMap()

    static createStart<T extends object>(instance: T, fn?: () => void | Promise<void>) {
        const startStop = this.getFor(instance)
        startStop.onStart(fn)
        return startStop.start
    }

    static createStop<T extends object>(instance: T, fn?: () => void | Promise<void>) {
        const startStop = this.getFor(instance)
        startStop.onStop(fn)
        return startStop.stop
    }

    static getFor<T extends object>(instance: T) {
        const startStop = this.registry.get(instance) || new StartStop()
        this.registry.set(instance, startStop)
        return startStop
    }

    isStopped = false
    update

    constructor() {
        this.update = Scaffold([
            async () => {
                await this.onStart.trigger()
                return async () => {
                    this.onStop.trigger()
                }
            }
        ], () => this.isStopped)

        this.start = this.start.bind(this)
        this.stop = this.stop.bind(this)
    }

    onStart = Signal.create<void, this>(this)
    onStop = Signal.create<void, this>(this)
    async start() {
        this.isStopped = false
        await this.update()
    }

    async stop() {
        this.isStopped = true
        await this.update()
    }
}

export function isStoppable(value: any) {
    return (
        value
        && typeof value === 'object'
        && typeof value.isStopped === 'boolean'
        && typeof value.stop === 'function'
    )
}

@scoped(Lifecycle.ContainerScoped)
export class StopRegistry extends Set<Stoppable> {
    async stop() {
        const items = new Set(this)
        this.clear()
        const tasks = [...items].map(async (item) => item.stop())
        await Promise.allSettled(tasks)
        await Promise.all(tasks)
    }
}

@injectable()
export class StopToken {
    constructor(
        private stopRegistry: StopRegistry,
    ) {}

    register(value: Stoppable) {
        this.stopRegistry.add(value)
    }
}
