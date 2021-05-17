package com.streamr.client_testing;

import com.streamr.client.utils.Address;

public abstract class Subscriber {
    public abstract Address getSubscriberId();
    public abstract void start();
    public abstract void stop();
}
