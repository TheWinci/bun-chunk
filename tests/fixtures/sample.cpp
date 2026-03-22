#include <iostream>
#include <string>
#include <vector>

#define MAX_SIZE 1024

namespace processing {

class Config {
public:
    std::string name;
    int value;
    bool enabled;

    Config(const std::string& name, int value)
        : name(name), value(value), enabled(true) {}
};

enum class Status {
    Active,
    Inactive,
    Pending
};

class DataProcessor {
public:
    DataProcessor(const Config& config) : config_(config) {}

    std::string process(const std::string& input) {
        return input;
    }

    Status getStatus() const {
        return config_.enabled ? Status::Active : Status::Inactive;
    }

private:
    Config config_;
};

DataProcessor createProcessor(const std::string& name) {
    Config config(name, 42);
    return DataProcessor(config);
}

} // namespace processing

int helper(int x) {
    return x * 2;
}
