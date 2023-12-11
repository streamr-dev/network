---
sidebar_position: 4
---

# How to run a Streamr node

:::info
These instructions are for running a Streamr node in the "1.0" Network and testnets. If you're looking for instructions on running a Streamr node in the Brubeck network, [go here](../streamr-network/brubeck-network/run-a-node.md).

For those looking to earn either from an incentivized testnet or in general- Running a node is part of becoming an earning Operator. If that's new to you, then goto [becoming an Operator](../streamr-network/network-roles/operators.md)
:::

## Docker or npm installation
You have two methods to choose from: Docker and npm. Docker is the most straightforward and recommended method unless you are well-acquainted with npm.

Once you have either Docker or Node.js installed, the steps to download and start the node are very similar, regardless of whether you’re running Linux, macOS, or Windows (use PowerShell). You may need to adapt the commands for your platform or install OS-specific dependencies if they are missing.

## The configuration wizard
As part of both approaches, we show how to run the configuration wizard to initialize your node’s config file, which will be saved on your disk. The wizard will let you either generate or import an Ethereum private key for your node. It will also allow you to enable additional plugins, but they are entirely unnecessary if you simply want to run a node to help expand the network and [become an Operator](../streamr-network/network-roles/operators.md).

## The Docker approach
If you are using Windows/PowerShell or macOS and don’t have Docker installed, get Docker Desktop [here](https://docs.docker.com/get-docker/).

**Linux**

Note that Ubuntu is the recommended Linux distribution, but the commands should work as-is on most Debian derivatives.

If you are not sure if you have Docker installed, run the following command:

```
docker -v
```

If that returns a Docker version, you are good to go. If, however, the response is something along the lines of `"The command 'docker' could not be found"`, go ahead and install Docker with the following commands.

First check if you have `curl` installed:

```
curl --version
```

If you get a response saying "command not found", install `curl`:

```
sudo apt update ; sudo apt install curl
```

Download the Docker install script:

```
curl -fsSL https://get.docker.com -o get-docker.sh
```

Run the install script:

```
sudo sh get-docker.sh
```

Docker's install script also installs all required dependencies.

When you have Docker installed, you can download, configure, and start the Streamr node.

### Step 1: Create a folder for your node

You need a folder for your node where the node's config file will be stored. Create the folder with the following command:

```
mkdir ~/.streamrDocker
```

### Step 2: Set permissions

Change the permissions on the node's folder:

```
sudo chmod -R 777 ~/.streamrDocker/
```

### Step 3a: Run the config wizard to create and configure your Streamr node

Start the config wizard with the below command. Docker will download the node image unless you have it already.

**Linux / macOS**

```
sudo docker run -it -v $(cd ~/.streamrDocker && pwd):/home/streamr/.streamr streamr/broker-node:v100.0.0-testnet-one.4 bin/config-wizard
```

**Windows PowerShell**

Change the working directory (move into your node's folder):

```
cd ~/.streamrDocker
```

Then run the config wizard:

```
docker run -it -v ${pwd}:/home/streamr/.streamr streamr/broker-node:v100.0.0-testnet-one.4 bin/config-wizard
```

**Using the config wizard**

_"Generate or import Ethereum private key"_

You can generate a new private key or use one you already have.

_"Plugins to enable"_

Press 'enter' (do not select/enable any additional plugins).

_"Path to store the configuration"_

Press 'enter' to use the default path.

:::caution
The path to the config file in the `docker run` command and the path defined via the config wizard differs and tend to cause some confusion. They are different for a reason. The path in the `docker run` command (`/home/streamr/.streamr`) refers to the path _inside_ the Docker container, whereas the path you define via the config wizard refers to the path _outside_ the Docker container. Hence, you need to use the default path as mentioned above.
:::

### Step 3b: Update the node config file
Replace the node config file (typically located at `~/.streamrDocker/config/default.json`) contents with the [testnet config](./become-an-operator.md#testnet-node-config) using a text editor. If you previously generated a node signing key then you can keep using that `privateKey` but the file schema must match what's in the provided [testnet config](./become-an-operator.md#testnet-node-config).

If you intend to test your Operator in the Mumbai environment, then the above advice applies, but use instead the [Mumbai testnet config](./become-an-operator.md#mumbai-node-config).

If you're running a node to become an Operator, then you could now jump back to [Step 3 of becoming an Operator](./become-an-operator.md#step-3-pair-your-node-with-your-operator-contract) to add your Operator contract address into the node config before starting your node.

### Step 4: Start your Streamr node using Docker

**Linux / macOS**

```
sudo docker run -p 32200:32200 --name streamr --restart unless-stopped -d -v $(cd ~/.streamrDocker && pwd):/home/streamr/.streamr streamr/broker-node:v100.0.0-testnet-one.4
```

**Windows PowerShell**

First move into your node's folder:

```
cd ~/.streamrDocker
```

Start your node:

```
docker run -p 32200:32200 --name streamr --restart unless-stopped -d -v ${pwd}:/home/streamr/.streamr streamr/broker-node:v100.0.0-testnet-one.4
```

**The `docker run` command, deconstructed:**

The `--name` option gives the Docker container a custom name, in this case `streamr`. This makes it easier to check in on your node later. If you don't set a custom name, Docker will automatically give each container a funky name a la `nifty_lovelace`.

The `--restart` option enables a restart policy of `unless-stopped`. This means that if a node stops running due to an error (such as it running out of memory), it will start up again automatically and continue to claim rewards. If you, however, stop a node manually, it won't start again on its own, which is practical in case you need to make changes to the config file before you start it again. You can restart a stopped node manually with the command `sudo docker restart streamr` (remove `sudo ` if you are using Windows PowerShell).

The `-d` option starts your Docker container and node in detached mode, meaning it runs in the background and you can check in on and follow the logs as you please. The alternative is to start it in attached mode, which requires you to keep the window open to keep the node running. The latter is not practical in most cases unless you use a terminal multiplexer such as `tmux` or `screen` to detach.

### Step 5: Follow the node log
Since you started the node in detached mode, you won't see the log streamed to your screen automatically when you start the node. Run the command below to see and follow the logs.

:::caution
Remember to stop the `logs` command. If its left to run in the terminal it will consume a large amount of memory over time.
:::

**Linux / macOS**

```
sudo docker logs --follow streamr
```

**Windows PowerShell**

```
docker logs --follow streamr
```

You should start to see logging similar to this:

```
INFO [2022-02-17T07:50:34.901] (broker              ): Starting broker version nn.n.n
INFO [2022-02-17T07:50:35.080] (BrubeckMinerPlugin  ): Analyzing NAT type
INFO [2022-02-17T07:50:36.339] (TrackerConnector    ): Connected to tracker 0x77FA7A
INFO [2022-02-17T07:51:00.749] (TrackerConnector    ): Connected to tracker 0x05e7a0
INFO [2022-02-17T07:51:07.021] (BrubeckMinerPlugin  ): NAT type: Full Cone
INFO [2022-02-17T07:51:07.029] (BrubeckMinerPlugin  ): Brubeck miner plugin started
INFO [2022-02-17T07:51:07.033] (httpServer          ): HTTP server listening on 7171
INFO [2022-02-17T07:51:07.056] (broker              ): Welcome to the Streamr Network. Your node's generated name is ...
```

Hit `CTRL-Z` to exit. The node will keep running in the background.

If you just want to check the current log and not see new lines printed to the screen, you can run the `docker logs` command without the `--follow` option, as follows:

**Linux / macOS**

```
sudo docker logs streamr
```

**Windows PowerShell**

```
docker logs streamr
```

If your node has been running for a while, printing the entire log out might not make sense, since there will be a lot of log lines. If you just want to see the last 100 lines to see if your node is claiming rewards as it should, use the following command:

**Linux / macOS**

```
sudo docker logs --tail 100 streamr
```

**Windows PowerShell**

```
docker logs --tail 100 streamr
```

See [Docker's documentation](https://docs.docker.com/engine/reference/commandline/logs/) to learn more about how to use the `docker logs` command.

## The npm approach
If you don’t have Node.js installed, install it using [nvm](https://github.com/nvm-sh/nvm#installing-and-updating) or manually from the [Node.js site](https://nodejs.org/en/download/). The Broker requires at least Node.js version 16.x. Once installed, you can download, configure, and start the Streamr Broker.

### Step 1: Install the latest testnet version using npm
-   Run `npm install -g streamr-broker@100.0.0-testnet-one.4` to download and install the package. You may need administrative access to run this command. The latest testnet version may be different to the version listed here, if in doubt, check the [npm registry](https://www.npmjs.com/package/streamr-broker?activeTab=versions).

```
npm install -g streamr-broker@100.0.0-testnet-one.4
```

There can be plenty of output from npm. If the installation fails with an error, you should address it before continuing.

### Step 2a: Configure your node with streamr-broker-init
-   Run `streamr-broker-init` to generate a configuration file using a step-by-step wizard. Answer the questions by using arrow keys and ‘enter’ to navigate.
-   Generate or Import Ethereum private key: Generate one unless you have one you want to use with the node
-   Plugins to enable: Hit enter (do not select/enable any additional plugins)
-   Path to store the configuration: Press 'enter' to use the default path

The wizard asks if you would like it to display your Ethereum private key. From here, you should copy-paste it to a safe place! You can also find it later in the configuration file, which is saved by default to `.streamr/config/default.json` under your home directory.

### Step 2b: Update the node config file
If you want to become an Operator in the testnet, you need to manually modify the node config file to include your Operator contract address.

Find the config file generated in step 2a and take a backup copy. Then replace the config file with the [testnet config](./become-an-operator.md#testnet-node-config) using a text editor. Replace YOUR_OPERATOR_CONTRACT_ADDRESS with your newly deployed Operator contract's address (find it on the Operator page, there's a "Copy address" button next to it), and NODE_PRIVATE_KEY with the private key in your automatically generated backup. If you previously generated a node signing key then you can also keep using that `privateKey`.

If you intend to test your Operator in the Mumbai environment, the same above advice applies, but use instead the [Mumbai testnet config](./become-an-operator.md#mumbai-node-config) using a text editor. Replace YOUR_OPERATOR_CONTRACT_ADDRESS with your newly deployed Operator contract's address (find it on the Operator page, there's a "Copy address" button next to it), and NODE_PRIVATE_KEY with the private key in your automatically generated backup. If you previously generated a node signing key then you can also keep using that `privateKey`.

### Step 3: Start the Streamr node
If you want to become an Operator in the testnet, then you must first perform the [Step 3 of becoming an Operator](./become-an-operator.md#step-3-pair-your-node-with-your-operator-contract) to pair your nodes with your Operator contract before starting your node.

-   Run `streamr-broker` to start the node! You should start to see logging similar to this:

```
INFO [2023-10-31T17:42:30.897] (broker              ): Start broker version ...
INFO [2023-10-31T17:42:32.660] (StreamrNode         ): Starting new StreamrNode with id 251cdad515544d7e863602413a5d91b2
INFO [2023-10-31T17:42:33.131] (OperatorPlugin      ): Fetched redundancy factor {"redundancyFactor":1}
INFO [2023-10-31T17:42:33.152] (MaintainTopologyHelp): Starting
```

## Testnet node config
Below is the template you can use to override and replace the contents of your config file with. You can copy this snippet or download the [JSON file](../../static/assets/default.json). 

```json
{
    "client": {
        "auth": {
            "privateKey": "NODE_PRIVATE_KEY"
        }
    },
    "plugins": {
        "operator": {
            "operatorContractAddress": "OPERATOR_CONTRACT_ADDRESS"
        }
    }
}
```

## The Network Explorer
The Network Explorer does not yet support the 1.0 testnet network. If you set up your node as an Operator in the testnet, your node will not appear on the map.

## Earning with your Streamr node
If you have your node up an running, you are more than half way towards becoming an Streamr node Operator, capable of earning tokens by joining [stream Sponsorships](../streamr-network/incentives/stream-sponsorships.md). Head to the [Streamr node Operator](../streamr-network/network-roles/operators.md) page for more information.

## WebSocket connectivity
If you're running the node with Docker, then the above guided tutorial will handle the port mapping (`-p 32200:32200`). However, you must also remember to open port `32200` for **external** TCP traffic. Opening ports is environment specific, if you're in a Linux based system, [this guide may be helpful](https://www.digitalocean.com/community/tutorials/opening-a-port-on-linux).

### Choosing a different WebSocket port
If the default port is not suitable for you then you can change it by adding a `controlLayer` entry to your node config like so:

```json
"client": {
    ...
    "network": {
        "controlLayer": {
            "websocketPortRange": {
                "min": 16100,
                "max": 16100
            }
        }
    },
    ...
}
```

## Troubleshooting
Ask for help on our [Discord](https://discord.gg/gZAm8P7hK8)! There are many helpul node runners that have encountered the same issues that you have and will warmly offer their peer-to-peer assistance!

Also, [ChatGPT](https://chat.openai.com) is a handy resource for debugging networking and Docker related issues.

### RPC issues
Your node may have issues if the RPC connection is flaky. The RPC is the connection to the Blockchain.

[Operators](../streamr-network/network-roles/operators.md) may choose to replace their RPC endpoint address by updating their [node config file](./become-an-operator.md#mumbai-node-config).

### Diagnostics
For extra logging on your Streamr node, add the `LOG_LEVEL` environmental variable to your run script.

For example,
```shell
sudo docker run -p 32200:32200 --name streamr --restart unless-stopped -d -e LOG_LEVEL=trace -v $(cd ~/.streamrDocker && pwd):/home/streamr/.streamr streamr/broker-node:v100.0.0-testnet-one.4
```

## Mumbai node config
Below is the template you can use to override and replace the contents of your config file with. You can copy this snippet or download the [JSON file](../../static/assets/mumbai-default.json). 

:::info Important
- This is the Mumbai configuration. If you want to participate in the incentivized testnets, use the [testnet configuration](#testnet-node-config).
:::

```json
{
    "client": {
        "metrics": false,
        "auth": {
            "privateKey": "NODE_PRIVATE_KEY"
        },
        "network": {
            "controlLayer": {
                "entryPoints": [
                    {
                        "id": "e1",
                        "websocket": {
                            "host": "entrypoint-1.streamr.network",
                            "port": 40401,
                            "tls": true
                        }
                    },
                    {
                        "id": "e2",
                        "websocket": {
                            "host": "entrypoint-2.streamr.network",
                            "port": 40401,
                            "tls": true
                        }
                    }
                ]
            }
        },
        "contracts": {
            "streamRegistryChainAddress": "0x4F0779292bd0aB33B9EBC1DBE8e0868f3940E3F2",
            "streamStorageRegistryChainAddress": "0xA5a2298c9b48C08DaBF5D76727620d898FD2BEc1",
            "storageNodeRegistryChainAddress": "0xE6D449A7Ef200C0e50418c56F84079B9fe625199",
            "mainChainRPCs": {
                "name": "mumbai",
                "chainId": 80001,
                "rpcs": [
                    {
                        "url": "https://rpc-mumbai.maticvigil.com"
                    }
                ]
            },
            "streamRegistryChainRPCs": {
                "name": "mumbai",
                "chainId": 80001,
                "rpcs": [
                    {
                        "url": "https://rpc-mumbai.maticvigil.com"
                    }
                ]
            },
            "theGraphUrl": "https://api.thegraph.com/subgraphs/name/samt1803/network-subgraphs"
        }
    },
    "plugins": {
        "operator": {
            "operatorContractAddress": "YOUR_OPERATOR_CONTRACT_ADDRESS"
        }
    }
}
```