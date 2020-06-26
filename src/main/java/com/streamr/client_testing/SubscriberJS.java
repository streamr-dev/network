package com.streamr.client_testing;

import com.streamr.client.options.ResendFromOption;
import com.streamr.client.options.ResendLastOption;
import com.streamr.client.options.ResendOption;
import com.streamr.client.protocol.message_layer.MessageRef;
import com.streamr.client.rest.Stream;
import com.streamr.client.utils.HttpUtils;
import com.streamr.client.utils.UnencryptedGroupKey;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.HashMap;
import java.util.function.BiConsumer;

public class SubscriberJS extends Subscriber {
    private final StreamrClientJS subscriber;
    private Process p;
    private final String command;
    private BiConsumer<String, String> onReceived = null;
    private final Thread thread;

    public SubscriberJS(StreamrClientJS subscriber, Stream stream, ResendOption resendOption) {
        this.subscriber = subscriber;
        String groupKeys = "";
        if (subscriber.getEncryptionOptions() !=  null) {
            groupKeys = groupKeysToJson(subscriber);
        }
        command = "node subscriber.js " + subscriber.getPrivateKey() + " "
                + stream.getId() + " " + resendOptionToJson(resendOption) + " " + groupKeys;
        thread = new Thread(this::executeNode);
    }

    public void setOnReceived(BiConsumer<String, String> onReceived) {
        this.onReceived = onReceived;
    }

    @Override
    public String getSubscriberId() {
        return subscriber.getAddress();
    }

    @Override
    public void start() {
        thread.start();
    }

    private void executeNode() {
        try {
            p = Runtime.getRuntime().exec(command);
            BufferedReader stdInput = new BufferedReader(new
                    InputStreamReader(p.getInputStream()));

            BufferedReader stdError = new BufferedReader(new
                    InputStreamReader(p.getErrorStream()));

            String s;
            while (!Thread.currentThread().isInterrupted() && (s = stdInput.readLine()) != null) {
                if (s.startsWith("Received: ")) { // only content, for message validation
                    if (onReceived != null) {
                        String[] parts = s.substring(10).split("###");
                        onReceived.accept(parts[0], parts[1]);
                    }
                } else if (s.startsWith("whole message received: ")) { // whole stream message, for logging
                    String msg = s.split("whole message received: ")[1];
                    Main.logger.fine("Javascript subscriber " + getSubscriberId() + " received: " + msg);
                } else {
                    Main.logger.warning(getSubscriberId() + " " + s);
                }
            }
            try {
                while (!Thread.currentThread().isInterrupted() && stdError.ready() && (s = stdError.readLine()) != null) {
                    if (!s.equals("Failed to decrypt. Requested the correct decryption key(s) and going to try again.")) {
                        Main.logger.severe(s);
                    }
                }
            } catch (IOException e) {

            }
            if (Thread.currentThread().isInterrupted()) {
                stdInput.close();
                stdError.close();
                p.destroy();
            }
        } catch (IOException e) {
            e.printStackTrace();
            System.exit(1);
        }
    }

    @Override
    public void stop() {
        try {
            p.getInputStream().close();
            p.getErrorStream().close();
        } catch (IOException e) {
            e.printStackTrace();
        }
        thread.interrupt();
    }

    private static String resendOptionToJson(ResendOption resendOption) {
        if (resendOption == null) {
            return "real-time";
        }
        HashMap<String, Object> map = new HashMap<>();
        if (resendOption instanceof ResendLastOption) {
            map.put("last", ((ResendLastOption) resendOption).getNumberLast());
        } else if (resendOption instanceof ResendFromOption) {
            HashMap<String, Object> from = new HashMap<>();
            MessageRef fromRef = ((ResendFromOption) resendOption).getFrom();
            from.put("timestamp", fromRef.getTimestamp());
            from.put("sequenceNumber", fromRef.getSequenceNumber());
            map.put("from", from);
        }
        return HttpUtils.mapAdapter.toJson(map);
    }

    private static String groupKeysToJson(StreamrClientJS subscriber) {
        HashMap<String, HashMap<String, UnencryptedGroupKey>> keys = subscriber.getEncryptionOptions().getSubscriberGroupKeys();
        HashMap<String, HashMap<String, String>> keysHex = new HashMap<>();
        for (String streamId: keys.keySet()) {
            HashMap<String, UnencryptedGroupKey> streamKeys = keys.get(streamId);
            keysHex.put(streamId, new HashMap<>());
            for (String publisherId: streamKeys.keySet()) {
                keysHex.get(streamId).put(publisherId, streamKeys.get(publisherId).getGroupKeyHex());
            }
        }
        return HttpUtils.mapAdapter.toJson(keysHex);
    }
}
