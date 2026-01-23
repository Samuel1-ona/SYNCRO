#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, Symbol,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Agent(Address),
}

#[contract]
pub struct AgentRegistry;

#[contractimpl]
impl AgentRegistry {
    /// Initialize the contract with an admin address.
    pub fn init(env: Env, admin: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        Ok(())
    }

    /// Register a new agent. Admin only.
    pub fn register(env: Env, agent: Address) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        env.storage()
            .persistent()
            .set(&DataKey::Agent(agent.clone()), &true);

        env.events()
            .publish((symbol_short!("agent"), symbol_short!("reg")), agent);

        Ok(())
    }

    /// Revoke an agent's authorization. Admin only.
    pub fn revoke(env: Env, agent: Address) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        env.storage()
            .persistent()
            .remove(&DataKey::Agent(agent.clone()));

        env.events()
            .publish((symbol_short!("agent"), symbol_short!("rev")), agent);

        Ok(())
    }

    /// Check if an agent is authorized.
    pub fn is_authorized(env: Env, agent: Address) -> bool {
        env.storage().persistent().has(&DataKey::Agent(agent))
    }

    /// Panic if an agent is not authorized.
    pub fn require_authorized(env: Env, agent: Address) {
        if !Self::is_authorized(env, agent) {
            panic!("agent not authorized");
        }
    }
}

mod test;
