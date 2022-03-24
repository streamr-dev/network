<p align="center">
  <a href="https://streamr.network">
    <img alt="Streamr" src="https://raw.githubusercontent.com/streamr-dev/network-monorepo/main/packages/client/readme-header-img.png" width="1320" />
  </a>
</p>

# streamr-network-tracker

[![Build Status](https://img.shields.io/github/workflow/status/streamr-dev/network/Eslint,%20Test%20and%20Publish/master)](https://github.com/streamr-dev/network/actions)
[![npm release](https://img.shields.io/npm/v/streamr-network?style=flat)](https://www.npmjs.com/package/streamr-network)
[![GitHub stars](https://img.shields.io/github/stars/streamr-dev/network.svg?style=flat&label=Star&maxAge=2592000)](https://github.com/streamr-dev/network/)
[![Discord Chat](https://img.shields.io/discord/801574432350928907.svg?label=Discord&logo=Discord&colorB=7289da)](https://discord.gg/FVtAph9cvz)

The repository for running a Tracker for the Streamr Network's Brubeck network.

## Install

### NPM

```bash
npm i -g streamr-network-tracker
```

### Docker

```bash
docker pull streamr/tracker
```

## Development

```bash
git clone https://github.com/streamr-dev/network-monorepo.git
npm ci
cd packages/network-tracker
```

## Testing

```bash
# unit tests
npm run test-unit
# integration tests
npm run test-integration
# run all
npm run test
```

### Network Tests
It is recommended to build and run the tests in the network package when doing changes to the Tracker.

```bash
# In Monorepo Root
npm run build
cd packages/network
npm run test
```