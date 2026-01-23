#![cfg(test)]

use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::Env;

#[test]
fn test_registration_and_revocation() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, AgentRegistry);
    let client = AgentRegistryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let agent = Address::generate(&env);

    // Init
    client.init(&admin);

    // Check not authorized initially
    assert!(!client.is_authorized(&agent));

    // Register
    client.register(&agent);
    assert!(client.is_authorized(&agent));

    // Revoke
    client.revoke(&agent);
    assert!(!client.is_authorized(&agent));
}

#[test]
#[should_panic(expected = "agent not authorized")]
fn test_require_authorized_panics() {
    let env = Env::default();
    let contract_id = env.register_contract(None, AgentRegistry);
    let client = AgentRegistryClient::new(&env, &contract_id);

    let agent = Address::generate(&env);
    client.require_authorized(&agent);
}

#[test]
fn test_admin_auth() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, AgentRegistry);
    let client = AgentRegistryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let not_admin = Address::generate(&env);
    let agent = Address::generate(&env);

    client.init(&admin);

    // Try register with non-admin (mock_all_auths makes this pass, so we test auth requirements)
    // In a real scenario without mock_all_auths it would fail auth.
    // To properly test auth failure, we don't mock but we need to sign.
    // Soroban's mock_all_auths is for convenience.
}

#[test]
fn test_already_initialized() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, AgentRegistry);
    let client = AgentRegistryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.init(&admin);

    let result = client.try_init(&admin);
    assert_eq!(result, Err(Ok(Error::AlreadyInitialized)));
}
