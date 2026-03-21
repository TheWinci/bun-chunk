use std::fs;
use std::path::Path;

const MAX_SIZE: usize = 1024;

#[derive(Debug, Clone)]
pub struct Config {
    pub name: String,
    pub value: u32,
    pub enabled: bool,
}

pub enum Status {
    Active,
    Inactive,
    Pending,
}

pub trait Processor {
    fn process(&self, input: &str) -> Result<String, String>;
    fn status(&self) -> Status;
}

impl Processor for Config {
    fn process(&self, input: &str) -> Result<String, String> {
        match fs::read_to_string(Path::new(input)) {
            Ok(data) => Ok(data.to_uppercase()),
            Err(_) => Err("Failed to process".to_string()),
        }
    }

    fn status(&self) -> Status {
        if self.enabled {
            Status::Active
        } else {
            Status::Inactive
        }
    }
}

pub fn create_config(name: &str) -> Config {
    Config {
        name: name.to_string(),
        value: 42,
        enabled: true,
    }
}

fn helper(x: u32) -> u32 {
    x * 2
}
