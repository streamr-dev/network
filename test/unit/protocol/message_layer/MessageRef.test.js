import assert from 'assert'
import MessageRef from '../../../../src/protocol/message_layer/MessageRef'

describe('MessageRef', () => {
    describe('comparison of MessageRefs', () => {
        it('should be equal', () => {
            const mr1 = new MessageRef(2018043150, 3)
            const mr2 = new MessageRef(2018043150, 3)
            assert.equal(mr1.compareTo(mr2), 0)
        })
        it('should be less than', () => {
            const mr1 = new MessageRef(2018043150, 7)
            const mr2 = new MessageRef(9998043150, 3)
            assert.equal(mr1.compareTo(mr2), -1)
        })
        it('should be greater than', () => {
            const mr1 = new MessageRef(9998043150, 3)
            const mr2 = new MessageRef(2018043150, 6)
            assert.equal(mr1.compareTo(mr2), 1)
        })
        it('should be less than', () => {
            const mr1 = new MessageRef(2018043150, 4)
            const mr2 = new MessageRef(2018043150, 8)
            assert.equal(mr1.compareTo(mr2), -1)
        })
        it('should be greater than', () => {
            const mr1 = new MessageRef(2018043150, 5)
            const mr2 = new MessageRef(2018043150, 2)
            assert.equal(mr1.compareTo(mr2), 1)
        })
    })
})
