package com.streamr.client_testing;

import com.streamr.client.options.ResendFromOption;
import com.streamr.client.options.ResendLastOption;
import com.streamr.client.options.ResendOption;
import com.streamr.client.protocol.message_layer.MessageRef;
import com.streamr.client.rest.Stream;
import com.streamr.client.utils.Address;
import com.streamr.client.utils.HttpUtils;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.HashMap;
import java.util.function.BiConsumer;

public class SubscriberJS extends Subscriber {

    private static final Logger log = LogManager.getLogger(SubscriberJS.class);

    private final StreamrClientJS subscriber;
    private Process p;
    private final String command;
    private BiConsumer<Address, String> onReceived = null;
    private final Thread thread;
    private Thread errorLoggingThread;

    public SubscriberJS(StreamrClientJS subscriber, Stream stream, ResendOption resendOption) {
        this.subscriber = subscriber;
        String groupKeyAsJson = subscriber.getGroupKey() == null ? "" : Utils.groupKeyToJson(subscriber.getGroupKey());
        command = "node subscriber.js " + subscriber.getPrivateKey() + " "
                + stream.getId() + " " + resendOptionToJson(resendOption) + " " + groupKeyAsJson;
        thread = new Thread(this::executeNode);
        thread.setName("JS-sub-" + getSubscriberId().toString().substring(0, 6));
    }

    public void setOnReceived(BiConsumer<Address, String> onReceived) {
        this.onReceived = onReceived;
    }

    @Override
    public Address getSubscriberId() {
        return subscriber.getAddress();
    }

    @Override
    public void start() {
        thread.start();
    }

    private void executeNode() {
        try {
            p = Runtime.getRuntime().exec(command, null);
            BufferedReader stdInput = new BufferedReader(new
                    InputStreamReader(p.getInputStream()));

            BufferedReader stdError = new BufferedReader(new
                    InputStreamReader(p.getErrorStream()));

            String s;

            errorLoggingThread = new Thread(() -> {
                try {
                    String err;
                    while ((err = stdError.readLine()) != null) {
                        log.info(getSubscriberId() + " " + err);
                    }
                } catch (IOException e) {
                    e.printStackTrace();
                }
            });

            errorLoggingThread.start();

            while (!Thread.currentThread().isInterrupted() && (s = stdInput.readLine()) != null) {
                if (s.startsWith("Received: ")) { // only content, for message validation
                    if (onReceived != null) {
                        String[] parts = s.substring(10).split("###");
                        onReceived.accept(new Address(parts[0]), parts[1]);
                    }
                } else if (s.startsWith("whole message received: ")) { // whole stream message, for logging
                    String msg = s.split("whole message received: ")[1];
                    log.debug("JS subscriber {} received: {}", getSubscriberId(), msg);
                }
                log.debug(getSubscriberId() + " " + s);
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
}
