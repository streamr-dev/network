package com.streamr.client_testing;

import com.streamr.client.authentication.EthereumAuthenticationMethod;
import com.streamr.client.rest.Stream;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.function.Consumer;

public class PublisherThreadJS extends PublisherThread {
    private final EthereumAuthenticationMethod auth;
    private Process p;
    private final String command;
    private Consumer<String> onPublished = null;
    private final Thread thread;

    public PublisherThreadJS(String privateKey, Stream stream, long interval) {
        this.auth = new EthereumAuthenticationMethod(privateKey);
        command = "node publisher.js " + privateKey + " " + stream.getId() + " " + interval;
        thread = new Thread(new Runnable() {
            @Override
            public void run() {
                executeNode();
            }
        });
    }

    @Override
    public String getPublisherId() {
        return auth.getAddress();
    }

    public void setOnPublished(Consumer<String> onPublished) {
        this.onPublished = onPublished;
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
                if (s.startsWith("Published: ")) {
                    if (onPublished != null) {
                        onPublished.accept(s.substring(12));
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
