import { IERC677, Sponsorship, SponsorshipFactory } from "@streamr/network-contracts"
import { Logger } from "@streamr/utils"
import { Wallet } from "ethers"
import * as fs from "fs"

// const chainURL = config.rpcEndpoints[0].url
const privKeyStreamRegistry = "0x4059de411f15511a85ce332e7a428f36492ab4e87c7830099dadbf130f1896ae"

// eslint-disable-next-line @typescript-eslint/no-var-requires
const logger = new Logger(module)
const log = logger.debug

let adminWallet: Wallet
let operatorWallet: Wallet
let sponsorshipFactory: SponsorshipFactory
let sponsorshipAddress: string
let sponsorship: Sponsorship
let token: IERC677
let operatorFactory: OperatorFactory
const pools: Operator[] = []
let streamRegistryAddress: string
let streamId: string

const localConfig: any = {}

async function deployStreamRegistry() {
    log("deploying StreamRegistry")
    const streamRegistryFactory = await ethers.getContractFactory("StreamRegistryV4", { signer: adminWallet })
    const streamRegistryFactoryTx = await upgrades.deployProxy(streamRegistryFactory, [
        Wallet.createRandom().address,
        Wallet.createRandom().address
    ], { kind: "uups" })
    const streamRegistry = await streamRegistryFactoryTx.deployed() as StreamRegistryV4
    streamRegistryAddress = streamRegistry.address 
    const streampath = "/test" + Date.now()
    log(`deployed StreamRegistry at ${streamRegistry.address}`)
    log(`creating stream ${streampath}`)
    await ((await streamRegistry.createStream(streampath, "{}")).wait())
    streamId = adminWallet.address.toLowerCase() + streampath
    log(`streamId ${streamId}`)
    const streamExists = await streamRegistry.exists(streamId)
    log(streamExists)
}

async function deploySponsorshipFactory() {
    log((await ethers.getSigners())[0].address)
    const streamrConfigFactory = await ethers.getContractFactory("StreamrConfig", { signer: adminWallet })
    const streamrConfigFactoryTx = await upgrades.deployProxy(streamrConfigFactory, [], { kind: "uups" })
    const streamrConfig = await streamrConfigFactoryTx.deployed() as StreamrConfig
    const hasroleEthSigner = await streamrConfig.hasRole(await streamrConfig.DEFAULT_ADMIN_ROLE(), adminWallet.address)
    log(`hasrole ${hasroleEthSigner}`)
    localConfig.streamrConfig = streamrConfig.address
    log(`streamrConfig address ${streamrConfig.address}`)
    await (await streamrConfig.setStreamRegistryAddress(streamRegistryAddress)).wait()

    token = await (await ethers.getContractFactory("TestToken", { signer: adminWallet })).deploy("Test token", "TEST") as TestToken
    await token.deployed()
    localConfig.token = token.address
    log(`token address ${token.address}`)

    const maxOperatorsJoinPolicy = await (await ethers.getContractFactory("MaxOperatorsJoinPolicy",
        { signer: adminWallet })).deploy() as IJoinPolicy
    await maxOperatorsJoinPolicy.deployed()
    localConfig.maxOperatorsJoinPolicy = maxOperatorsJoinPolicy.address
    log(`maxOperatorsJoinPolicy address ${maxOperatorsJoinPolicy.address}`)

    const allocationPolicy = await (await ethers.getContractFactory("StakeWeightedAllocationPolicy",
        { signer: adminWallet })).deploy() as IAllocationPolicy
    await allocationPolicy.deployed()
    localConfig.allocationPolicy = allocationPolicy.address
    log(`allocationPolicy address ${allocationPolicy.address}`)

    const leavePolicy = await (await ethers.getContractFactory("DefaultLeavePolicy",
        { signer: adminWallet })).deploy() as ILeavePolicy
    await leavePolicy.deployed()
    localConfig.leavePolicy = leavePolicy.address
    log(`leavePolicy address ${leavePolicy.address}`)

    const voteKickPolicy = await (await ethers.getContractFactory("VoteKickPolicy",
        { signer: adminWallet })).deploy() as IKickPolicy
    await voteKickPolicy.deployed()
    localConfig.voteKickPolicy = voteKickPolicy.address
    log(`voteKickPolicy address ${voteKickPolicy.address}`)

    const sponsorshipTemplate = await (await ethers.getContractFactory("Sponsorship")).deploy() as Sponsorship
    await sponsorshipTemplate.deployed()
    localConfig.sponsorshipTemplate = sponsorshipTemplate.address
    log(`sponsorshipTemplate address ${sponsorshipTemplate.address}`)

    const sponsorshipFactoryFactory = await ethers.getContractFactory("SponsorshipFactory", { signer: adminWallet })
    const sponsorshipFactoryFactoryTx = await upgrades.deployProxy(sponsorshipFactoryFactory,
        [ sponsorshipTemplate.address, token.address, streamrConfig.address ], { kind: "uups", unsafeAllow: ["delegatecall"]})
    sponsorshipFactory = await sponsorshipFactoryFactoryTx.deployed() as SponsorshipFactory
    await (await sponsorshipFactory.addTrustedPolicies([maxOperatorsJoinPolicy.address,
        allocationPolicy.address, leavePolicy.address, voteKickPolicy.address])).wait()

    await (await streamrConfig.setSponsorshipFactory(sponsorshipFactory.address)).wait()
    localConfig.sponsorshipFactory = sponsorshipFactory.address
    log(`sponsorshipFactory address ${sponsorshipFactory.address}`)

    await (await token.mint(adminWallet.address, ethers.utils.parseEther("1000000"))).wait()
    log(`minted 1000000 tokens to ${adminWallet.address}`)
    await (await token.mint(operatorWallet.address, ethers.utils.parseEther("100000"))).wait()
    log(`transferred 100000 tokens to ${operatorWallet.address}`)
    await (await adminWallet.sendTransaction({ to: operatorWallet.address, value: ethers.utils.parseEther("1") })).wait()
    log(`transferred 1 ETH to ${operatorWallet.address}`)
}

