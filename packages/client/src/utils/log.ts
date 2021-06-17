/**
 * Exposes customised Debug and inspect functions.
 */
import util from 'util'
import Debug from 'debug'

export const DEFAULT_INSPECT_OPTS = {
    maxStringLength: 256
}

// add global support for pretty millisecond formatting with %n
// @ts-expect-error humanize not in debug types
Debug.formatters.n = (v) => Debug.humanize(v)

// override %o & %O to ensure default opts apply
Debug.formatters.o = function o(v: any) {
    // @ts-expect-error inspectOpts not in debug types
    this.inspectOpts.colors = this.useColors
    return util.inspect(v, { ...this.inspectOpts, ...DEFAULT_INSPECT_OPTS })
        .split('\n')
        .map((str) => str.trim())
        .join(' ')
}

Debug.formatters.O = function O(v: any) {
    // @ts-expect-error inspectOpts not in debug types
    this.inspectOpts.colors = this.useColors
    return util.inspect(v, { ...this.inspectOpts, ...DEFAULT_INSPECT_OPTS })
}

const debug = Debug('Streamr')

// @ts-expect-error inspectOpts not in debug types
debug.inspectOpts = {
    ...DEFAULT_INSPECT_OPTS,
}

const StreamrDebug = Object.assign(debug.extend.bind(debug), {
    enable: Debug.enable.bind(Debug),
    disable: Debug.disable.bind(Debug),
    // @ts-expect-error humanize not in debug types
    humanize: Debug.humanize.bind(Debug),
})

export type Debugger = ReturnType<typeof StreamrDebug>

export {
    StreamrDebug as Debug,
}

export function inspect(value: any, inspectOptions: Parameters<typeof util.inspect>[1] = {}): string {
    return util.inspect(value, {
        ...DEFAULT_INSPECT_OPTS,
        ...inspectOptions,
    })
}

export function formatWithOptions(inspectOptions: Parameters<typeof util.formatWithOptions>[0], msgFormat?: any, ...param: any[]): string {
    return util.formatWithOptions({
        ...DEFAULT_INSPECT_OPTS,
        ...inspectOptions,
    }, msgFormat, ...param)
}

export function format(msgFormat?: any, ...param: any[]): string {
    return formatWithOptions(DEFAULT_INSPECT_OPTS, msgFormat, ...param)
}
