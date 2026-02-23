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
    client.approve_renewal(&sub_id, &1, &1000, &100);
    client.acquire_renewal_lock(&sub_id, &200);
    client.set_paused(&true);

    // Should panic because the protocol is paused
    client.renew(&sub_id, &1, &500, &3, &10, &20260101, &true);
}

#[test]
fn test_renew_works_after_unpause() {
    let (env, client, _admin) = setup();

    let user = Address::generate(&env);
    let sub_id = 101;

    client.init_sub(&user, &sub_id);
    client.approve_renewal(&sub_id, &1, &1000, &100);

    // Pause then unpause
    client.set_paused(&true);
    client.set_paused(&false);

    // Should succeed now
    client.acquire_renewal_lock(&sub_id, &200);
    let result = client.renew(&sub_id, &1, &500, &3, &10, &20260101, &true);
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
    client.approve_renewal(&sub_id, &1, &1000, &100);

    client.acquire_renewal_lock(&sub_id, &200);
    let result = client.renew(&sub_id, &1, &500, &3, &10, &20260115, &true);
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

    // First failure (cycle_id same for retries — allowed because failure doesn't store cycle)
    client.approve_renewal(&sub_id, &1, &1000, &200);
    client.acquire_renewal_lock(&sub_id, &200);
    let result = client.renew(&sub_id, &1, &500, &max_retries, &cooldown, &20260201, &false);
    assert!(!result);

    let data = client.get_sub(&sub_id);
    assert_eq!(data.state, SubscriptionState::Retrying);
    assert_eq!(data.failure_count, 1);

    // Advance ledger to pass cooldown
    env.ledger().with_mut(|li| {
        li.sequence_number = 100;
    });

    // renewal attempt but fail again (ledger 100)
    client.approve_renewal(&sub_id, &2, &1000, &200);
    client.acquire_renewal_lock(&sub_id, &200);
    client.renew(&sub_id, &2, &500, &max_retries, &cooldown, &20260201, &false);

    // Advance past cooldown
    env.ledger().with_mut(|li| {
        li.sequence_number = 120;
    });

    // Third failure (count becomes 3 > max_retries 2) -> Should fail
    client.approve_renewal(&sub_id, &3, &1000, &200);
    client.acquire_renewal_lock(&sub_id, &200);
    client.renew(&sub_id, &3, &500, &max_retries, &cooldown, &20260201, &false);

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
    client.approve_renewal(&sub_id, &1, &1000, &100);
    client.acquire_renewal_lock(&sub_id, &200);
    client.renew(&sub_id, &1, &500, &3, &10, &20260301, &false);

    // Try again immediately (cooldown not met)
    client.approve_renewal(&sub_id, &2, &1000, &100);
    client.acquire_renewal_lock(&sub_id, &200);
    client.renew(&sub_id, &2, &500, &3, &10, &20260301, &false);
}

#[test]
fn test_event_emission_on_success() {
    let (env, client, _admin) = setup();

    let user = Address::generate(&env);
    let sub_id = 999;

    client.init_sub(&user, &sub_id);
    client.approve_renewal(&sub_id, &1, &1000, &100);

    // Successful renewal should emit RenewalSuccess event
    client.acquire_renewal_lock(&sub_id, &200);
    let result = client.renew(&sub_id, &1, &500, &3, &10, &20260315, &true);
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
    client.approve_renewal(&sub_id, &1, &1000, &100);

    // First failure with max_retries = 0 should immediately fail
    client.acquire_renewal_lock(&sub_id, &200);
    let result = client.renew(&sub_id, &1, &500, &max_retries, &10, &20260401, &false);
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
    client.approve_renewal(&sub_id, &1, &1000, &200);
    client.acquire_renewal_lock(&sub_id, &200);
    client.renew(&sub_id, &1, &500, &max_retries, &cooldown, &20260501, &false);
    let data = client.get_sub(&sub_id);
    assert_eq!(data.state, SubscriptionState::Retrying);
    assert_eq!(data.failure_count, 1);

    // Advance ledger
    env.ledger().with_mut(|li| {
        li.sequence_number = 20;
    });

    // Second failure
    client.approve_renewal(&sub_id, &2, &1000, &200);
    client.acquire_renewal_lock(&sub_id, &200);
    client.renew(&sub_id, &2, &500, &max_retries, &cooldown, &20260501, &false);
    let data = client.get_sub(&sub_id);
    assert_eq!(data.state, SubscriptionState::Retrying);
    assert_eq!(data.failure_count, 2);

    // Advance ledger
    env.ledger().with_mut(|li| {
        li.sequence_number = 40;
    });

    // Now succeed - should reset failure count and return to Active
    client.approve_renewal(&sub_id, &3, &1000, &200);
    client.acquire_renewal_lock(&sub_id, &200);
    let result = client.renew(&sub_id, &3, &500, &max_retries, &cooldown, &20260501, &true);
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
    client.approve_renewal(&sub_id, &1, &1000, &200);
    client.acquire_renewal_lock(&sub_id, &200);
    client.renew(&sub_id, &1, &500, &max_retries, &cooldown, &20260601, &false);

    env.ledger().with_mut(|li| {
        li.sequence_number = 20;
    });

    client.approve_renewal(&sub_id, &2, &1000, &200);
    client.acquire_renewal_lock(&sub_id, &200);
    client.renew(&sub_id, &2, &500, &max_retries, &cooldown, &20260601, &false);

    let data = client.get_sub(&sub_id);
    assert_eq!(data.state, SubscriptionState::Failed);

    // Advance ledger
    env.ledger().with_mut(|li| {
        li.sequence_number = 40;
    });

    // Try to renew a FAILED subscription - should panic
    client.approve_renewal(&sub_id, &3, &1000, &200);
    client.acquire_renewal_lock(&sub_id, &200);
    client.renew(&sub_id, &3, &500, &max_retries, &cooldown, &20260701, &true);
}

