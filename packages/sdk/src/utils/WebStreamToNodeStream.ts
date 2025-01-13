import { PassThrough, Readable, TransformOptions } from 'stream'
import WebStream from 'node:stream/web'
import { once } from 'events'

/**
 * Background async task to pull data from the browser stream and push it into the node stream.
 */
async function pull(webStream: ReadableStream | WebStream.ReadableStream, nodeStream: PassThrough): Promise<void> {
    const reader = webStream.getReader()

    const abortController = new AbortController()

    try {
        while (true) {
            const { value, done } = await reader.read()

            if (done) {
                break
            }

            if (!nodeStream.writable) {
                break
            }

            const canWrite = nodeStream.write(value)

            if (!canWrite) {
                try {
                    await once(nodeStream, 'drain', abortController)
                } catch (e) {
                    if (e.name === 'AbortError') {
                        break
                    }

                    throw e
                }
            }
        }
    } catch (e) {
        nodeStream.destroy(e)

        abortController.abort()
    } finally {
        nodeStream.end()

        try {
            await reader.cancel()
        } catch (_) {
            /**
             * `reader.cancel` can actually throw if called on a response
             * body reader of a "cancelled" fetch. Do nothing.
             */
        }

        reader.releaseLock()
    }
}

/**
 * Convert browser ReadableStream to Node stream.Readable.
 */
export function WebStreamToNodeStream(
    webStream: ReadableStream | Readable | WebStream.ReadableStream,
    nodeStreamOptions?: TransformOptions
): Readable {
    if ('pipe' in webStream) {
        return webStream
    }

    // use PassThrough so we can write to it
    const nodeStream = new PassThrough(nodeStreamOptions)
    pull(webStream, nodeStream)
    return nodeStream
}
