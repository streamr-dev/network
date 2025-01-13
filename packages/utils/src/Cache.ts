export class Cache<V> {
    private value?: V
    private valueTimestamp?: number
    private readonly valueFactory: () => Promise<V>
    private readonly maxAgeInMilliseconds: number

    constructor(valueFactory: () => Promise<V>, maxAgeInMilliseconds: number) {
        this.valueFactory = valueFactory
        this.maxAgeInMilliseconds = maxAgeInMilliseconds
    }

    async get(): Promise<V> {
        const now = Date.now()
        if (this.valueTimestamp === undefined || now > this.valueTimestamp + this.maxAgeInMilliseconds) {
            this.value = await this.valueFactory()
            this.valueTimestamp = now
        }
        return this.value!
    }
}
