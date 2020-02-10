package com.streamr.client_testing;

import org.apache.commons.cli.*;

public class Main {
    private static Streams streams;
    public static void main(String[] args) {

        Options options = new Options();

        String streamsDescription = "Stream setup to test or run. Must be one of:\n" + String.join("\n", Streams.SETUPS_NAMES);
        Option stream = new Option("s", "stream", true, streamsDescription);
        stream.setRequired(true);
        options.addOption(stream);

        Option mode = new Option("m", "mode", true, "'test' or 'run'");
        mode.setRequired(true);
        options.addOption(mode);

        Option restApiUrl = new Option("r", "resturl", true, "REST API url to connect to.");
        restApiUrl.setRequired(true);
        options.addOption(restApiUrl);

        Option wsApiUrl = new Option("w", "wsurl", true, "WebSockets API url to connect to");
        wsApiUrl.setRequired(true);
        options.addOption(wsApiUrl);

        CommandLineParser parser = new DefaultParser();
        HelpFormatter formatter = new HelpFormatter();
        CommandLine cmd = null;

        try {
            cmd = parser.parse(options, args);
        } catch (ParseException e) {
            System.out.println(e.getMessage());
            formatter.printHelp("streamr-client-testing", options);

            System.exit(1);
        }
        cmd.getOptionValue("resturl");

        boolean testCorrectness = false;
        if (cmd.getOptionValue("mode").equals("test")) {
            testCorrectness = true;
        } else if (cmd.getOptionValue("mode").equals("run")) {
            testCorrectness = false;
        } else {
            System.out.println("option 'mode' must be either 'test' or 'run'");
            System.exit(1);
        }
        streams = new Streams(cmd.getOptionValue("resturl"), cmd.getOptionValue("wsurl"), testCorrectness);
        streams.start(cmd.getOptionValue("stream"));

        /*
        "http://localhost/api/v1"
        "ws://localhost/api/v1/ws"
         */
    }
}
