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
    // monkeypatch default log function to use current `inspectOpts`.  This
    // ensures values logged without placeholders e.g. %o, %O will have the
    // same inspect options applied. Without this only values with a
    // placeholder will use the `inspectOpts` config.
    // e.g.
    // `debug('msg', obj)` should use same `inspectOpts` as `debug('msg %O', msg)`
    Debug.log = function log(...args) {
        // @ts-expect-error inspectOpts/useColors not in debug types
        if (this.inspectOpts.colors === undefined) {
            // @ts-expect-error inspectOpts/useColors not in debug types
            this.inspectOpts.colors = this.useColors // need this to get colours when no placeholder
        }
        return process.stderr.write(util.formatWithOptions({
            // @ts-expect-error inspectOpts not in debug types
            ...this.inspectOpts,
        }, ...args) + '\n')
    }

    // mutate inspectOpts rather than replace, otherwise changes are lost
    // @ts-expect-error inspectOpts not in debug types
    Object.assign(Debug.inspectOpts, {
        ...DEFAULT_INSPECT_OPTS,
    })
}

// e.g. in browser
if (typeof util.formatWithOptions === 'undefined') {
    util.formatWithOptions = (_opts, ...args) => {
        // just ignore opts
        return util.format(...args)
    }
}

const streamrDebug = Debug('Streamr')

const StreamrDebug = Object.assign(streamrDebug.extend.bind(streamrDebug), {
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
