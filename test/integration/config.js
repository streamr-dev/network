module.exports = {
    clientOptions: {
        // ganache 1: 0x4178baBE9E5148c6D5fd431cD72884B07Ad855a0
        auth: {
            privateKey: process.env.ETHEREUM_PRIVATE_KEY || '0xe5af7834455b7239881b85be89d905d6881dcb4751063897f12be1b0dd546bdb',
        },
        url: process.env.WEBSOCKET_URL || 'ws://localhost/api/v1/ws',
        restUrl: process.env.REST_URL || 'http://localhost/api/v1',
        streamrNodeAddress: '0xFCAd0B19bB29D4674531d6f115237E16AfCE377c',
        tokenAddress: process.env.TOKEN_ADDRESS || '0xbAA81A0179015bE47Ad439566374F2Bae098686F',
        tokenSidechainAddress: process.env.TOKEN_ADDRESS_SIDECHAIN || '0x73Be21733CC5D08e1a14Ea9a399fb27DB3BEf8fF',
        dataUnion: {
            factoryMainnetAddress: process.env.DU_FACTORY_MAINNET || '0x4bbcBeFBEC587f6C4AF9AF9B48847caEa1Fe81dA',
            factorySidechainAddress: process.env.DU_FACTORY_SIDECHAIN || '0x4A4c4759eb3b7ABee079f832850cD3D0dC48D927',
            templateMainnetAddress: process.env.DU_TEMPLATE_MAINNET || '0x7bFBAe10AE5b5eF45e2aC396E0E605F6658eF3Bc',
            templateSidechainAddress: process.env.DU_TEMPLATE_SIDECHAIN || '0x36afc8c9283CC866b8EB6a61C6e6862a83cd6ee8',
        },
        sidechain: {
            url: process.env.SIDECHAIN_URL || 'http://10.200.10.1:8546',
            timeout: process.env.TEST_TIMEOUT,
        },
        mainnet: {
            url: process.env.ETHEREUM_SERVER_URL || 'http://10.200.10.1:8545',
            timeout: process.env.TEST_TIMEOUT,
        },
        autoConnect: false,
        autoDisconnect: false,
    },
    tokenAdminPrivateKey: '0x5e98cce00cff5dea6b454889f359a4ec06b9fa6b88e9d69b86de8e1c81887da0',
}
