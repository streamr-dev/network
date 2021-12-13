import { StreamrClient, ResendOptions } from 'streamr-client'

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const assertBothOrNoneDefined = (option1: string, option2: string, errorMessage: string, commandOptions: any): void | never => {
    if ((option1 in commandOptions && !(option2 in commandOptions)) || (option2 in commandOptions && !(option1 in commandOptions))) {
        console.error(`option ${errorMessage}`)
        process.exit(1)
    }
}

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