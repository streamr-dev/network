import { EIP1271ContractFacade } from '../../src/contracts/EIP1271ContractFacade'
import { ContractFactory } from '@ethersproject/contracts'
import { mock } from 'jest-mock-extended'
import { StrictStreamrClientConfig } from '../../src'

describe('EIP1271ContractFacade', () => {
    let contractFacade: EIP1271ContractFacade

    beforeEach(() => {
        contractFacade = new EIP1271ContractFacade(
            undefined as any,
            { } as StrictStreamrClientConfig
        )
    })
})
