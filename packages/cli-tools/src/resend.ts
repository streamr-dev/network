import { StreamrClient, ResendOptions } from 'streamr-client'

export const resend = async (
    streamId: string,
    resendOpts: ResendOptions,
    client: StreamrClient,
    subscribe: boolean
): Promise<void> => {
    try {
        const subscribeOpts = {
            stream: streamId,
            resend: resendOpts
        }
        const handler = (message: any) => {
            console.info(JSON.stringify(message))
        }

        if (subscribe) {
            await client.subscribe(subscribeOpts, handler)
        } else {
            await client.resend(subscribeOpts, handler)
        }
    } catch (err) {
        console.error(err.message ? err.message : err)
        process.exit(1)
    }
}
