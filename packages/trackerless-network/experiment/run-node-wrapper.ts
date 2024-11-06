import { ExperimentNodeWrapper } from "./ExperimentNodeWrapper"

const controllerUrl = process.argv[2]
if (controllerUrl !== undefined) {
    throw new Error('controller url must be provided')
}

const main = async () => {
    const node = new ExperimentNodeWrapper(controllerUrl)
    await node.connect()
}

main()