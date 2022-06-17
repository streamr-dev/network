import LeakDetector from 'jest-leak-detector'
import { wait } from 'streamr-test-utils'
import { CounterId, instanceId } from '../../src/utils/utils'
import { format } from '../../src/utils/log'
import { Debug } from './utils'

export class LeaksDetector {
    private leakDetectors: Map<string, LeakDetector> = new Map()
    private ignoredValues = new WeakSet()
    private id = instanceId(this)
    private debug = Debug(this.id)
    private seen = new WeakSet()
    private didGC = false

    // temporary whitelist leaks in network code
    ignoredKeys = new Set([
        '/cachedNode',
        '/container',
        '/childContainer',
        'rovider/formatter',
        'chainProviders/0/formatter'
    ])

    private counter = CounterId(this.id, { maxPrefixes: 1024 })

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    add(name: string, obj: any): void {
        if (!obj || typeof obj !== 'object') { return }

        if (this.ignoredValues.has(obj)) { return }

        this.resetGC()
        const leaksDetector = new LeakDetector(obj)
        // @ts-expect-error monkeypatching
        // eslint-disable-next-line no-underscore-dangle
        leaksDetector._runGarbageCollector = this.runGarbageCollectorOnce(leaksDetector._runGarbageCollector)
        this.leakDetectors.set(name, leaksDetector)
    }

    // returns a monkeypatch for leaksDetector._runGarbageCollector
    // that avoids running gc for every isLeaking check, only once.
    private runGarbageCollectorOnce(original: (...args: unknown[]) => void) {
        return (...args: any[]) => {
            if (this.didGC) {
                return
            }

            this.didGC = true
            original(...args)
        }
    }

    resetGC(): void {
        this.didGC = false
    }

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    ignore(obj: any): void {
        if (!obj || typeof obj !== 'object') { return }
        this.ignoredValues.add(obj)
    }

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    ignoreAll(obj: any): void {
        if (!obj || typeof obj !== 'object') { return }
        const seen = new Set()
        this.walk([], obj, (_path, value) => {
            if (seen.has(value)) { return false }
            seen.add(value)
            this.ignore(value)
            return undefined
        })
    }

    idToPaths = new Map<string, Set<string>>() // ids to paths
    objectToId = new WeakMap<object, string>() // single id for value

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    getID(path: string[], value: any): any {
        if (this.objectToId.has(value)) {
            return this.objectToId.get(value)
        }

        let id = (() => {
            if (value.id) { return value.id }
            const pathString = path.join('/')
            const constructor = value.constructor?.name
            const type = constructor === 'Object' ? undefined : constructor
            return pathString + (type ? `-${type}` : '')
        })()

        id = this.counter(id)
        this.objectToId.set(value, id)
        return id
    }

    protected walk(
        path: string[],
        obj: object,
        fn: (path: string[], obj: object, depth: number) => false | void,
        depth = 0
    ): void {
        if (!obj || typeof obj !== 'object') { return }

        if (depth > 10) { return }

        const doContinue = fn(path, obj, depth)

        if (doContinue === false) { return }

        if (Array.isArray(obj)) {
            obj.forEach((value, key) => {
                this.walk([...path, `${key}`], value, fn, depth + 1)
            })
            return
        }

        for (const [key, value] of Object.entries(obj)) {
            if (!value || typeof value !== 'object') { continue }

            this.walk([...path, `${key}`], value, fn, depth + 1)
        }
    }

    addAll(rootId: string, obj: object): void {
        this.walk([rootId], obj, (path, value) => {
            if (this.ignoredValues.has(value)) { return false }
            const pathString = path.join('/')
            for (const key of this.ignoredKeys) {
                if (pathString.includes(key)) { return false } // stop walking
            }

            const id = this.getID(path, value)
            const paths = this.idToPaths.get(id) || new Set()
            paths.add(pathString)
            this.idToPaths.set(id, paths)
            if (!this.seen.has(value)) {
                this.seen.add(value)
                this.add(id, value)
            }
            return undefined
        })
    }

    async getLeaks(): Promise<Record<string, string>> {
        this.debug('checking for leaks with %d items >>', this.leakDetectors.size)
        await wait(10) // wait a moment for gc to run?
        const outstanding = new Set<string>()
        this.resetGC()
        const tasks = [...this.leakDetectors.entries()].map(async ([key, d]) => {
            outstanding.add(key)
            const isLeaking = await d.isLeaking()
            outstanding.delete(key)
            return isLeaking ? key : undefined
        })
        await Promise.allSettled(tasks)
        const results = (await Promise.all(tasks)).filter(Boolean) as string[]

        const leaks = results.reduce((o, id) => Object.assign(o, {
            [id]: [...(this.idToPaths.get(id) || [])],
        }), {})

        this.debug('checking for leaks with %d items <<', this.leakDetectors.size)
        this.debug('%d leaks.', results.length)
        return leaks
    }

    async checkNoLeaks(): Promise<void> {
        const leaks = await this.getLeaks()
        const numLeaks = Object.keys(leaks).length
        if (numLeaks) {
            const msg = format('Leaking %d of %d items: %o', numLeaks, this.leakDetectors.size, leaks)
            this.clear()
            throw new Error(msg)
        }
    }

    async checkNoLeaksFor(id: string): Promise<void> {
        const leaks = await this.getLeaks()
        const numLeaks = Object.keys(leaks).length
        if (Object.keys(leaks).includes(id)) {
            const msg = format('Leaking %d of %d items, including id %s: %o', numLeaks, this.leakDetectors.size, id, leaks)
            this.clear()
            throw new Error(msg)
        }
    }

    clear(): void {
        this.seen = new WeakSet()
        this.ignoredValues = new WeakSet()
        this.leakDetectors.clear()
        this.didGC = false
    }
}