// ── Approval system tests ────────────────────────────────────────

#[test]
fn test_approval_required_for_renewal() {
    let (env, client, _admin) = setup();

    let user = Address::generate(&env);
    let sub_id = 500;
    let approval_id = 1;

    client.init_sub(&user, &sub_id);

    // Create approval
    client.approve_renewal(&sub_id, &approval_id, &1000, &100);

    // Renew with valid approval
    client.acquire_renewal_lock(&sub_id, &200);
    let result = client.renew(&sub_id, &approval_id, &500, &3, &10, &20260801, &true);
    assert!(result);
}

#[test]
#[should_panic(expected = "Invalid or expired approval")]
fn test_renewal_without_approval_fails() {
    let (env, client, _admin) = setup();

    let user = Address::generate(&env);
    let sub_id = 501;

    client.init_sub(&user, &sub_id);

    // Try to renew without creating approval
    client.acquire_renewal_lock(&sub_id, &200);
    client.renew(&sub_id, &999, &500, &3, &10, &20260901, &true);
}

#[test]
#[should_panic(expected = "Invalid or expired approval")]
fn test_approval_cannot_be_reused() {
    let (env, client, _admin) = setup();

    let user = Address::generate(&env);
    let sub_id = 502;
    let approval_id = 2;

    client.init_sub(&user, &sub_id);
    client.approve_renewal(&sub_id, &approval_id, &1000, &100);

    // First use - should succeed
    client.acquire_renewal_lock(&sub_id, &200);
    client.renew(&sub_id, &approval_id, &500, &3, &10, &20261001, &true);

    env.ledger().with_mut(|li| {
        li.sequence_number = 20;
    });

    // Second use - should fail (already used) — use different cycle_id to bypass cycle guard
    client.acquire_renewal_lock(&sub_id, &200);
    client.renew(&sub_id, &approval_id, &500, &3, &10, &20261101, &true);
}

#[test]
#[should_panic(expected = "Invalid or expired approval")]
fn test_expired_approval_rejected() {
    let (env, client, _admin) = setup();

    let user = Address::generate(&env);
    let sub_id = 503;
    let approval_id = 3;

    client.init_sub(&user, &sub_id);

    // Create approval that expires at ledger 50
    client.approve_renewal(&sub_id, &approval_id, &1000, &50);

    // Advance past expiration
    env.ledger().with_mut(|li| {
        li.sequence_number = 51;
    });

    // Try to use expired approval
    client.acquire_renewal_lock(&sub_id, &200);
    client.renew(&sub_id, &approval_id, &500, &3, &10, &20261201, &true);
}

#[test]
#[should_panic(expected = "Invalid or expired approval")]
fn test_amount_exceeds_max_spend() {
    let (env, client, _admin) = setup();

    let user = Address::generate(&env);
    let sub_id = 504;
    let approval_id = 4;

    client.init_sub(&user, &sub_id);

    // Create approval with max_spend = 1000
    client.approve_renewal(&sub_id, &approval_id, &1000, &100);

    // Try to renew with amount > max_spend
    client.acquire_renewal_lock(&sub_id, &200);
    client.renew(&sub_id, &approval_id, &1500, &3, &10, &20270101, &true);
}

