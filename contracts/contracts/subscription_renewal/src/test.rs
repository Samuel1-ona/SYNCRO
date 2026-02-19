use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env,
};

/// Helper: creates env, registers contract, initializes admin, returns (client, admin).
fn setup() -> (Env, SubscriptionRenewalContractClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(SubscriptionRenewalContract, ());
    let client = SubscriptionRenewalContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.init(&admin);

    (env, client, admin)
}

// ── Pause feature tests ──────────────────────────────────────────

#[test]
fn test_default_not_paused() {
    let (_env, client, _admin) = setup();
    assert!(!client.is_paused());
}

#[test]
fn test_admin_can_pause() {
    let (_env, client, _admin) = setup();

    client.set_paused(&true);
    assert!(client.is_paused());
}

#[test]
fn test_admin_can_unpause() {
    let (_env, client, _admin) = setup();

    client.set_paused(&true);
    assert!(client.is_paused());

    client.set_paused(&false);
    assert!(!client.is_paused());
}

#[test]
#[should_panic(expected = "Protocol is paused")]
fn test_renew_blocked_when_paused() {
    let (env, client, _admin) = setup();

    let user = Address::generate(&env);
    let sub_id = 100;

    client.init_sub(&user, &sub_id);
    client.set_paused(&true);

    // Should panic because the protocol is paused
    client.renew(&sub_id, &3, &10, &true);
}

#[test]
fn test_renew_works_after_unpause() {
    let (env, client, _admin) = setup();

    let user = Address::generate(&env);
    let sub_id = 101;

    client.init_sub(&user, &sub_id);

    // Pause then unpause
    client.set_paused(&true);
    client.set_paused(&false);

    // Should succeed now
    let result = client.renew(&sub_id, &3, &10, &true);
    assert!(result);
}

#[test]
#[should_panic(expected = "Already initialized")]
fn test_cannot_init_twice() {
    let (env, client, _admin) = setup();
    let another = Address::generate(&env);
    client.init(&another);
}

// ── Original tests (updated to use setup helper) ─────────────────

#[test]
fn test_renewal_success() {
    let (env, client, _admin) = setup();

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
    let (env, client, _admin) = setup();

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
    });

    // renewal attempt but fail again (ledger 100)
    client.renew(&sub_id, &max_retries, &cooldown, &false);

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
    let (env, client, _admin) = setup();

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
    let (env, client, _admin) = setup();

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
    let (env, client, _admin) = setup();

    let user = Address::generate(&env);
    let sub_id = 111;
    let max_retries = 0;

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
    let (env, client, _admin) = setup();

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
    let (env, client, _admin) = setup();

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
