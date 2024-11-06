import { ExperimentNodeWrapper } from "./ExperimentNodeWrapper"

const controllerUrl = process.argv[2]
const publicIp = process.argv[3]
const id = process.argv[4]

if (controllerUrl === undefined) {
    throw new Error('controller url must be provided')
}

const main = async () => {
    const node = new ExperimentNodeWrapper(controllerUrl, publicIp, id)
    await node.connect()
}

main()