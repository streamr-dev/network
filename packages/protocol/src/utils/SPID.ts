import { format } from 'util'

class SPIDValidationError extends Error {
    data: SPIDish
    constructor(msg: string, data: SPIDish) {
        super(format(msg, data))
        this.data = data
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}
/**
 * SPID - Stream Partition ID
 */
// if you're using JS numbers for
// ids or keys going over MAX_SAFE_INTEGER has the potential for disasterous
// effects e.g. serving private user information
export default class SPID {
    /** stream id */
    public readonly id: string
    /** stream partition */
    public readonly partition: number
    /** toString/fromString separator */
    protected static readonly SEPARATOR = '#'

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

        // static cached values to prevent unnecessary runtime allocations
        this.key = `${this.id}${SPID.SEPARATOR}${this.partition}`
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
            throw new SPIDValidationError('SPID validation failed: id must be non-empty string: %o', {
                id: this.id,
                partition: this.partition
            })
        }

        if (typeof this.partition !== 'number' || !Number.isSafeInteger(this.partition) || this.partition < 0) {
            throw new SPIDValidationError('SPID validation failed: partition must be a safe integer >= 0: %o', {
                id: this.id,
                partition: this.partition
            })
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
            otherSpid = SPID.from(other)
        } catch (_err) {
            // ignore error
            // not equal if not valid
            return false
        }

        // check key matches
        return this.key === otherSpid.key
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
            const partition = spidish.streamPartition || spidish.partition
            // try parse if a value was passed, but fall back to undefined i.e. default
            const streamPartition = partition != null ? Number.parseFloat(partition) : undefined
            return new SPID(streamId, streamPartition)
        } else {
            // TODO: add more conversions?
            throw new SPIDValidationError('SPID validation failed, input is malformed: %o', spidish)
        }
    }

    /**
     * Convert String to SPID if possible.
     */
    static fromString(spidString: string): SPID {
        const [id, partitionStr] = spidString.split(this.SEPARATOR)
        // partition is optional, falls back to undefined i.e. default
        const partition = partitionStr != null ? Number.parseFloat(partitionStr) : undefined
        return new SPID(id, partition)
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
        return this.toString()
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
