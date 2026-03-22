using System;
using System.IO;
using System.Collections.Generic;

namespace Processing
{
    public interface IProcessor
    {
        string Process(string input);
        Status GetStatus();
    }

    public enum Status
    {
        Active,
        Inactive,
        Pending
    }

    public class Config
    {
        public string Name { get; set; }
        public int Value { get; set; }
        public bool Enabled { get; set; }
    }

    public class DataProcessor : IProcessor
    {
        private readonly Config _config;

        public DataProcessor(Config config)
        {
            _config = config;
        }

        public string Process(string input)
        {
            return File.ReadAllText(input).ToUpper();
        }

        public Status GetStatus()
        {
            return _config.Enabled ? Status.Active : Status.Inactive;
        }
    }

    public static class Factory
    {
        public static DataProcessor Create(string name)
        {
            var config = new Config { Name = name, Value = 42, Enabled = true };
            return new DataProcessor(config);
        }
    }
}
