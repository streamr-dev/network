import { StreamrClient, StreamrClientOptions } from 'streamr-client'

export const resend = async (streamId: string, resendOpts: any, streamrOptions: StreamrClientOptions & { subscribe?: boolean }) => {
    const options = { ...streamrOptions }
    const client = new StreamrClient(options)

    let sub
    try {
        const subscribeOpts = {
            stream: streamId,
            resend: resendOpts
        }
        const handler = (message: any) => {
            console.info(JSON.stringify(message))
        }

        if (options.subscribe) {
            sub = await client.subscribe(subscribeOpts, handler)
        } else {
            sub = await client.resend(subscribeOpts, handler)
        }
    } catch (err) {
        console.error(err.message ? err.message : err)
        process.exit(1)
    }

    sub.on('error', (err: any) => {
        console.error(err)
        process.exit(1)
    })

    sub.on('resent', () => {
        if (!options.subscribe) {
            process.exit(0)
        }
    })

    sub.on('no_resend', () => {
        if (!options.subscribe) {
            process.exit(0)
        }
    })
}
