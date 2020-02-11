package com.streamr.client_testing;

import com.streamr.client.authentication.EthereumAuthenticationMethod;
import com.streamr.client.rest.Stream;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.function.BiConsumer;

public class SubscriberJS extends Subscriber {
    private final EthereumAuthenticationMethod auth;
    private Process p;
    private final String command;
    private BiConsumer<String, String> onReceived = null;
    private final Thread thread;

    public SubscriberJS(String privateKey, Stream stream) {
        this.auth = new EthereumAuthenticationMethod(privateKey);
        command = "node subscriber.js " + privateKey + " " + stream.getId();
        thread = new Thread(new Runnable() {
            @Override
            public void run() {
                executeNode();
            }
        });
    }

    public void setOnReceived(BiConsumer<String, String> onReceived) {
        this.onReceived = onReceived;
    }

    @Override
    public String getSubscriberId() {
        return auth.getAddress();
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
                if (s.startsWith("Received: ")) {
                    if (onReceived != null) {
                        String[] parts = s.substring(10).split("###");
                        onReceived.accept(parts[0], parts[1]);
                    }
                } else {
                    System.out.println(s);
                }
            }

            while (!Thread.currentThread().isInterrupted() && (s = stdError.readLine()) != null) {
                System.out.println(s);
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
        thread.interrupt();
    }
}
