import { Logger } from "@streamr/utils"
import { Any } from "../../src/proto/google/protobuf/any"
import { SomeMessage, TestMessage } from "../../src/proto/tests"

const logger = new Logger(module)

const some: SomeMessage = SomeMessage.create({
    juttu: 'kivaa'
})
logger.info(SomeMessage.typeName)

const message: TestMessage = TestMessage.create({
    messageId: 'jee',
    body: Any.pack(some, SomeMessage)
})

const binary = TestMessage.toBinary(message)

const recovered = TestMessage.fromBinary(binary)
const jee = Any.unpack(recovered.body!, SomeMessage)
logger.info(JSON.stringify(jee))

logger.info(TestMessage.toJsonString(recovered, {
    typeRegistry: [
        TestMessage,
        SomeMessage
    ]
}))
