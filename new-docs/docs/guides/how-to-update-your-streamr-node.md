---
sidebar_position: 6
---

# How to update your Streamr node
Keeping your node up to date is very important as new releases contain bug fixes and performance improvements. The exact update instructions may vary based on the environment that the node has been installed in.

## Docker update guide
:::info
This guide is meant for Linux and MacOS. Windows Powershell commands will be slightly different.
:::

To update your Streamr node from `v100.0.0-testnet-three.6` to `latest` (for example), run:

```
sudo docker stop streamr && sudo docker rm streamr && sudo docker container prune --force
```

Then run and following command:
```
sudo docker images
```

Copy the image ID (`IMAGE_ID`) from the output and use it in the following command. In this next command you'll be removing your old Docker image.

```
sudo docker rmi IMAGE_ID
```

Run your updated node with the new node version,

```
sudo docker run -p 32200:32200 --name streamr --restart unless-stopped -d -v $(cd ~/.streamrDocker && pwd):/home/streamr/.streamr streamr/node
```

Your updated node will now be running. As usual, you can checkup on it with 

```
sudo docker logs streamr --follow
```

## npm update guide
Firstly stop your node, if you're running your node with `PM2` for example, then it will be something like:

```
pm2 list
```

```
pm2 stop streamr
```

Next, globally install the node upgrade:
```
npm install -g @streamr/node
```

And then you can run the node:
```
`streamr-node`
```