const deployNewSponsorship = async () => {
    const sponsorshiptx = await sponsorshipFactory.deploySponsorship(ethers.utils.parseEther("60"), 0, 1, streamId, "metadata",
        [
            localConfig.allocationPolicy,
            ethers.constants.AddressZero,
            localConfig.voteKickPolicy,
        ], [
            ethers.utils.parseEther("0.01"),
            "0",
            "0"
        ]
    )
    const sponsorshipReceipt = await sponsorshiptx.wait()
    sponsorshipAddress = sponsorshipReceipt.events?.filter((e) => e.event === "NewSponsorship")[0]?.args?.sponsorshipContract
    sponsorship = await ethers.getContractAt("Sponsorship", sponsorshipAddress, adminWallet) as Sponsorship

    log("new sponsorship address: " + sponsorshipAddress)
}

const sponsorNewSponsorship = async () => {
    // sponsor with token approval
    // const ownerbalance = await token.balanceOf(adminWallet.address)
    await (await token.approve(sponsorshipAddress, ethers.utils.parseEther("7"))).wait()
    // const allowance = await token.allowance(adminWallet.address, sponsorship.address)
    const sponsorTx = await sponsorship.sponsor(ethers.utils.parseEther("7"))
    await sponsorTx.wait()
    log("sponsored through token approval")
}

const stakeOnSponsorship = async () => {
    const tx = await token.transferAndCall(sponsorship.address, ethers.utils.parseEther("100"),
        operatorWallet.address)
    await tx.wait()
    log("staked in sponsorship with transfer and call")
}

