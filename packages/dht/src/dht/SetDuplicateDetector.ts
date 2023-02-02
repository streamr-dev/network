import { Logger } from "@streamr/utils"
import { Message } from "../exports"

type QueueEntry = [timeStamp: number, value: string, senderId: string, message?: Message]

const logger = new Logger(module)

export class SetDuplicateDetector {

    private values: Set<string> = new Set()
    private queue: Array<QueueEntry> = []
    private maxAge: number
    private maxNumberOfValues: number

    constructor(
        maxNumberOfValues: number,
        maxAgeInSeconds: number
    ) {
        this.maxNumberOfValues = maxNumberOfValues
        this.maxAge = maxAgeInSeconds * 1000
    }

    public add(value: string, senderId: string, message?: Message): void {
        this.values.add(value)
        if (message) {
            this.queue.push([Date.now(), value, senderId, message])
        } else {
            this.queue.push([Date.now(), value, senderId])
        }
        this.cleanUp()
    }

    public isMostLikelyDuplicate(value: string, senderId: string, message?: Message): boolean {
        if (this.values.has(value)) {
            let index = -1
            for (let i = 0; i < this.queue.length; i++) {
                if (this.queue[this.queue.length - 1 - i][1] === value) {
                    index = this.queue.length - 1 - i
                    break
                }
            }

            if (index != -1 && message) {
                const time = this.queue[index][0]
                const prevSender = this.queue[index][2]

                logger.trace('duplicate rawmessage ' + value + ' detected at time: ' +
                    Date.now() + ' from ' + senderId + ' ' + JSON.stringify(message)
                    + ' previous instance: ' + this.queue[index][1] + ' ' + index + ' messages ago, from ' + prevSender + ' at time ' + time + ' ' +
                    JSON.stringify(this.queue[index][3]))

                logger.trace('duplicate ' + value + ' detected at time: ' + Date.now() + ' from ' + senderId + ' ' + JSON.stringify(message.body)
                    + ' previous instance: ' + this.queue[index][1] + ' ' + index + ' messages ago, from ' + prevSender + ' at time ' + time + ' ' +
                    JSON.stringify(this.queue[index][3]))
            } else {
                logger.trace('collision values.has() was true, but value not found in queue')
            }

        }
        return this.values.has(value)
    }

    private cleanUp(): void {
        const currentTime = Date.now()

        while (this.queue.length > 0 && (this.queue.length > this.maxNumberOfValues ||
            (currentTime - this.queue[0][0]) > this.maxAge)) {
            const oldestEntry = this.queue.shift()
            this.values.delete(oldestEntry![1])
        }
    }
}
