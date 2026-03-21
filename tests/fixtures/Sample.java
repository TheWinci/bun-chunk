package com.example;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

public class Sample {
    private static final int MAX_SIZE = 1024;
    private String name;
    private boolean enabled;

    public Sample(String name, boolean enabled) {
        this.name = name;
        this.enabled = enabled;
    }

    public String process(String input) throws IOException {
        String data = Files.readString(Path.of(input));
        return data.toUpperCase();
    }

    public boolean isEnabled() {
        return enabled;
    }

    public enum Status {
        ACTIVE, INACTIVE, PENDING
    }

    public static Sample create(String name) {
        return new Sample(name, true);
    }
}
