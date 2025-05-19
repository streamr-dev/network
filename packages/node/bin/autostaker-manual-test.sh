# Do not merge this manual test to main

NODE_PRIVATE_KEY="1111111111111111111111111111111111111111111111111111111111111111"
OWNER_PRIVATE_KEY="2222222222222222222222222222222222222222222222222222222222222222"
SPONSORER_PRIVATE_KEY="3333333333333333333333333333333333333333333333333333333333333333"
EARNINGS_PER_SECOND_1=1000
EARNINGS_PER_SECOND_2=2000
DELEGATED_AMOUNT=500000
SPONSOR_AMOUNT=600000

NODE_ADDRESS=$(ethereum-address $NODE_PRIVATE_KEY | jq -r '.address')
OWNER_ADDRESS=$(ethereum-address $OWNER_PRIVATE_KEY | jq -r '.address')
SPONSORER_ADDRESS=$(ethereum-address $SPONSORER_PRIVATE_KEY | jq -r '.address')

cd ../../cli-tools

echo 'Mint tokens'
npx tsx bin/streamr.ts internal token-mint $NODE_ADDRESS 10000000 10000000 --env dev2
npx tsx bin/streamr.ts internal token-mint $OWNER_ADDRESS 10000000 10000000 --env dev2

echo 'Create operator'
OPERATOR_CONTRACT_ADDRESS=$(npx tsx bin/streamr.ts internal operator-create -c 10 --node-addresses $NODE_ADDRESS --env dev2 --private-key $OWNER_PRIVATE_KEY | jq -r '.address') 
npx tsx bin/streamr.ts internal operator-delegate $OPERATOR_CONTRACT_ADDRESS $DELEGATED_AMOUNT --env dev2 --private-key $OWNER_PRIVATE_KEY

echo 'Create sponsorships'
npx tsx bin/streamr.ts internal token-mint $SPONSORER_ADDRESS 10000000 10000000 --env dev2
npx tsx bin/streamr.ts stream create /foo1 --env dev2 --private-key $SPONSORER_PRIVATE_KEY
SPONSORSHIP_CONTRACT_ADDRESS_1=$(npx tsx bin/streamr.ts internal sponsorship-create /foo1 -e $EARNINGS_PER_SECOND_1 --env dev2 --private-key $SPONSORER_PRIVATE_KEY | jq -r '.address') 
npx tsx bin/streamr.ts internal sponsorship-sponsor $SPONSORSHIP_CONTRACT_ADDRESS_1 $SPONSOR_AMOUNT --env dev2 --private-key $SPONSORER_PRIVATE_KEY
npx tsx bin/streamr.ts stream create /foo2 --env dev2 --private-key $SPONSORER_PRIVATE_KEY
SPONSORSHIP_CONTRACT_ADDRESS_2=$(npx tsx bin/streamr.ts internal sponsorship-create /foo2 -e $EARNINGS_PER_SECOND_2 --env dev2 --private-key $SPONSORER_PRIVATE_KEY | jq -r '.address') 
npx tsx bin/streamr.ts internal sponsorship-sponsor $SPONSORSHIP_CONTRACT_ADDRESS_2 $SPONSOR_AMOUNT --env dev2 --private-key $SPONSORER_PRIVATE_KEY

jq -n \
    --arg nodePrivateKey "$NODE_PRIVATE_KEY" \
    --arg operatorOwnerPrivateKey "$OWNER_PRIVATE_KEY" \
    --arg operatorContractAddress "$OPERATOR_CONTRACT_ADDRESS" \
    '{
        "$schema": "https://schema.streamr.network/config-v3.schema.json",
        client: {
            auth: {
                privateKey: $nodePrivateKey
            },
            environment: "dev2"
        },
        plugins: {
            autostaker: {
                operatorOwnerPrivateKey: $operatorOwnerPrivateKey,
                operatorContractAddress: $operatorContractAddress
            }
        }
    }' > ../node/configs/autostaker.json

jq -n \
    --arg operatorContract "$OPERATOR_CONTRACT_ADDRESS" \
    --arg sponsorshipContract1 "$SPONSORSHIP_CONTRACT_ADDRESS_1" \
    --arg sponsorshipContract2 "$SPONSORSHIP_CONTRACT_ADDRESS_2" \
    '$ARGS.named'

cd ../node
npx tsx bin/streamr-node.ts configs/autostaker.json
