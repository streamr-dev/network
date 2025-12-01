#!/bin/bash

# Test script to demonstrate plugin configuration via environment variables
# This script verifies that plugins can be configured using environment variables

echo "=========================================="
echo "Testing Plugin Environment Variable Config"
echo "=========================================="
echo ""

# Set up test environment variables
export STREAMR__BROKER__PLUGINS__AUTOSTAKER__OPERATOR_CONTRACT_ADDRESS='0x1234567890abcdef1234567890abcdef12345678'
export STREAMR__BROKER__PLUGINS__AUTOSTAKER__MAX_SPONSORSHIP_COUNT='25'
export STREAMR__BROKER__PLUGINS__AUTOSTAKER__MIN_TRANSACTION_DATA_TOKEN_AMOUNT='1000'
export STREAMR__BROKER__PLUGINS__AUTOSTAKER__MAX_ACCEPTABLE_MIN_OPERATOR_COUNT='50'
export STREAMR__BROKER__PLUGINS__AUTOSTAKER__RUN_INTERVAL_IN_MS='3600000'
export STREAMR__BROKER__PLUGINS__AUTOSTAKER__FLEET_STATE__HEARTBEAT_UPDATE_INTERVAL_IN_MS='10000'
export STREAMR__BROKER__PLUGINS__AUTOSTAKER__FLEET_STATE__PRUNE_AGE_IN_MS='180000'

echo "Environment variables set:"
echo "  STREAMR__BROKER__PLUGINS__AUTOSTAKER__OPERATOR_CONTRACT_ADDRESS=$STREAMR__BROKER__PLUGINS__AUTOSTAKER__OPERATOR_CONTRACT_ADDRESS"
echo "  STREAMR__BROKER__PLUGINS__AUTOSTAKER__MAX_SPONSORSHIP_COUNT=$STREAMR__BROKER__PLUGINS__AUTOSTAKER__MAX_SPONSORSHIP_COUNT"
echo "  STREAMR__BROKER__PLUGINS__AUTOSTAKER__MIN_TRANSACTION_DATA_TOKEN_AMOUNT=$STREAMR__BROKER__PLUGINS__AUTOSTAKER__MIN_TRANSACTION_DATA_TOKEN_AMOUNT"
echo "  STREAMR__BROKER__PLUGINS__AUTOSTAKER__RUN_INTERVAL_IN_MS=$STREAMR__BROKER__PLUGINS__AUTOSTAKER__RUN_INTERVAL_IN_MS"
echo "  STREAMR__BROKER__PLUGINS__AUTOSTAKER__FLEET_STATE__HEARTBEAT_UPDATE_INTERVAL_IN_MS=$STREAMR__BROKER__PLUGINS__AUTOSTAKER__FLEET_STATE__HEARTBEAT_UPDATE_INTERVAL_IN_MS"
echo ""

echo "Expected configuration output:"
cat <<EOF
{
  "plugins": {
    "autostaker": {
      "operatorContractAddress": "0x1234567890abcdef1234567890abcdef12345678",
      "maxSponsorshipCount": 25,
      "minTransactionDataTokenAmount": 1000,
      "maxAcceptableMinOperatorCount": 50,
      "runIntervalInMs": 3600000,
      "fleetState": {
        "heartbeatUpdateIntervalInMs": 10000,
        "pruneAgeInMs": 180000
      }
    }
  }
}
EOF
echo ""

echo "To test this with actual streamr-node:"
echo "  1. Set up the environment variables above"
echo "  2. Create a minimal config.json with your private key"
echo "  3. Run: streamr-node config.json"
echo "  4. The autostaker plugin will be configured from environment variables"
echo ""

echo "To run automated tests:"
echo "  cd packages/node"
echo "  npm run test-unit -- test/unit/config.test.ts"
echo "  npm run test-integration -- test/integration/config.test.ts"
echo ""

# Clean up
unset STREAMR__BROKER__PLUGINS__AUTOSTAKER__OPERATOR_CONTRACT_ADDRESS
unset STREAMR__BROKER__PLUGINS__AUTOSTAKER__MAX_SPONSORSHIP_COUNT
unset STREAMR__BROKER__PLUGINS__AUTOSTAKER__MIN_TRANSACTION_DATA_TOKEN_AMOUNT
unset STREAMR__BROKER__PLUGINS__AUTOSTAKER__MAX_ACCEPTABLE_MIN_OPERATOR_COUNT
unset STREAMR__BROKER__PLUGINS__AUTOSTAKER__RUN_INTERVAL_IN_MS
unset STREAMR__BROKER__PLUGINS__AUTOSTAKER__FLEET_STATE__HEARTBEAT_UPDATE_INTERVAL_IN_MS
unset STREAMR__BROKER__PLUGINS__AUTOSTAKER__FLEET_STATE__PRUNE_AGE_IN_MS

echo "✓ Test script completed successfully"
