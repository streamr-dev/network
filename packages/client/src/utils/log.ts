/**
 * Exposes customised Debug and inspect functions.
 */
import util from 'util'
import Debug from 'debug'

// add global support for pretty millisecond formatting with %n
Debug.formatters.n = (v: any) => {
    if (v == null || Number.isNaN(v)) { return String(v) }
    return Debug.humanize(v)
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

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function formatWithOptions(msgFormat?: any, ...param: any[]): string {
    if (typeof util.formatWithOptions !== 'function') {
        // util.formatWithOptions is not browserified, use util.format instead
        return util.format(msgFormat, ...param)
    }

    return util.formatWithOptions({
        maxStringLength: 256,
    }, msgFormat, ...param)
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function format(msgFormat?: any, ...param: any[]): string {
    return formatWithOptions(msgFormat, ...param)
}
