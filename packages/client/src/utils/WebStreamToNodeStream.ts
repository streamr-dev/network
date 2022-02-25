import { PassThrough, Readable, TransformOptions } from 'stream'
import { once } from 'events'

const ignoreAbort = (err: Error) => {
    if (err.name === 'AbortError') {
        // ignore AbortError
        return
    }

    throw err
}

/**
 * Write to stream.
 * Block until drained or aborted
 */
async function write(stream: PassThrough, data: any, ac: AbortController) {
    if (stream.write(data)) { return }
    await once(stream, 'drain', ac)
}

/**
 * Background async task to pull data from the browser stream and push it into the node stream.
 */
async function pull(fromBrowserStream: ReadableStream, toNodeStream: PassThrough) {
    const reader = fromBrowserStream.getReader()
    /* eslint-disable no-constant-condition, no-await-in-loop */
    const ac = new AbortController()
    const cleanup = () => {
        ac.abort()
    }
    reader.closed.finally(() => { // eslint-disable-line promise/catch-or-return
        toNodeStream.off('close', cleanup)
    })
    // toNodeStream.once('error', cleanup)

    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) {
                return
            }

            if (!toNodeStream.writable) {
                return
            }
            await write(toNodeStream, value, ac)
        }
    } catch (err) {
        toNodeStream.destroy(err)
        reader.cancel()
        ac.abort()
    } finally {
        reader.cancel()
        toNodeStream.end()
    }
    /* eslint-enable no-constant-condition, no-await-in-loop */
}

/**
 * Convert browser ReadableStream to Node stream.Readable.
 */
export function WebStreamToNodeStream(webStream: ReadableStream | Readable, nodeStreamOptions?: TransformOptions): Readable {
    if ('pipe' in webStream) {
        return webStream as Readable
    }

    // use PassThrough so we can write to it
    const nodeStream = new PassThrough(nodeStreamOptions)
    pull(webStream, nodeStream).catch(ignoreAbort)
    return nodeStream
}
