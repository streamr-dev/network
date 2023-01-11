import { Logger } from "@streamr/utils"

export const debugVars: Record<string, any>  = []

export function logInfoIf(logger: Logger, condition: boolean, msg: string): void {
    if (condition) {
        logger.info(msg)
    }
}
