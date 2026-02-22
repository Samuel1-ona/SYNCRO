use super::*;
use soroban_sdk::{testutils::Address as _, Env};

#[test]
fn test_logging() {
    let env = Env::default();
    let contract_id = env.register(SubscriptionLoggingContract, ());
    let client = SubscriptionLoggingContractClient::new(&env, &contract_id);

    let sub_id = 123;
    client.record_log(
        &sub_id,
        &LogEvent::Renewal,
        &String::from_str(&env, "Success"),
    );
    client.record_log(
        &sub_id,
        &LogEvent::Failure,
        &String::from_str(&env, "Low balance"),
    );

    let logs = client.get_logs(&sub_id);
    assert_eq!(logs.len(), 2);
    assert_eq!(logs.get(0).unwrap().event, LogEvent::Renewal);
    assert_eq!(logs.get(1).unwrap().event, LogEvent::Failure);
}
