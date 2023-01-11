import { IMessageType } from "@protobuf-ts/runtime"

import { protoClasses } from "./protoClasses"
import { protoClasses as rpcProtoClasses } from "@streamr/proto-rpc"

const typeRegistry = protoClasses.concat(rpcProtoClasses)

export function protoToString<T extends object, ClassType extends IMessageType<T>>(protoObj: T,
    objectType: ClassType): string {

    let ret = ""
    try {
        ret = objectType.toJsonString(protoObj, {
            typeRegistry
        })
    } catch (_e) {
        ret = '[type not in type registry]'
    }

    return ret
    /*
    const findResult = protoClasses.find((entry) => {
        if (protoObj.typeName === entry.typeName) {
            return true
        } else {
            return false
        }
    })

    if (findResult) {
        return findResult.toJsonString(protoObj, {
            typeRegistry: protoClasses
        })
    }

    return 'ERROR: protobuf type not fund in type registry of protoToString()'
    */
}
