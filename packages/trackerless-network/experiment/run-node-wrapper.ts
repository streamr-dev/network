import { ExperimentNodeWrapper } from "./ExperimentNodeWrapper"

const main = async () => {
    const node = new ExperimentNodeWrapper()
    await node.connect()
}

main()