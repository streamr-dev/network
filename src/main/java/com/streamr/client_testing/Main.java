package com.streamr.client_testing;

import org.apache.commons.cli.*;

import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.text.DateFormat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Properties;
import java.util.logging.*;

public class Main {
    private static Streams streams;
    private static class LogFormatter extends Formatter {
        private final DateFormat df = new SimpleDateFormat("dd/MM/yyyy hh:mm:ss.SSS");

        public String format(LogRecord record) {
            StringBuilder builder = new StringBuilder(1000);
            builder.append(df.format(new Date(record.getMillis()))).append("-");
            builder.append(record.getLevel()).append(": ");
            builder.append(formatMessage(record));
            builder.append("\n");
            return builder.toString();
        }

        public String getHead(Handler h) {
            return super.getHead(h);
        }

        public String getTail(Handler h) {
            return super.getTail(h);
        }
    }
    public static final Logger logger = Logger.getAnonymousLogger();

    public static void main(String[] args) {
        Options options = new Options();

        Option configFileOption = new Option("c", "config", true, "config file, default 'config/default.conf'");
        configFileOption.setRequired(false);
        options.addOption(configFileOption);

        String streamsDescription = "Stream setup to test or run. Must be one of:\n" + String.join("\n", Streams.SETUPS_NAMES);
        Option stream = new Option("s", "stream", true, streamsDescription);
        stream.setRequired(true);
        options.addOption(stream);

        Option mode = new Option("m", "mode", true, "'test' or 'run'");
        mode.setRequired(true);
        options.addOption(mode);

        Option restApiUrl = new Option("r", "restUrl", true, "REST API url to connect to.");
        options.addOption(restApiUrl);

        Option wsApiUrl = new Option("w", "wsUrl", true, "WebSockets API url to connect to");
        options.addOption(wsApiUrl);

        CommandLineParser parser = new DefaultParser();
        HelpFormatter formatter = new HelpFormatter();
        CommandLine cmd = null;

        try {
            cmd = parser.parse(options, args);
        } catch (ParseException e) {
            formatter.printHelp("streamr-client-testing", options);
            System.exit(1);
        }

        String configFile = cmd.getOptionValue("config") != null ? cmd.getOptionValue("config") : "config/default.conf";
        System.out.println("Reading config from " + configFile);

        Properties prop = new Properties();
        try {
            InputStream in = new FileInputStream(configFile);
            prop.load(in);
            in.close();
        } catch (IOException e) {
            System.err.println("Unable to read config file: " + configFile);
            System.exit(1);
        }

        Level logLevel = Level.parse(prop.getProperty("logLevel"));
        Handler handler = new ConsoleHandler();
        handler.setLevel(logLevel);
        handler.setFormatter(new LogFormatter());
        logger.setUseParentHandlers(false);
        logger.addHandler(handler);
        logger.setLevel(logLevel);

        // Command-line options override config file
        String restUrl = cmd.getOptionValue("restUrl") != null ? cmd.getOptionValue("restUrl") : prop.getProperty("restUrl");
        String wsUrl = cmd.getOptionValue("wsUrl") != null ? cmd.getOptionValue("wsUrl") : prop.getProperty("wsUrl");

        boolean testCorrectness = false;
        if (cmd.getOptionValue("mode").equals("test")) {
            testCorrectness = true;
        } else if (cmd.getOptionValue("mode").equals("run")) {
            testCorrectness = false;
        } else {
            logger.severe("option 'mode' must be either 'test' or 'run'");
            System.exit(1);
        }
        Participants participants = new Participants(
                Integer.parseInt(prop.getProperty("nbJavaPublishers")),
                Integer.parseInt(prop.getProperty("nbJavaSubscribers")),
                Integer.parseInt(prop.getProperty("nbJavascriptPublishers")),
                Integer.parseInt(prop.getProperty("nbJavascriptSubscribers"))
        );
        try {
        streams = new Streams(participants, restUrl, wsUrl, testCorrectness);
        streams.start(cmd.getOptionValue("stream"));
        } catch (Exception e) {
            logger.log(Level.SEVERE, e.getMessage(), e);
            System.exit(1);
        }
    }
}
