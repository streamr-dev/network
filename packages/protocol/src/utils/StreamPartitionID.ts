/**
 * SPID - Stream Partition ID
 */
export default class SPID {
    /** stream id */
    public readonly id: string
    /** stream partition */
    public readonly partition: number
    /** toString/fromString separator */
    protected static readonly SEPARATOR = '|'

    /** string key representing SPID */
    public readonly key: string

    protected readonly cachedSplit: [string, number] // cached split

    /**
     * @param id - stream id
     * @param partition - stream partition
     */
    constructor(id: string, partition = 0) {
        this.id = typeof id === 'string' ? id.toLowerCase() : id
        this.partition = partition
        this.validate()

        // static values
        const separator = (this.constructor as typeof SPID).SEPARATOR
        this.key =`${this.id}${separator}${this.partition}`
        this.cachedSplit = [this.id, this.partition]
        // prevent all mutation
        Object.freeze(this)
        Object.freeze(this.cachedSplit)
    }

    /**
     * Throws if data is invalid.
     */
    private validate() {
        if (typeof this.id !== 'string' || this.id.length === 0) {
            throw new Error('SPID validation failed: id must be non-empty string')
        }

        if (typeof this.partition !== 'number' || !Number.isSafeInteger(this.partition) || this.partition < 0) {
            throw new Error('SPID validation failed: paritition must be an integer >= 0 ')
        }
    }

    /**
     * True iff other value is equivalent.
     */
    equals(other: SPIDish): boolean {
        // check if same instance
        if (other === this) { return true }
        let otherSpid: SPID
        try {
            otherSpid = (this.constructor as typeof SPID).from(other)
        } catch (_err) {
            // not equal if not valid
            return false
        }

        // check if matches both id + partition
        return (
            this.id === otherSpid.id
            && this.partition === otherSpid.partition
        )
    }

    /**
     * Convert to SPID if possible.
     */
    static from(spidish: SPIDish): SPID {
        // return spid if already spid
        if (spidish instanceof SPID) {
            return spidish
        }

        // convert from string
        if (typeof spidish === 'string') {
            return SPID.fromString(spidish)
        } else if (spidish && typeof spidish === 'object') {
            // @ts-expect-error object should have one of these, validated anyway
            const streamId = spidish.streamId || spidish.id
            // @ts-expect-error object should have one of these, validated anyway
            const streamPartition = spidish.streamPartition || spidish.partition
            return SPID.from(`${streamId}${this.SEPARATOR}${streamPartition}`)
        } else {
            // TODO: add more conversions?
            throw new Error(`SPID validation failed, input is malformed: ${spidish}`)
        }
    }

    /**
     * Convert String to SPID if possible.
     */
    static fromString(spidString: string): SPID {
        const [id, parititionStr] = spidString.split(this.SEPARATOR)
        return new SPID(id, Number.parseFloat(parititionStr) || 0)
    }

    /**
     * String representation of SPID id + partition
     */
    toString(): string {
        return this.key
    }

    /**
     * Alias of toString.
     */
    toKey(): string {
        return this.key
    }

    /**
     * Returns an [id, partition] tuple.
     * Useful for destructuring.
     * e.g.
     * ```js
     * const [streamId, streamPartition] = spid.split()
     * ```
     */
    split(): [string, number] {
        return this.cachedSplit
    }

    /**
     * Returns an [id, partition] tuple.
     * Useful for destructuring.
     * e.g.
     * ```js
     * const [streamId, streamPartition] = SPID.split(someString)
     * ```
     */
    static split(spidish: SPIDish): [string, number] {
        return SPID.from(spidish).split()
    }

    /**
     * Returns a key for spidish
     * e.g.
     * ```js
     * const key = SPID.toKey({ streamId, streamPartition })
     * ```
     */
    static toKey(spidish: SPIDish): string {
        return SPID.from(spidish).key
    }
}

/**
 * SPID or String representing a SPID
 */
export type SPIDish = SPID | string | { streamId: string, streamPartition: number } | { id: string, partition: number }
