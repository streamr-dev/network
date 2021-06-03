import { format } from 'util'

/**
 * Object version of SPID
 */
export type SPIDObject = {
    streamId: string,
    streamPartition: number
}

/**
 * Represents partial SPIDObject e.g. for setting defaults
 * Known keys
 */
export type SPIDObjectPartial = Partial<SPIDObject>

/**
 * SPID or String representing a SPID
 * Object cases can be typechecked
 * TODO: SPID string type safety
 */
export type SPIDLike = SPID | string | SPIDObject | { id: string, partition: number }

/**
 * Flexible input type
 */
export type SPIDLikePartial = SPIDLike | SPIDObjectPartial | Partial<{ id: string, partition: number }>

class SPIDValidationError extends Error {
    data: SPIDLikePartial
    constructor(msg: string, data: SPIDLikePartial) {
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
export default class SPID {
    /** stream id */
    public readonly id: string
    /** stream partition */
    public readonly partition: number
    /** toString/fromString separator */
    protected static readonly SEPARATOR = '#'

    /** string key representing SPID */
    public readonly key: string

    /**
     * @param id - stream id
     * @param partition - stream partition
     */
    constructor(id: string, partition: number) {
        this.id = id
        this.partition = partition
        this.validate()

        // static cached values to prevent unnecessary runtime allocations
        this.key = `${this.id}${SPID.SEPARATOR}${this.partition}`
        // prevent all mutation
        Object.freeze(this)
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
    equals(other: SPIDLike): boolean {
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
     * Convert SPIDLikePartial to SPIDObjectPartial
     * i.e. normalizes various input types/shapes to { streamId?, streamPartition? }
     * Note: does not throw on malformed input
     */
    static toSPIDObjectPartial(spidLike: SPIDLikePartial): SPIDObjectPartial {
        // convert from string
        if (typeof spidLike === 'string') {
            const [streamId, partitionStr] = spidLike.split(this.SEPARATOR)
            // partition is optional, falls back to undefined i.e. default
            const streamPartition = partitionStr != null ? Number.parseFloat(partitionStr) : undefined
            return { streamId, streamPartition }
        } else if (spidLike && typeof spidLike === 'object') {
            // @ts-expect-error object should have one of these, validated anyway
            const streamId = spidLike.streamId || spidLike.id
            // @ts-expect-error object should have one of these, validated anyway
            const partition = spidLike.streamPartition || spidLike.partition
            // try parse if a value was passed, but fall back to undefined i.e. default
            const streamPartition = partition != null ? Number.parseFloat(partition) : undefined
            return { streamId, streamPartition }
        } else {
            return { streamId: undefined, streamPartition: undefined }
        }
    }

    /**
     * Convert to SPID if possible, with defaults.
     * e.g.
     * ```ts
     * fromDefaults(streamId, { partition: 0 })
     * ```
     */
    static fromDefaults(spidLike: SPIDLike, defaultValues?: SPIDLikePartial): SPID
    static fromDefaults(spidLike: SPIDLikePartial, defaultValues: SPIDLikePartial): SPID // requires id+partition if no defaults
    static fromDefaults(spidLike: SPIDLikePartial, defaultValues?: SPIDLikePartial): SPID {
        // return spid if already spid
        if (spidLike instanceof SPID) {
            return spidLike
        }

        // defaults can be partial, e.g. { partition: 0 }
        // toSPIDObjectPartial can handle undefined input but we want external interface to check for it.
        const defaults = SPID.toSPIDObjectPartial(defaultValues!)
        const { streamId = defaults?.streamId, streamPartition = defaults?.streamPartition } = SPID.toSPIDObjectPartial(spidLike)
        try {
            // constructor can handle partial input but we want external interface to check for it.
            return new SPID(streamId!, streamPartition!)
        } catch (err) {
            // TODO: add more conversions?
            throw new SPIDValidationError(`SPID validation failed, input is malformed. ${err.message} %o`, spidLike)
        }
    }

    /**
     * Convert to SPID if possible.
     */
    static from(spidLike: SPIDLike): SPID {
        return SPID.fromDefaults(spidLike)
    }

    /**
     * Plain object representation of SPID id + partition
     */
    toObject(): SPIDObject {
        return {
            streamId: this.id,
            streamPartition: this.partition,
        }
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
     * Returns a key for spidLike
     * e.g.
     * ```js
     * const key = SPID.toKey({ streamId, streamPartition })
     * ```
     */
    static toKey(spidLike: SPIDLike): string {
        return SPID.from(spidLike).key
    }
}

