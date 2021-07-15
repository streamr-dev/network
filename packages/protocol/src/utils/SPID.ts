/**
 * SPID - Stream + Partition ID
 * See SPID constructor docs.
 */

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

export type SPIDShape = { id: string, partition: number }

/**
 * SPID or String representing a SPID
 * Object cases can be typechecked
 * TODO: SPID string type safety
 */
export type SPIDLike = SPID | string | SPIDObject | SPIDShape

/**
 * Flexible input type
 */
export type SPIDLikePartial = SPIDLike | SPIDObjectPartial | Partial<SPIDShape>

/* Must be options object */
export type SPIDLikeObject = Exclude<SPIDLike, string>

/* Must be able to parse an ID from this, partition optional */
export type StreamMatcher = SPID | SPIDLike | { streamId: string } | { id: string }

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
 * SPID – Stream + Partition ID
 * Simple Data container that represents a streamId + partition, and utilities
 * to parse various formats into a SPID.
 *
 * Use this rather than inventing new data types to represenent or parse these.
 *
 * Usage:
 * ```js
 * const spid = new SPID(streamId, streamPartition)
 * spid.id === streamId // true
 * spid.partition === streamPartition // true
 * ```
 * See tests for more usage examples.
 */
export class SPID {
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
     * True iff matches streamId & optionally streamPartition
     * streamId is required, hence SPIDMatcher.
     * If streamPartition is missing, just matches on streamId
     */
    matches(spidMatcher: StreamMatcher): boolean {
        if (spidMatcher instanceof SPID) { return this.equals(spidMatcher) }

        const { streamId, streamPartition } = SPID.toSPIDObjectPartial(spidMatcher)
        if (streamPartition == null) {
            return this.id === streamId
        }

        return this.id === streamId && this.partition === streamPartition
    }

    /**
     * Convert SPIDLikePartial to SPIDObjectPartial
     * i.e. normalizes various input types/shapes to { streamId?, streamPartition? }
     * Note: does not throw on malformed input
     */
    static toSPIDObjectPartial(spidLike: SPIDLike): SPIDObject; // both fields
    static toSPIDObjectPartial(spidLike: StreamMatcher): { streamId: string, streamPartition: undefined } | SPIDObject;
    static toSPIDObjectPartial(spidLike: SPIDLikePartial): SPIDObjectPartial;
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
            const partition = spidLike.streamPartition != null ? spidLike.streamPartition : spidLike.partition
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

