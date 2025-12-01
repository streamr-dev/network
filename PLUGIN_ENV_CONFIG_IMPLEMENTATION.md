# Plugin Configuration via Environment Variables - Implementation Summary

## Overview

This implementation adds support for configuring Streamr Node plugins via environment variables, following the same pattern as the existing core node configuration. This feature was requested to support deployments on cloud platforms like FluxCloud where environment variable configuration is preferred.

## What Was Changed

### 1. Documentation Updates

#### configuration.md
Added a new section "Configuring plugins via environment variables" with:
- Explanation of the environment variable naming pattern for plugins
- Complete example for configuring the autostaker plugin
- Examples of nested configuration objects
- Clear mapping between environment variables and JSON configuration

#### plugins.md
Added a new "Configuration" section at the beginning with:
- Overview of environment variable configuration for plugins
- Practical examples using the autostaker plugin
- Reference to configuration.md for detailed information

### 2. Test Coverage

#### Unit Tests (test/unit/config.test.ts)
Added three new test cases:
- `plugins configuration` - Tests basic plugin configuration via environment variables
- `plugins configuration with nested objects` - Tests nested object configuration (e.g., fleetState)
- `plugins configuration overrides existing values` - Tests that env vars override config file values

#### Integration Tests (test/integration/config.test.ts)
Added:
- `configure plugin via environment variables` - Full end-to-end test that:
  - Sets autostaker plugin environment variables
  - Applies them to a config object
  - Verifies the values are correctly parsed
  - Creates and starts a broker with the configuration

### 3. Example Configuration Files

#### configs/autostaker-example.json
A complete example configuration file showing:
- All autostaker plugin settings
- Nested fleetState configuration
- Operator plugin configuration (recommended alongside autostaker)

#### configs/autostaker-example.env.example
A template environment variable file showing:
- How to set all autostaker configuration via environment variables
- Comments explaining each setting
- Instructions for usage

## How It Works

The implementation leverages the existing `overrideConfigToEnvVarsIfGiven()` function in `src/config/config.ts`, which:

1. Scans all environment variables starting with `STREAMR__BROKER__`
2. Converts CONSTANT_CASE to camelCase (e.g., `OPERATOR_CONTRACT_ADDRESS` → `operatorContractAddress`)
3. Parses nested paths separated by double underscores (`__`)
4. Uses lodash's `set()` function to apply values to the config object
5. Automatically handles type conversion (numbers, booleans, null)

Since plugins are part of the config structure under `config.plugins`, the existing implementation already supports plugin configuration without code changes!

## Usage Examples

### Basic Autostaker Configuration

```bash
export STREAMR__BROKER__PLUGINS__AUTOSTAKER__OPERATOR_CONTRACT_ADDRESS='0x1234567890abcdef1234567890abcdef12345678'
export STREAMR__BROKER__PLUGINS__AUTOSTAKER__MAX_SPONSORSHIP_COUNT='25'
export STREAMR__BROKER__PLUGINS__AUTOSTAKER__RUN_INTERVAL_IN_MS='3600000'

streamr-node
```

### Nested Configuration

```bash
export STREAMR__BROKER__PLUGINS__AUTOSTAKER__FLEET_STATE__HEARTBEAT_UPDATE_INTERVAL_IN_MS='10000'
export STREAMR__BROKER__PLUGINS__AUTOSTAKER__FLEET_STATE__PRUNE_AGE_IN_MS='180000'

streamr-node
```

### Mixed Configuration (File + Environment Variables)

You can use a minimal config file and override/add plugin settings via environment variables:

```json
// minimal-config.json
{
    "client": {
        "auth": {
            "privateKey": "0x..."
        }
    }
}
```

```bash
export STREAMR__BROKER__PLUGINS__AUTOSTAKER__OPERATOR_CONTRACT_ADDRESS='0x...'
streamr-node minimal-config.json
```

Environment variables take precedence over config file values.

## Environment Variable Naming Convention

Pattern: `STREAMR__BROKER__PLUGINS__<PLUGIN_NAME>__<PROPERTY_NAME>`

Rules:
- All uppercase with underscores (CONSTANT_CASE)
- Double underscore (`__`) separates each level of nesting
- Automatically converted to camelCase
- Plugin names in CONSTANT_CASE (e.g., `AUTOSTAKER`, `MQTT`, `WEBSOCKET`)

Examples:
- `STREAMR__BROKER__PLUGINS__AUTOSTAKER__OPERATOR_CONTRACT_ADDRESS`
- `STREAMR__BROKER__PLUGINS__MQTT__PORT`
- `STREAMR__BROKER__PLUGINS__WEBSOCKET__PAYLOAD_METADATA`

## Benefits

1. **Cloud-Native Deployments**: Easily configure plugins in containerized environments
2. **Security**: Avoid storing sensitive values in config files
3. **Flexibility**: Mix and match config file and environment variables
4. **Consistency**: Same pattern as core node configuration
5. **No Code Changes Required**: Leverages existing infrastructure

## Testing

To verify the implementation:

```bash
# Run unit tests
cd packages/node
npm run test-unit -- test/unit/config.test.ts

# Run integration tests
npm run test-integration -- test/integration/config.test.ts
```

## Related Files

- `/packages/node/configuration.md` - User documentation for environment variable configuration
- `/packages/node/plugins.md` - Plugin-specific documentation
- `/packages/node/src/config/config.ts` - Core implementation of env var parsing
- `/packages/node/test/unit/config.test.ts` - Unit tests
- `/packages/node/test/integration/config.test.ts` - Integration tests
- `/packages/node/configs/autostaker-example.json` - Example JSON config
- `/packages/node/configs/autostaker-example.env.example` - Example env var config

## Issue Resolution

This implementation resolves Linear issue **NET-1629**: "Support configuring plugin settings via environment variables"

The autostaker plugin (and all other plugins) can now be fully configured via environment variables, enabling easier deployment on platforms like FluxCloud.
