import { Writable } from 'stream'
import { StreamrClient, StreamrClientOptions } from 'streamr-client'

export const publishStream = (
    stream: string,
    partitionKey: string | undefined,
    streamrOptions: StreamrClientOptions
): Writable => {
    const options = { ...streamrOptions }

    const client = new StreamrClient(options)
    const writable = new Writable({
        objectMode: true,
        write: (data: any, _: any, done: any) => {
            let json = null
            // ignore newlines, etc
            if (!data || String(data).trim() === '') {
                done()
                return
            }

            try {
                json = JSON.parse(data)
            } catch (e) {
                console.error(data.toString())
                done(e)
                return
            }

            // @ts-expect-error TODO: the last argument here looks wrong, should be just `partitionKey`?
            client.publish(stream, json, Date.now(), json[partitionKey]).then(
                () => done(),
                (err) => done(err)
            )
        }
    })

    client.on('error', (err) => writable.emit('error', err))
    // disconnect client when upstream pipe ends and data flushed
    writable.once('finish', () => client.ensureDisconnected())
    return writable
}
