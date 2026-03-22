#include <stdio.h>
#include <stdlib.h>
#include "utils.h"

#define MAX_SIZE 1024
#define SQUARE(x) ((x) * (x))

typedef struct {
    char *name;
    int value;
    int enabled;
} Config;

enum Status {
    ACTIVE,
    INACTIVE,
    PENDING
};

Config *create_config(const char *name) {
    Config *config = malloc(sizeof(Config));
    config->name = strdup(name);
    config->value = 42;
    config->enabled = 1;
    return config;
}

void process(Config *config, const char *input) {
    FILE *file = fopen(input, "r");
    if (file) {
        char buffer[MAX_SIZE];
        while (fgets(buffer, MAX_SIZE, file)) {
            printf("%s", buffer);
        }
        fclose(file);
    }
}

static int helper(int x) {
    return x * 2;
}
