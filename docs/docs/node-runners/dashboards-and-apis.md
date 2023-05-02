---
sidebar_position: 3
---

# Dashboards and APIs
Earned rewards will be automatically sent to the node’s address and therefore compounded (up to the 20 000 DATA cap). The estimated reward distribution date is the first business day of each month.

There is an API as well as a community-built [BrubeckScan dashboard](https://brubeckscan.app/) for checking earnings and other mining and staking statistics.

In order to see the rewards a Broker node has accumulated, the following API endpoints are available:

### Accumulated rewards for a node address
Endpoint: https://brubeck1.streamr.network:3013/datarewards/:nodeAddress

```
Example response:
{
    "DATA": 2.1341
}
```

### Claimed rewards for a node address
Endpoint: https://brubeck1.streamr.network:3013/stats/:nodeAddress

```
Example response:
{
    "claimCount": 177,
    "claimPercentage": 0.9888268156424581,
    "claimedRewardCodes": [
        {
            "claimTime": "2022-02-11T13:52:31.958Z",
            "id": "3c03ac2d-eca1-44f9-b376-66c0fda233c2"
        },
        {
            "claimTime": "2022-02-11T14:13:52.179Z",
            "id": "353531a9-e283-45a8-b840-e983b7a2d002"
        }, …
    ]
}
```

### Annual percentage yield, annual percentage rate and amount of DATA staked
Endpoint: https://brubeck1.streamr.network:3013/apy

Spot is the value calculated from the last reward code, and the 24h value is a sliding average from the reward codes published in the last 24 hours.

Example response:

```
{
    "24h-APR": 20.29,
    "24h-APY": 23.35,
    "24h-data-staked": 12469942.4,
    "spot-APR": 15.69,
    "spot-APY": 20.36,
    "spot-data-staked": 113080139
}
```