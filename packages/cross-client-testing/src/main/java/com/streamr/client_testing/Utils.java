package com.streamr.client_testing;

import com.streamr.client.utils.GroupKey;
import com.streamr.client.utils.HttpUtils;

import java.util.HashMap;
import java.util.Map;

public class Utils {
    /**
     * Used to communicate GroupKeys over to the external processes
     */
    public static String groupKeyToJson(GroupKey groupKey) {
        return HttpUtils.mapAdapter.toJson(groupKeyToMap(groupKey));
    }

    public static Map<String, String> groupKeyToMap(GroupKey groupKey) {
        Map<String, String> map = new HashMap<>();
        map.put("groupKeyId", groupKey.getGroupKeyId());
        map.put("groupKeyHex", groupKey.getGroupKeyHex());
        return map;
    }
}
