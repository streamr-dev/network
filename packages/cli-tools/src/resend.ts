import { StreamrClient, StreamrClientOptions, ResendOptions } from 'streamr-client'

export const resend = async (
    streamId: string,
    resendOpts: ResendOptions,
    streamrOptions: StreamrClientOptions & { subscribe?: boolean }
): Promise<void> => {
    const options = { ...streamrOptions }
    const client = new StreamrClient(options)

    try {
        const subscribeOpts = {
            stream: streamId,
            resend: resendOpts
        }
        const handler = (message: any) => {
            console.info(JSON.stringify(message))
        }

        if (options.subscribe) {
            await client.subscribe(subscribeOpts, handler)
        } else {
            await client.resend(subscribeOpts, handler)
        }
    } catch (err) {
        console.error(err.message ? err.message : err)
        process.exit(1)
    }
}
