/**
 * Exposes customised Debug and inspect functions.
 */
import util from 'util'
import Debug from 'debug'

// add global support for pretty millisecond formatting with %n
Debug.formatters.n = (v) => {
    if (v == null || Number.isNaN(v)) { return String(v) }
    return Debug.humanize(v)
}

export const DEFAULT_INSPECT_OPTS = {
    maxStringLength: 256
}

// override default formatters for node
if (typeof window === 'undefined') {
    // monkeypatch default log function to use current inspectOpts.  This
    // ensures values without placeholders will have inspect options applied.
    // e.g. debug('msg', obj) should use same inspectOpts as debug('msg %O', msg)
    // without this only values with a placeholder e.g. '%o' will use inspectOpts
    Debug.log = function log(...args) {
        // @ts-expect-error inspectOpts not in debug types
        return process.stderr.write(util.formatWithOptions(this.inspectOpts || {}, ...args) + '\n')
    }
}

const debug = Debug('Streamr')
// @ts-expect-error inspectOpts not in debug types
debug.inspectOpts = {
    ...DEFAULT_INSPECT_OPTS,
}

const StreamrDebug = Object.assign(debug.extend.bind(debug), {
    enable: Debug.enable.bind(Debug),
    disable: Debug.disable.bind(Debug),
    humanize: Debug.humanize.bind(Debug) as (v: any) => string,
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
