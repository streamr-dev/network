import { PassThrough, Readable } from 'stream'

export function ConvertBrowserStream(browserStream: ReadableStream | Readable) {
    if ('pipe' in browserStream) {
        return browserStream as Readable
    }

    const reader = browserStream.getReader()
    const stream = new PassThrough()
    // eslint-disable-next-line no-inner-declarations
    async function pull() {
        try {
            // eslint-disable-next-line no-constant-condition
            while (true) {
                // eslint-disable-next-line no-await-in-loop
                const { done, value } = await reader.read()
                if (done) {
                    return
                }

                if (!stream.writable) {
                    return
                }

                stream.write(value)
            }
        } catch (err) {
            stream.destroy(err)
            reader.cancel()
        } finally {
            stream.end()
        }
    }
    pull()
    return stream
}
