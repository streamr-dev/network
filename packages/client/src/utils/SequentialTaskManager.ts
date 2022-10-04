import { without } from 'lodash'
import { Gate } from './Gate'

export class SequentialTaskManager {

    private pendingTasks: Gate[] = []

    async execute<T>(fn: (previousGate: Gate | undefined) => Promise<T>): Promise<T> {
        const { currentTask: currentGate, previousTask: previousGate } = this.start()
        try {
            return await fn(previousGate)
        } finally {
            this.stop(currentGate)
        }
    }

    start(): { currentTask: Gate, previousTask: Gate | undefined } {
        const previousTask = this.pendingTasks.length > 0 
            ? this.pendingTasks[this.pendingTasks.length - 1] 
            : undefined
        const currentTask = new Gate()
        currentTask.close()
        this.pendingTasks.push(currentTask)
        return { currentTask, previousTask }
    }

    stop(gate: Gate) {
        this.pendingTasks = without(this.pendingTasks, gate)
        gate.open()
    }
}
