#![no_std]

use soroban_sdk::{
    contract,
    contractevent,
    contractimpl,
    contracttype,
    token,
    xdr::ToXdr,
    Address,
    Bytes,
    Env,
    IntoVal,
};#[contracttype]
#[derive(Clone)]
enum ContractKey {
    Admin,
    Paused,
    FeeConfig,
    LoggingContract,
}    /// Admin function to manage the protocol fee configuration.
    /// `percentage` is in basis points (e.g., 500 = 5%), max 10000.
    pub fn set_fee_config(env: Env, percentage: u32, recipient: Address) {
        Self::require_admin(&env);
        if percentage > 10000 {
            panic!("Fee percentage exceeds 100%");
        }

        let config = FeeConfig { percentage, recipient: recipient.clone() };
        env.storage().instance().set(&ContractKey::FeeConfig, &config);

        FeeConfigUpdated {
            percentage,
            recipient,
        }
        .publish(&env);
    }

    /// Retrieve the current fee configuration
    pub fn get_fee_config(env: Env) -> Option<FeeConfig> {
        env.storage().instance().get(&ContractKey::FeeConfig)
    }

    /// Set the logging contract address. Admin only.
    pub fn set_logging_contract(env: Env, address: Address) {
        Self::require_admin(&env);
        env.storage()
            .instance()
            .set(&ContractKey::LoggingContract, &address);
    }