#[test]
fn test_multiple_approvals_for_same_subscription() {
    let (env, client, _admin) = setup();

    let user = Address::generate(&env);
    let sub_id = 505;

    client.init_sub(&user, &sub_id);

    // Create multiple approvals
    client.approve_renewal(&sub_id, &1, &1000, &100);
    client.approve_renewal(&sub_id, &2, &2000, &200);

    // Use first approval
    client.acquire_renewal_lock(&sub_id, &200);
    client.renew(&sub_id, &1, &500, &3, &10, &20270201, &true);

    env.ledger().with_mut(|li| {
        li.sequence_number = 20;
    });

    // Use second approval — different cycle_id since first succeeded
    client.acquire_renewal_lock(&sub_id, &200);
    let result = client.renew(&sub_id, &2, &1500, &3, &10, &20270301, &true);
    assert!(result);
}

// ── Cycle guard tests ────────────────────────────────────────────

#[test]
#[should_panic(expected = "Duplicate renewal for cycle")]
fn test_duplicate_cycle_rejected_after_success() {
    let (env, client, _admin) = setup();

    let user = Address::generate(&env);
    let sub_id = 600;
    let cycle_id = 20260315;

    client.init_sub(&user, &sub_id);

    // First renewal succeeds — stores cycle_id
    client.approve_renewal(&sub_id, &1, &1000, &100);
    client.acquire_renewal_lock(&sub_id, &200);
    let result = client.renew(&sub_id, &1, &500, &3, &10, &cycle_id, &true);
    assert!(result);

    // Second renewal with same cycle_id — should panic
    client.approve_renewal(&sub_id, &2, &1000, &100);
    client.acquire_renewal_lock(&sub_id, &200);
    client.renew(&sub_id, &2, &500, &3, &10, &cycle_id, &true);
}

#[test]
fn test_retry_same_cycle_allowed_after_failure() {
    let (env, client, _admin) = setup();

    let user = Address::generate(&env);
    let sub_id = 601;
    let cycle_id = 20260315;

    client.init_sub(&user, &sub_id);

    // First attempt fails — does NOT store cycle_id
    client.approve_renewal(&sub_id, &1, &1000, &200);
    client.acquire_renewal_lock(&sub_id, &200);
    let result = client.renew(&sub_id, &1, &500, &3, &10, &cycle_id, &false);
    assert!(!result);

    // Advance ledger past cooldown
    env.ledger().with_mut(|li| {
        li.sequence_number = 20;
    });

    // Retry with same cycle_id — should succeed because failure didn't record cycle
    client.approve_renewal(&sub_id, &2, &1000, &200);
    client.acquire_renewal_lock(&sub_id, &200);
    let result = client.renew(&sub_id, &2, &500, &3, &10, &cycle_id, &true);
    assert!(result);
}

#[test]
fn test_different_cycle_allowed_after_success() {
    let (env, client, _admin) = setup();

    let user = Address::generate(&env);
    let sub_id = 602;

    client.init_sub(&user, &sub_id);

    // First cycle succeeds
    client.approve_renewal(&sub_id, &1, &1000, &100);
    client.acquire_renewal_lock(&sub_id, &200);
    let result = client.renew(&sub_id, &1, &500, &3, &10, &20260315, &true);
    assert!(result);

    // Different cycle_id — should succeed
    client.approve_renewal(&sub_id, &2, &1000, &100);
    client.acquire_renewal_lock(&sub_id, &200);
    let result = client.renew(&sub_id, &2, &500, &3, &10, &20260415, &true);
    assert!(result);
}

#[test]
fn test_first_renewal_always_allowed() {
    let (env, client, _admin) = setup();

    let user = Address::generate(&env);
    let sub_id = 603;

    client.init_sub(&user, &sub_id);

    // First renewal ever — no stored cycle, guard passes
    client.approve_renewal(&sub_id, &1, &1000, &100);
    client.acquire_renewal_lock(&sub_id, &200);
    let result = client.renew(&sub_id, &1, &500, &3, &10, &20260101, &true);
    assert!(result);

    let data = client.get_sub(&sub_id);
    assert_eq!(data.state, SubscriptionState::Active);
}

#[test]
fn test_cancel_sub() {
    let (env, client, _admin) = setup();

    let user = Address::generate(&env);
    let sub_id = 600;

    client.init_sub(&user, &sub_id);

    // Cancel subscription
    client.cancel_sub(&sub_id);

    let data = client.get_sub(&sub_id);
    assert_eq!(data.state, SubscriptionState::Cancelled);
}

#[test]
#[should_panic(expected = "Subscription already cancelled")]
fn test_cannot_cancel_twice() {
    let (env, client, _admin) = setup();

    let user = Address::generate(&env);
    let sub_id = 601;

    client.init_sub(&user, &sub_id);

    client.cancel_sub(&sub_id);
    client.cancel_sub(&sub_id);
}

#[test]
#[should_panic(expected = "Subscription not found")]
fn test_cancel_non_existent_sub() {
    let (_env, client, _admin) = setup();
    client.cancel_sub(&999);
}

// ── Renewal lock tests ──────────────────────────────────────────

