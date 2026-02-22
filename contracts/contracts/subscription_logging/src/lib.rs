#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String, Vec};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum LogEvent {
    Reminder,
    Approval,
    Renewal,
    Failure,
    Retry,
    Cancellation,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LogEntry {
    pub sub_id: u64,
    pub event: LogEvent,
    pub timestamp: u64,
    pub data: String,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Logs(u64), // sub_id -> Vec<LogEntry>
}

#[contract]
pub struct SubscriptionLoggingContract;

#[contractimpl]
impl SubscriptionLoggingContract {
    pub fn record_log(env: Env, sub_id: u64, event: LogEvent, data: String) {
        let key = DataKey::Logs(sub_id);
        let mut logs: Vec<LogEntry> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or(Vec::new(&env));

        let entry = LogEntry {
            sub_id,
            event,
            timestamp: env.ledger().timestamp(),
            data,
        };

        logs.push_back(entry);
        env.storage().persistent().set(&key, &logs);
    }

    pub fn get_logs(env: Env, sub_id: u64) -> Vec<LogEntry> {
        let key = DataKey::Logs(sub_id);
        env.storage()
            .persistent()
            .get(&key)
            .unwrap_or(Vec::new(&env))
    }
}

#[cfg(test)]
mod test;
