import Foundation

struct Config {
    let name: String
    var value: Int
    var enabled: Bool
}

enum Status {
    case active
    case inactive
    case pending
}

protocol Processor {
    func process(input: String) -> String?
    func getStatus() -> Status
}

class DataProcessor: Processor {
    private let config: Config

    init(config: Config) {
        self.config = config
    }

    func process(input: String) -> String? {
        guard let data = try? String(contentsOfFile: input) else {
            return nil
        }
        return data.uppercased()
    }

    func getStatus() -> Status {
        return config.enabled ? .active : .inactive
    }
}

func createProcessor(name: String) -> DataProcessor {
    let config = Config(name: name, value: 42, enabled: true)
    return DataProcessor(config: config)
}

func helper(x: Int) -> Int {
    return x * 2
}
