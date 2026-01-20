import { StreamrClient, ResendOptions } from '@streamr/sdk'

export const assertBothOrNoneDefined = <T extends object>(
    option1: keyof T,
    option2: keyof T,
    errorMessage: string,
    commandOptions: T
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
        if (subscribe) {
            const handler = (message: any) => {
                console.info(JSON.stringify(message))
            }
            await client.subscribe({
                stream: streamId,
                resend: resendOpts
            }, handler)
        } else {
            const messageStream = await client.resend(streamId, resendOpts)
            for await (const message of messageStream) {
                console.info(JSON.stringify(message.content))
            }
        }
    } catch (err) {
        console.error(err.message ?? err)
        process.exit(1)
    }
}
