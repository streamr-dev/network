/**
 * SPID - Stream + Partition ID
 * See SPID constructor docs.
 *
 * SPID
 * SPIDLike
 * SID
 * SIDLike
 */

import { format } from 'util'

type RequiredKeys<T, Keys extends keyof T> = Omit<T, Keys> & Required<Pick<T, Keys>>

/**
 * Has both streamId & partition
 */
export type SPIDShape = {
    streamId: string
    streamPartition: number
}

export type SPIDKeyShape = SPIDShape & {
    key: string
}

/**
 * SPID or String representing a SPID
 * Object cases can be typechecked
 * TODO: SPID string type safety
 */
export type SPIDLike = string | SPIDShape

/**
 * Must have something that looks like an id.
 * Partition optional.
 */
export type SID = { streamId: string, streamPartition?: number }

export type SIDLike = string | SID

class SPIDValidationError extends Error {
    data: Partial<SPIDLike>
    constructor(msg: string, data: Partial<SPIDLike>) {
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
export class SPID implements SPIDKeyShape {
    /** stream id */
    public readonly streamId: string
    /** stream partition */
    public readonly streamPartition: number
    /** toString/fromString separator */
    protected static readonly SEPARATOR = '#'

    /** string key representing SPID */
    public readonly key: string

    /**
     * @param id - stream id
     * @param partition - stream partition
     */
    constructor(id: string, partition: number) {
        this.streamId = id
        this.streamPartition = partition
        this.validate()

        // static cached values to prevent unnecessary runtime allocations
        this.key = `${this.streamId}${SPID.SEPARATOR}${this.streamPartition}`
        // prevent all mutation
        Object.freeze(this)
    }

    /**
     * Throws if data is invalid.
     */
    private validate() {
        if (typeof this.streamId !== 'string' || this.streamId.length === 0) {
            throw new SPIDValidationError('SPID validation failed: id must be non-empty string: %o', {
                streamId: this.streamId,
                streamPartition: this.streamPartition
            })
        }

        if (typeof this.streamPartition !== 'number' || !Number.isSafeInteger(this.streamPartition) || this.streamPartition < 0) {
            throw new SPIDValidationError('SPID validation failed: partition must be a safe integer >= 0: %o', {
                streamId: this.streamId,
                streamPartition: this.streamPartition
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
    matches(spidMatcher: SIDLike): boolean {
        if (spidMatcher instanceof SPID) { return this.equals(spidMatcher) }

        const { streamId, streamPartition } = SPID.parse(spidMatcher)
        if (streamPartition == null) {
            return this.streamId === streamId
        }

        return this.streamId === streamId && this.streamPartition === streamPartition
    }

    /**
     * Convert SPIDLikePartial to SPIDObjectPartial
     * i.e. normalizes various input types/shapes to { streamId?, streamPartition? }
     * Note: does not throw on malformed input
     */
    static parse(spidLike: SPID): SPID
    static parse(spidLike: SPIDShape): SPIDShape
    static parse(spidLike: SIDLike): SID
    static parse(spidLike: SPIDLike): SPIDShape // both fields
    static parse(spidLike: Partial<SIDLike>): Partial<SPIDShape>
    static parse(spidLike: SIDLike): Partial<SPIDShape> {
        if (spidLike instanceof SPID) {
            return spidLike
        }

        // convert from string
        if (typeof spidLike === 'string') {
            const [streamId, partitionStr] = spidLike.split(this.SEPARATOR)
            // partition is optional, falls back to undefined i.e. default
            const streamPartition = partitionStr != null ? Number.parseFloat(partitionStr) : undefined
            return { streamId, streamPartition }
        } else if (spidLike && typeof spidLike === 'object') {
            const streamId = spidLike.streamId
            const partition = spidLike.streamPartition ?? undefined
            // try parse if a value was passed, but fall back to undefined i.e. default
            const streamPartition = typeof partition === 'string' ? Number.parseFloat(partition) : partition
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
    static fromDefaults(spidLike: SIDLike, defaultValues?: Partial<SPIDShape>): SPID
    // requires id+partition if no defaults
    static fromDefaults(spidLike: SIDLike, defaultValues: RequiredKeys<Partial<SPIDShape>, 'streamPartition'>): SPID
    static fromDefaults(spidLike: SIDLike, defaultValues: string | RequiredKeys<Partial<SPIDShape>, 'streamPartition'>): SPID
    static fromDefaults(spidLike: string | RequiredKeys<Partial<SPIDShape>, 'streamPartition'>, defaultValues: SIDLike): SPID
    static fromDefaults(spidLike: SPIDLike, defaultValues?: Partial<SPIDLike>): SPID {
        // return spid if already spid
        if (spidLike instanceof SPID) {
            return spidLike
        }

        // defaults can be partial, e.g. { partition: 0 }
        // toSPIDObjectPartial can handle undefined input but we want external interface to check for it.
        const defaults = SPID.parse(defaultValues!)
        const { streamId = defaults?.streamId, streamPartition = defaults?.streamPartition } = SPID.parse(spidLike)
        try {
            // constructor can handle partial input but we want external interface to check for it.
            return new SPID(streamId!, streamPartition!)
        } catch (err: any) {
            // TODO: add more conversions?
            throw new SPIDValidationError(`SPID validation failed, input is malformed. ${err && err.message} %o`, spidLike)
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
    toObject(): SPIDShape {
        return {
            streamId: this.streamId,
            streamPartition: this.streamPartition,
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

