export class FakeRpcCommunicator {
    private readonly listeners: Map<string, (...args: any[]) => Promise<unknown>> = new Map()

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    registerRpcMethod(_requestClass: any, _returnClass: any, methodName: string, callback: (...args: any[]) => Promise<unknown>): void {
        this.listeners.set(methodName, callback)
    }

    async callRpcMethod(methodName: string, ...args: any[]): Promise<unknown> {
        const listener = this.listeners.get(methodName)
        if (listener !== undefined) {
            return listener(...args)
        } else {
            throw new Error(`no registered callbacks for ${methodName}`)
        }
    }

    // eslint-disable-next-line class-methods-use-this
    getRpcClientTransport(): any {
        return {}
    }
}
