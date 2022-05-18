import { ErrorResponse } from 'streamr-client-protocol'
import { Event, NodeToNode } from './NodeToNode'
import { FifoMapWithTtl } from '../logic/propagation/FifoMapWithTtl'
import { NodeId } from '../identifiers'

export type ErrorHandlerFn = (errorResponse: ErrorResponse, source: NodeId) => void

export class ErrorResponseHandler {
    private readonly registeredHandlers = new FifoMapWithTtl<string, ErrorHandlerFn>({
        ttlInMs: 5 * 60 * 1000,
        maxSize: 1000
    })

    constructor(nodeToNode: NodeToNode) {
        nodeToNode.on(Event.ERROR_RESPONSE_RECEIVED, (errorResponse, source) => {
            const errorHandler = this.registeredHandlers.get(errorResponse.requestId)
            if (errorHandler !== undefined) {
                errorHandler(errorResponse, source)
                this.registeredHandlers.delete(errorResponse.requestId)
            }
        })
    }

    register(requestId: string, errorHandler: ErrorHandlerFn): void {
        this.registeredHandlers.set(requestId, errorHandler)
    }
}
