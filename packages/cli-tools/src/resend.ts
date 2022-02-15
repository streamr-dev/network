import { StreamrClient, ResendOptions } from 'streamr-client'

export const assertBothOrNoneDefined = (
    option1: string,
    option2: string,
    errorMessage: string,
    commandOptions: Record<string, unknown>
): void | never => { 
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
        const handler = (message: any) => {
            console.info(JSON.stringify(message))
        }
        if (subscribe) {
            await client.subscribe({
                stream: streamId,
                resend: resendOpts
            }, handler)
        } else {
            await client.resend(streamId, resendOpts, handler)
        }
    } catch (err) {
        console.error(err.message ? err.message : err)
        process.exit(1)
    }
}