---
sidebar_position: 1
---

# Run a Streamr node

:::tip

- You can run up to 5 nodes per IP address
- Rewards are automatically paid out at the beginning of the following month. The DATA token rewards are transferred to the wallet(s) you use for staking.
- You can stake up to 20K DATA per node. However, if you stake the full amount, you will need to transfer the amount above 20K after you get your first rewards paid out to also stake and earn rewards on those. You can avoid the need to transfer tokens every month by staking less than 20K per node, such as 17K-18K DATA.

:::

## Pick a method
You have two methods to choose from: Docker and npm. Docker is the most straightforward and recommended method unless you are well-acquainted with npm. You only need 300MB of available memory per node that runs using Docker and a little less if you use the npm method.

Once you have either Docker or Node.js installed, the steps to download and start the node are very similar, regardless of whether you’re running Linux, macOS, or Windows (use PowerShell). You may need to adapt the commands for your platform or install OS-specific dependencies if they are missing.

## The configuration wizard
As part of both approaches, we show how to run the configuration wizard to initialize your node’s config file, which will be saved on your disk. The wizard will let you either generate or import an Ethereum private key for your node. It will also allow you to enable additional plugins, but they are entirely unnecessary if you simply want to run a node to help expand the network and stake DATA tokens.

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

When you have Docker installed, you can download, configure, and start the Streamr Broker node.

### Step 1: Create a folder for your node

You need a folder for your node where the node's config file will be stored. Create the folder with the following command:

```
mkdir ~/.streamrDocker1
```

:::info

Notice the number (`1`) at the end of the folder name. It is there in case you later want to create additional nodes on the same device/server, which you will need folders for too, a la `.streamrDocker2` for your second node, `.streamrDocker3` for your third node, etc. If you decide to create additional nodes, you need to change the number accordingly in the various commands. If you fail to adjust the folder name, you will end up with two or more nodes using the same config file and staking wallet, which will create a conflict and the result will be that only one of the nodes will able to claim rewards.

:::

### Step 2: Set permissions

Change the permissions on the node's folder:

```
sudo chmod -R 777 ~/.streamrDocker*/
```

### Step 3: Run the config wizard to create and configure your Streamr node

Start the config wizard with the below command. Docker will download the Broker image unless you have it already.

**Linux / macOS**

```
sudo docker run -it -v $(cd ~/.streamrDocker1 && pwd):/home/streamr/.streamr streamr/broker-node:latest bin/config-wizard
```

**Windows PowerShell**

