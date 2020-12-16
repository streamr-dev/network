declare module 'streamr-client-protocol' {
    module TrackerLayer {
        export interface Originator {
            peerId: string
            peerType: string
        }

        class TrackerMessage {
            public readonly type: number

            static TYPES: { [key: string]: number }

            static deserialize: (msg: string | string[], ...args: any) => TrackerMessage

            serialize(version?: number, ...args: any): string
        }

        class InstructionMessage extends TrackerMessage {
            requestId: string
            streamId: string
            streamPartition: number
            nodeIds: string[]
            counter: number

            constructor(args: {
                requestId: string
                streamId: string
                streamPartition: number
                nodeIds: string[]
                counter: number
            })
        }

        class StorageNodesResponse extends TrackerMessage {
            requestId: string
            streamId: string
            streamPartition: number
            nodeIds: string[]

            constructor(args: {
                requestId: string
                streamId: string
                streamPartition: number
                nodeIds: string[]
            })
        }

        class RelayMessage extends TrackerMessage {
            requestId: string
            originator: TrackerLayer.Originator
            targetNode: string
            subType: string
            data: Object

            constructor(args: {
                requestId: string
                originator: TrackerLayer.Originator
                targetNode: string
                subType: string
                data: Object
            })
        }

        class ErrorMessage extends TrackerMessage {
            static ERROR_CODES: { [key: string]: string }

            requestId: string
            errorCode: string
            targetNode: string

            constructor(args: {
                requestId: string
                errorCode: string
                targetNode: string
            })
        }

        class StatusMessage extends TrackerMessage {
            requestId: string
            status: Object

            constructor(args: {
                requestId: string
                status: Object
            })
        }

        class StorageNodesRequest extends TrackerMessage {
            requestId: string
            streamId: string
            streamPartition: number

            constructor(args: {
                requestId: string
                streamId: string
                streamPartition: number
            })
        }
    }

    module ControlLayer {
        class ControlMessage {
            public readonly type: number
            public readonly requestId: string

            static TYPES: {
                BroadcastMessage: 0,
                UnicastMessage: 1,
                SubscribeResponse: 2,
                UnsubscribeResponse: 3,
                ResendResponseResending: 4,
                ResendResponseResent: 5,
                ResendResponseNoResend: 6,
                ErrorResponse: 7,
                PublishRequest: 8,
                SubscribeRequest: 9,
                UnsubscribeRequest: 10,
                ResendLastRequest: 11,
                ResendFromRequest: 12,
                ResendRangeRequest: 13
            }

            static deserialize: (msg: string | string[], ...args: any) => ControlMessage

            serialize(version?: number, ...args: any): string
        }

        class BroadcastMessage extends ControlMessage {
            requestId: string
            streamMessage: MessageLayer.StreamMessage

            constructor(args: {
                requestId: string
                streamMessage: MessageLayer.StreamMessage
            })
        }

        class UnicastMessage extends ControlMessage {
            requestId: string
            streamMessage: MessageLayer.StreamMessage

            constructor(args: {
                requestId: string
                streamMessage: MessageLayer.StreamMessage
            })
        }

        class ResendResponseResending extends ControlMessage {
            requestId: string
            streamId: string
            streamPartition: number

            constructor(args: {
                requestId: string
                streamId: string
                streamPartition: number
            })
        }

        class ResendResponseResent extends ControlMessage {
            requestId: string
            streamId: string
            streamPartition: number

            constructor(args: {
                requestId: string
                streamId: string
                streamPartition: number
            })
        }

        class ResendResponseNoResend extends ControlMessage {
            requestId: string
            streamId: string
            streamPartition: number

            constructor(args: {
                requestId: string
                streamId: string
                streamPartition: number
            })
        }

        class ResendLastRequest extends ControlMessage {
            type: 11
            requestId: string
            streamId: string
            streamPartition: number
            numberLast: number

            constructor(args: {
                requestId: string
                streamId: string
                streamPartition: number
                numberLast: number
            })
        }

        class ResendFromRequest extends ControlMessage {
            type: 12
            requestId: string
            streamId: string
            streamPartition: number
            fromMsgRef: MessageLayer.MessageRef
            publisherId: string | null
            msgChainId: string | null

            constructor(args: {
                requestId: string
                streamId: string
                streamPartition: number
                fromMsgRef: MessageLayer.MessageRef
                publisherId: string | null
                msgChainId: string | null
            })
        }

        class ResendRangeRequest extends ControlMessage {
            type: 13
            requestId: string
            streamId: string
            streamPartition: number
            fromMsgRef: MessageLayer.MessageRef
            toMsgRef: MessageLayer.MessageRef
            publisherId: string | null
            msgChainId: string | null

            constructor(args: {
                requestId: string
                streamId: string
                streamPartition: number
                fromMsgRef: MessageLayer.MessageRef
                toMsgRef: MessageLayer.MessageRef
                publisherId: string | null
                msgChainId: string | null
            })
        }
    }

    module MessageLayer {
        class StreamMessage {
            messageId: MessageID
            prevMsgRef: MessageRef | null

            constructor(args : {
                messageId: MessageID
                prevMsgRef: MessageRef | null
                content: Object
            })

            getStreamId(): string
            getStreamPartition(): number
        }

        class MessageID {
            streamId: string
            streamPartition: number
            timestamp: number
            sequenceNumber: number
            publisherId: string
            msgChainId: string

            constructor(streamId: string, streamPartition: number, timestamp: number, sequenceNumber: number,
                        publisherId: string, msgChainId: string)
        }


        class MessageRef {
            timestamp: number
            sequenceNumber: number

            constructor(timestamp: number, sequenceNumber: number)
        }
    }

    module Utils {
        function createTrackerRegistry<R>(servers: R[]): TrackerRegistry<R>

        class TrackerRegistry<R> {
            getTracker(streamId: string, partition: number): R
            getAllTrackers(): ReadonlyArray<R>
        }
    }
}
