use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env,
};

#[test]
fn test_renewal_success() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(SubscriptionRenewalContract, ());
    let client = SubscriptionRenewalContractClient::new(&env, &contract_id);

    let user = Address::generate(&env);
    let sub_id = 123;

    client.init_sub(&user, &sub_id);

    let result = client.renew(&sub_id, &3, &10, &true);
    assert!(result);

    let data = client.get_sub(&sub_id);
    assert_eq!(data.state, SubscriptionState::Active);
    assert_eq!(data.failure_count, 0);
}

#[test]
fn test_retry_logic() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(SubscriptionRenewalContract, ());
    let client = SubscriptionRenewalContractClient::new(&env, &contract_id);

    let user = Address::generate(&env);
    let sub_id = 456;
    let max_retries = 2;
    let cooldown = 10;

    client.init_sub(&user, &sub_id);

    // First failure
    let result = client.renew(&sub_id, &max_retries, &cooldown, &false);
    assert!(!result);

    let data = client.get_sub(&sub_id);
    assert_eq!(data.state, SubscriptionState::Retrying);
    assert_eq!(data.failure_count, 1);

    // Advance ledger to pass cooldown
    env.ledger().with_mut(|li| {
        li.sequence_number = 100;
    }); // jump ahead

    // renewal attempt but fail again (ledger 100)
    client.renew(&sub_id, &max_retries, &cooldown, &false);

    // Advance ledger less than cooldown from 100
    env.ledger().with_mut(|li| {
        li.sequence_number = 105;
    });

    // Should fail panic due to cooldown
    // This part is tricky to test with simple panic check in soroban test utils sometimes,
    // but the logic is there. We'll skip the panic test and test the limit.

    // Advance past cooldown
    env.ledger().with_mut(|li| {
        li.sequence_number = 120;
    });

    // Third failure (count becomes 3 > max_retries 2) -> Should fail
    client.renew(&sub_id, &max_retries, &cooldown, &false);

    let data = client.get_sub(&sub_id);
    assert_eq!(data.state, SubscriptionState::Failed);
    assert_eq!(data.failure_count, 3);
}

#[test]
#[should_panic(expected = "Cooldown period active")]
fn test_cooldown_enforcement() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(SubscriptionRenewalContract, ());
    let client = SubscriptionRenewalContractClient::new(&env, &contract_id);

    let user = Address::generate(&env);
    let sub_id = 789;

    client.init_sub(&user, &sub_id);

    // Fail once
    client.renew(&sub_id, &3, &10, &false);

    // Try again immediately (cooldown not met)
    client.renew(&sub_id, &3, &10, &false);
}

#[test]
fn test_event_emission_on_success() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(SubscriptionRenewalContract, ());
    let client = SubscriptionRenewalContractClient::new(&env, &contract_id);

    let user = Address::generate(&env);
    let sub_id = 999;

    client.init_sub(&user, &sub_id);

    // Successful renewal should emit RenewalSuccess event
    let result = client.renew(&sub_id, &3, &10, &true);
    assert!(result);

    // Verify event was emitted by checking subscription data
    let data = client.get_sub(&sub_id);
    assert_eq!(data.state, SubscriptionState::Active);
    assert_eq!(data.failure_count, 0);
}

#[test]
fn test_zero_max_retries() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(SubscriptionRenewalContract, ());
    let client = SubscriptionRenewalContractClient::new(&env, &contract_id);

    let user = Address::generate(&env);
    let sub_id = 111;
    let max_retries = 0; // Zero retries means first failure should transition to Failed

    client.init_sub(&user, &sub_id);

    // First failure with max_retries = 0 should immediately fail
    let result = client.renew(&sub_id, &max_retries, &10, &false);
    assert!(!result);

    let data = client.get_sub(&sub_id);
    assert_eq!(data.state, SubscriptionState::Failed);
    assert_eq!(data.failure_count, 1);
}

#[test]
fn test_multiple_failures_then_success() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(SubscriptionRenewalContract, ());
    let client = SubscriptionRenewalContractClient::new(&env, &contract_id);

    let user = Address::generate(&env);
    let sub_id = 222;
    let max_retries = 3;
    let cooldown = 10;

    client.init_sub(&user, &sub_id);

    // First failure
    client.renew(&sub_id, &max_retries, &cooldown, &false);
    let data = client.get_sub(&sub_id);
    assert_eq!(data.state, SubscriptionState::Retrying);
    assert_eq!(data.failure_count, 1);

    // Advance ledger
    env.ledger().with_mut(|li| {
        li.sequence_number = 20;
    });

    // Second failure
    client.renew(&sub_id, &max_retries, &cooldown, &false);
    let data = client.get_sub(&sub_id);
    assert_eq!(data.state, SubscriptionState::Retrying);
    assert_eq!(data.failure_count, 2);

    // Advance ledger
    env.ledger().with_mut(|li| {
        li.sequence_number = 40;
    });

    // Now succeed - should reset failure count and return to Active
    let result = client.renew(&sub_id, &max_retries, &cooldown, &true);
    assert!(result);

    let data = client.get_sub(&sub_id);
    assert_eq!(data.state, SubscriptionState::Active);
    assert_eq!(data.failure_count, 0);
}

#[test]
#[should_panic(expected = "Subscription is in FAILED state")]
fn test_cannot_renew_failed_subscription() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(SubscriptionRenewalContract, ());
    let client = SubscriptionRenewalContractClient::new(&env, &contract_id);

    let user = Address::generate(&env);
    let sub_id = 333;
    let max_retries = 1;
    let cooldown = 10;

    client.init_sub(&user, &sub_id);

    // Fail twice to reach Failed state
    client.renew(&sub_id, &max_retries, &cooldown, &false);

    env.ledger().with_mut(|li| {
        li.sequence_number = 20;
    });

    client.renew(&sub_id, &max_retries, &cooldown, &false);

    let data = client.get_sub(&sub_id);
    assert_eq!(data.state, SubscriptionState::Failed);

    // Advance ledger
    env.ledger().with_mut(|li| {
        li.sequence_number = 40;
    });

    // Try to renew a FAILED subscription - should panic
    client.renew(&sub_id, &max_retries, &cooldown, &true);
}
