import { IMessageType } from '@protobuf-ts/runtime'

import { protoClasses } from './protoClasses'
import { protoClasses as rpcProtoClasses } from '@streamr/proto-rpc'

const typeRegistry = protoClasses.concat(rpcProtoClasses)

export function protoToString<T extends object, ClassType extends IMessageType<T>>(
    protoObj: T,
    objectType: ClassType
): string {
    let ret = ''
    try {
        ret = objectType.toJsonString(protoObj, {
            typeRegistry
        })
    } catch (_e) {
        ret = '[type not in type registry]'
    }

    return ret
}