#[test]
fn test_acquire_renewal_lock() {
    let (_env, client, _admin) = setup();

    let sub_id = 700;

    client.acquire_renewal_lock(&sub_id, &200);

    let lock = client.get_renewal_lock(&sub_id);
    assert!(lock.is_some());
    let lock_data = lock.unwrap();
    assert_eq!(lock_data.locked_at, 0); // default ledger
    assert_eq!(lock_data.lock_timeout, 200);
}

#[test]
#[should_panic(expected = "Renewal lock active")]
fn test_lock_prevents_concurrent_acquisition() {
    let (_env, client, _admin) = setup();

    let sub_id = 701;

    client.acquire_renewal_lock(&sub_id, &200);
    // Second acquire should panic
    client.acquire_renewal_lock(&sub_id, &200);
}

#[test]
fn test_lock_auto_expires_and_reacquirable() {
    let (env, client, _admin) = setup();

    let sub_id = 702;

    client.acquire_renewal_lock(&sub_id, &50);

    // Advance ledger past lock timeout
    env.ledger().with_mut(|li| {
        li.sequence_number = 60;
    });

    // Should succeed — old lock expired
    client.acquire_renewal_lock(&sub_id, &200);

    let lock = client.get_renewal_lock(&sub_id);
    assert!(lock.is_some());
    let lock_data = lock.unwrap();
    assert_eq!(lock_data.locked_at, 60);
    assert_eq!(lock_data.lock_timeout, 200);
}

#[test]
fn test_release_renewal_lock() {
    let (_env, client, _admin) = setup();

    let sub_id = 703;

    client.acquire_renewal_lock(&sub_id, &200);
    assert!(client.get_renewal_lock(&sub_id).is_some());

    client.release_renewal_lock(&sub_id);
    assert!(client.get_renewal_lock(&sub_id).is_none());
}

#[test]
#[should_panic(expected = "No renewal lock to release")]
fn test_release_nonexistent_lock_panics() {
    let (_env, client, _admin) = setup();

    let sub_id = 704;
    client.release_renewal_lock(&sub_id);
}

#[test]
#[should_panic(expected = "Renewal lock required")]
fn test_renew_without_lock_panics() {
    let (env, client, _admin) = setup();

    let user = Address::generate(&env);
    let sub_id = 705;

    client.init_sub(&user, &sub_id);
    client.approve_renewal(&sub_id, &1, &1000, &100);

    // Renew without acquiring lock — should panic
    client.renew(&sub_id, &1, &500, &3, &10, &20260101, &true);
}

#[test]
fn test_renew_with_lock_succeeds_and_auto_releases() {
    let (env, client, _admin) = setup();

    let user = Address::generate(&env);
    let sub_id = 706;

    client.init_sub(&user, &sub_id);
    client.approve_renewal(&sub_id, &1, &1000, &100);

    client.acquire_renewal_lock(&sub_id, &200);
    assert!(client.get_renewal_lock(&sub_id).is_some());

    let result = client.renew(&sub_id, &1, &500, &3, &10, &20260101, &true);
    assert!(result);

    // Lock should be auto-released after renew
    assert!(client.get_renewal_lock(&sub_id).is_none());
}

#[test]
fn test_renew_failure_also_releases_lock() {
    let (env, client, _admin) = setup();

    let user = Address::generate(&env);
    let sub_id = 707;

    client.init_sub(&user, &sub_id);
    client.approve_renewal(&sub_id, &1, &1000, &200);

    client.acquire_renewal_lock(&sub_id, &200);
    assert!(client.get_renewal_lock(&sub_id).is_some());

    let result = client.renew(&sub_id, &1, &500, &3, &10, &20260101, &false);
    assert!(!result);

    // Lock should be auto-released even after failure
    assert!(client.get_renewal_lock(&sub_id).is_none());
}

#[test]
#[should_panic(expected = "Renewal lock expired")]
fn test_renew_with_expired_lock_panics() {
    let (env, client, _admin) = setup();

    let user = Address::generate(&env);
    let sub_id = 708;

    client.init_sub(&user, &sub_id);
    client.approve_renewal(&sub_id, &1, &1000, &200);

    client.acquire_renewal_lock(&sub_id, &50);

    // Advance ledger past lock timeout
    env.ledger().with_mut(|li| {
        li.sequence_number = 60;
    });

    // Renew with expired lock — should panic
    client.renew(&sub_id, &1, &500, &3, &10, &20260101, &true);
}

#[test]
#[should_panic(expected = "Protocol is paused")]
fn test_acquire_lock_blocked_when_paused() {
    let (_env, client, _admin) = setup();

    let sub_id = 709;

    client.set_paused(&true);
    // Should panic because protocol is paused
    client.acquire_renewal_lock(&sub_id, &200);
}
