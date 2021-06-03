import { format } from 'util'

class SPIDValidationError extends Error {
    data: SPIDishPartial
    constructor(msg: string, data: SPIDishPartial) {
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

    static toSPIDObjectPartial(spidish: SPIDishPartial): SPIDObjectPartial {
        // convert from string
        if (typeof spidish === 'string') {
            const [streamId, partitionStr] = spidish.split(this.SEPARATOR)
            // partition is optional, falls back to undefined i.e. default
            const streamPartition = partitionStr != null ? Number.parseFloat(partitionStr) : undefined
            return { streamId, streamPartition }
        } else if (spidish && typeof spidish === 'object') {
            // @ts-expect-error object should have one of these, validated anyway
            const streamId = spidish.streamId || spidish.id
            // @ts-expect-error object should have one of these, validated anyway
            const partition = spidish.streamPartition || spidish.partition
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
    static fromDefaults(spidish: SPIDish, defaultValues?: SPIDishPartial): SPID
    static fromDefaults(spidish: SPIDishPartial, defaultValues: SPIDishPartial): SPID // requires id+partition if no defaults
    static fromDefaults(spidish: SPIDishPartial, defaultValues?: SPIDishPartial): SPID {
        // return spid if already spid
        if (spidish instanceof SPID) {
            return spidish
        }

        // defaults can be partial, e.g. { partition: 0 }
        // toSPIDObjectPartial can handle undefined input but we want external interface to check for it.
        const defaults = SPID.toSPIDObjectPartial(defaultValues!)
        const { streamId = defaults?.streamId, streamPartition = defaults?.streamPartition } = SPID.toSPIDObjectPartial(spidish)
        try {
            // constructor can handle partial input but we want external interface to check for it.
            return new SPID(streamId!, streamPartition!)
        } catch (err) {
            // TODO: add more conversions?
            throw new SPIDValidationError(`SPID validation failed, input is malformed. ${err.message} %o`, spidish)
        }
    }

    /**
     * Convert to SPID if possible.
     */
    static from(spidish: SPIDish): SPID {
        return SPID.fromDefaults(spidish)
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
 * Flexible input type
 */
export type SPIDishPartial = SPIDish | SPIDObjectPartial | Partial<{ id: string, partition: number }>

/**
 * SPID or String representing a SPID
 * Object cases can be typechecked
 * TODO: SPID string type safety
 */
export type SPIDish = SPID | string | SPIDObject | { id: string, partition: number }