Change the working directory (move into your node's folder):

```
cd ~/.streamrDocker1
```

Then run the config wizard:

```
docker run -it -v ${pwd}:/home/streamr/.streamr streamr/broker-node:latest bin/config-wizard
```

**Using the config wizard**

_"Generate or import Ethereum private key"_

You can generate a new private key or use one you already have. You can avoid having the private key of the wallet with your soon-to-be staked DATA stored in a plain text file by generating a new private key in this step and adding your staking wallet's public key as a *beneficiary address* once you are done configuring the node via the config wizard (highly recommended).

_"Plugins to enable"_

Press 'enter' (do not select/enable any additional plugins).

_"Path to store the configuration"_

Press 'enter' to use the default path.

:::caution

The path to the config file in the `docker run` command and the path defined via the config wizard differs and tend to cause some confusion. They are different for a reason. The path in the `docker run` command (`/home/streamr/.streamr`) refers to the path _inside_ the Docker container, whereas the path you define via the config wizard refers to the path _outside_ the Docker container. Hence, you need to use the default path as mentioned above.

:::

### Step 4: Add a Beneficiary Address to your node (optional)

A *beneficiary address* allows you to only add the public key of the wallet with your staked DATA tokens to the config file instead of the private key. By using a beneficiary address, if your node is compromised, the staked DATA tokens will not be at risk. We highly recommend you use a beneficiary address.

Exercise caution when you edit the config file. If you accidentally remove a character such as a curly bracket or use the wrong type of quotation symbol, the config file's JSON format will be invalid and your node will fail to run.

**Linux / macOS**

Open your node's config file with the `nano` text editor:

```
nano ~/.streamrDocker1/config/default.json
```

Add the Beneficiary Address's public key within the curly brackets after `"brubeckMiner": `:

```
        "brubeckMiner": { "beneficiaryAddress": "0x........................................" }
```

Hit `CTRL-S` to save on Linux (`CMD-S` on macOS) followed by `CTRL-X` (`CMD-X` on macOS) to exit.

**Windows PowerShell**

Edit the config file with Notepad. This assumes that you've created the node folder in your Windows user's home folder. If that's not the case, then you need to correct the path. Replace `user` with your logged in username.

```
notepad.exe C:\Users\user\.streamrDocker1\config\default.json
```

Add the Beneficiary Address's public key within the curly brackets after `"brubeckMiner": `:

```
        "brubeckMiner": { "beneficiaryAddress": "0x........................................" }
```

Press `CTRL+S` to save. Close the editor.

### Step 5: Start your Streamr Broker Node using Docker

**Linux / macOS**

```
sudo docker run --name streamr1 --restart unless-stopped -d -v $(cd ~/.streamrDocker1 && pwd):/home/streamr/.streamr streamr/broker-node:latest
```

**Windows PowerShell**

First move into your node's folder:

```
cd ~/.streamrDocker1
```

Start your node:

```
docker run --name streamr1 --restart unless-stopped -d -v $(cd ~/.streamrDocker1 && pwd):/home/streamr/.streamr streamr/broker-node:latest
```

**The `docker run` command, deconstructed:**

The `--name` option gives the Docker container a custom name, in this case `streamr1`. This makes it easier to check in on your node later, in case you have more than one node running. If you end up with several nodes, you will appreciate the ability to easily distinguish between them. If you don't set a custom name, Docker will automatically give each container a funky name a la `nifty_lovelace`.

The `--restart` option enables a restart policy of `unless-stopped`. This means that if a node stops running due to an error (such as it running out of memory), it will start up again automatically and continue to claim rewards. If you, however, stop a node manually, it won't start again on its own, which is practical in case you need to make changes to the config file before you start it again. You can restart a stopped node manually with the command `sudo docker restart streamr1` (remove `sudo ` if you are using Windows PowerShell). If you don't set a restart policy and your node stops running, you will miss out on rewards if you don't notice that the node is down and restart it shortly after.

The `-d` option starts your Docker container and node in detached mode, meaning it runs in the background and you can check in on and follow the logs as you please. The alternative is to start it in attached mode, which requires you to keep the window open to keep the node running. The latter is not practical in most cases unless you use a terminal multiplexer such as `tmux` or `screen` to detach.

### Step 5: Follow the node log

Since you started the node in detached mode, you won't see the log streamed to your screen automatically when you start the node. Run the command below to see and follow the logs.

**Linux / macOS**

```
sudo docker logs --follow streamr1
```

**Windows PowerShell**

```
docker logs --follow streamr1
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
sudo docker logs streamr1
```

**Windows PowerShell**

```
docker logs streamr1
```

If your node has been running for a while, printing the entire log out might not make sense, since there will be a lot of log lines. If you just want to see the last 100 lines to see if your node is claiming rewards as it should, use the following command:

**Linux / macOS**

```
sudo docker logs --tail 100 streamr1
```

**Windows PowerShell**

```
docker logs --tail 100 streamr1
```

See [Docker's documentation](https://docs.docker.com/engine/reference/commandline/logs/) to learn more about how to use the `docker logs` command.

## The npm approach
If you don’t have Node.js installed, install it using [nvm](https://github.com/nvm-sh/nvm#installing-and-updating) or manually from the [Node.js site](https://nodejs.org/en/download/). The Broker requires at least Node.js version 14.x. Once installed, you can download, configure, and start the Streamr Broker.

### Step 1: Install the latest version using npm
-   Run `npm install -g streamr-broker@latest` to download and install the package. You may need administrative access to run this command.

```
npm install -g streamr-broker@latest
```

There can be plenty of output from npm. If the installation fails with an error, you should address it before continuing.

### Step 2: Configure your node with streamr-broker-init
-   Run `streamr-broker-init` to generate a configuration file using a step-by-step wizard. Answer the questions by using arrow keys and ‘enter’ to navigate.
-   Generate or Import Ethereum private key: Generate one unless you have one you want to use with the node
-   Plugins to enable: Hit enter
-   Path to store the configuration: Press 'enter' to use the default path

Towards the end, the wizard asks if you would like it to display your Ethereum private key. From here, you should copy-paste it to a safe place! You can also find it later in the configuration file, which is saved by default to `.streamr/broker-config.json` under your home directory.

### Step 3: Start the Broker node
-   Run `streamr-broker` to start the node! You should start to see logging similar to this:

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

## The alternative: Nodes-as-a-Service

Scared of the command line? Not feeling up to docking anything besides your yacht? Nodes-as-a-Service (NaaS) to the rescue! You can spin up Streamr nodes with just a few clicks through either Zonaris or Flux on fully decentralised infrastructure without issuing a single command in a Command-Line Interface.

### Zonaris

To create one or more Streamr nodes via Zonaris, go to [Zonaris's website](https://www.zonaris.io/), click 'Deploy nodes' and follow the onboarding process.

### Flux

**Prerequisites**

- A ZelID
- A Polygon wallet with the DATA tokens you want to stake
- Flux coins

**Instructions**

To create a Streamr node via Flux, you first need to log in [here](https://home.runonflux.io/) using your ZelID. If you don't have a ZelID yet, you can get one via the [Zelcore app](https://zelcore.io/).

Then visit [Flux's app marketplace](https://home.runonflux.io/apps/marketplace) in the same browser window, search for `StreamrNode` and paste your Polygon wallet's address into the field where it says "Enter your Polygon address here". Click "Start Launching Marketplace App", authenticate with your ZelID and pay for the service with Flux coins.