async function deployOperatorFactory() {
    const operatorTemplate = await (await ethers.getContractFactory("Operator")).deploy() as Operator
    await operatorTemplate.deployed()
    log("Deployed Operator contract template", operatorTemplate.address)
    const defaultDelegationPolicy = await (await ethers.getContractFactory("DefaultDelegationPolicy",
        { signer: adminWallet })).deploy() as IDelegationPolicy
    await defaultDelegationPolicy.deployed()
    localConfig.defaultDelegationPolicy = defaultDelegationPolicy.address
    log("Deployed default Operator contract delegation policy", defaultDelegationPolicy.address)
    const defaultPoolYieldPolicy = await (await ethers.getContractFactory("DefaultPoolYieldPolicy",
        { signer: adminWallet })).deploy() as IPoolYieldPolicy
    await defaultPoolYieldPolicy.deployed()
    localConfig.defaultPoolYieldPolicy = defaultPoolYieldPolicy.address
    log("Deployed default Operator contract yield policy", defaultPoolYieldPolicy.address)
    const defaultUndelegationPolicy = await (await ethers.getContractFactory("DefaultUndelegationPolicy",
        { signer: adminWallet })).deploy() as IUndelegationPolicy
    await defaultUndelegationPolicy.deployed()
    localConfig.defaultUndelegationPolicy = defaultUndelegationPolicy.address
    log("Deployed default Operator contract undelegation policy", defaultUndelegationPolicy.address)

    const operatorFactoryFactory = await ethers.getContractFactory("OperatorFactory",
        { signer: adminWallet })
    operatorFactory = await upgrades.deployProxy(operatorFactoryFactory, [
        operatorTemplate.address,
        localConfig.token,
        localConfig.streamrConfig
    ], {kind: "uups", unsafeAllow: ["delegatecall"]}) as unknown as OperatorFactory
    // eslint-disable-next-line require-atomic-updates
    // localConfig.operatorFactory = operatorFactory.address
    await operatorFactory.deployed()
    log("Deployed Operator contract factory", operatorFactory.address)
    // eslint-disable-next-line require-atomic-updates
    localConfig.operatorFactory = operatorFactory.address
    await (await operatorFactory.addTrustedPolicies([
        defaultDelegationPolicy.address,
        defaultPoolYieldPolicy.address,
        defaultUndelegationPolicy.address,
    ])).wait()
    log("Added trusted policies")

    const streamrConfigFactory = await ethers.getContractFactory("StreamrConfig", { signer: adminWallet })
    const streamrConfig = await streamrConfigFactory.attach(localConfig.streamrConfig) as StreamrConfig
    await (await streamrConfig.setOperatorFactory(operatorFactory.address)).wait()
    log("Set Operator contract factory in StreamrConfig")
}

const deployOperatorContracts = async (amount: number) => {
    // log("registering stream registry in streamr config")
    // const streamrConfigFactory = await ethers.getContractFactory("StreamrConfig", {signer: adminWallet })
    // const streamrConfigFactoryTx = await streamrConfigFactory.attach(localConfig.streamrConfig)
    // const streamrConfig = await streamrConfigFactoryTx.deployed()
    // await (await streamrConfig.connect(adminWallet).setStreamRegistryAddress(config.contracts.StreamRegistry)).wait()
    
    for (let i = 0; i < amount; i++) {
        log("Deploying pool")
        const pooltx = await operatorFactory.connect(adminWallet).deployOperator(
            [`Pool-${Date.now()}`, "{}"],
            [localConfig.defaultDelegationPolicy, localConfig.defaultPoolYieldPolicy, localConfig.defaultUndelegationPolicy],
            [0, 0, 0, 0, 0, 10]
        )
        const poolReceipt = await pooltx.wait()
        const operatorAddress = poolReceipt.events?.find((e: any) => e.event === "NewOperator")?.args?.operatorContractAddress
        // eslint-disable-next-line require-atomic-updates
        log("Pool deployed at: ", operatorAddress)
        const operator = await ethers.getContractAt("Operator", operatorAddress, adminWallet) as Operator
        pools.push(operator)
    }
}

const investToPool = async () => {
    for (const pool of pools) {
        const tx = await token.connect(adminWallet).transferAndCall(pool.address, ethers.utils.parseEther("1000"),
            adminWallet.address)
        await tx.wait()
        log("Invested to pool ", pool.address)
    }
}

const stakeIntoSponsorship = async () => {
    for (const pool of pools) {
        const tx = await pool.connect(adminWallet).stake(sponsorshipAddress, ethers.utils.parseEther("1000"))
        await tx.wait()
        log("Staked into sponsorship from pool ", pool.address)
    }
}

async function main() {
    adminWallet = (await ethers.getSigners())[0] as unknown as Wallet

    operatorWallet = ethers.Wallet.createRandom()
    log(`wallet address ${adminWallet.address}`)

    await deployStreamRegistry()
    await deploySponsorshipFactory()
    await deployNewSponsorship()
    await sponsorNewSponsorship()
    await stakeOnSponsorship()
    await deployOperatorFactory()
    await deployOperatorContracts(1)
    await investToPool()
    await stakeIntoSponsorship()

    localConfig.adminKey = privKeyStreamRegistry
    const configString = JSON.stringify(localConfig, null, 4)
    fs.writeFileSync("localConfig.json", configString)
    log("wrote localConfig.json")
}

