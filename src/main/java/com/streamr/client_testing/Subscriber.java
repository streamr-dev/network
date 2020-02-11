package com.streamr.client_testing;

public abstract class Subscriber {
    public abstract String getSubscriberId();
    public abstract void start();
    public abstract void stop();
}
