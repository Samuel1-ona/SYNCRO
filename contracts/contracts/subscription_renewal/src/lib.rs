#![no_std]
use soroban_sdk::{contract, contractevent, contractimpl, contracttype, Address, Env};

/// Storage keys for contract-level state (admin, pause flag).
#[contracttype]
#[derive(Clone)]
enum ContractKey {
    Admin,
    Paused,
}

/// Storage key for approvals: (sub_id, approval_id)
#[contracttype]
#[derive(Clone)]
struct ApprovalKey {
    sub_id: u64,
    approval_id: u64,
}

/// Storage key for cycle-level deduplication per subscription
#[contracttype]
#[derive(Clone)]
struct CycleKey {
    sub_id: u64,
}

/// Storage key for global user caps
#[contracttype]
#[derive(Clone)]
enum UserCapKey {
    UserCap(Address),
    UserSpent(Address),
}

/// Renewal approval bound to subscription, amount, and expiration
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RenewalApproval {
    pub sub_id: u64,
    pub max_spend: i128,
    pub expires_at: u32,
    pub used: bool,
}

/// Represents the current state of a subscription
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SubscriptionState {
    Active,
    Retrying,
    Failed,
    Cancelled,
}

/// Core subscription data stored on-chain
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SubscriptionData {
    pub owner: Address,
    pub merchant: Address,
    pub amount: i128,
    pub frequency: u64,
    pub spending_cap: i128,
    pub integrity_hash: soroban_sdk::BytesN<32>,
    pub state: SubscriptionState,
    pub failure_count: u32,
    pub last_attempt_ledger: u32,
}

/// Events for subscription renewal tracking
#[contractevent]
pub struct RenewalSuccess {
    pub sub_id: u64,
    pub owner: Address,
}

#[contractevent]
pub struct RenewalFailed {
    pub sub_id: u64,
    pub failure_count: u32,
    pub ledger: u32,
}

#[contractevent]
pub struct StateTransition {
    pub sub_id: u64,
    pub new_state: SubscriptionState,
}

#[contractevent]
pub struct PauseToggled {
    pub paused: bool,
}

#[contractevent]
pub struct ApprovalCreated {
    pub sub_id: u64,
    pub approval_id: u64,
    pub max_spend: i128,
    pub expires_at: u32,
}

#[contractevent]
pub struct ApprovalRejected {
    pub sub_id: u64,
    pub approval_id: u64,
    pub reason: u32, // 1=expired, 2=used, 3=amount_exceeded, 4=not_found
}

#[contractevent]
pub struct DuplicateRenewalRejected {
    pub sub_id: u64,
    pub cycle_id: u64,
}

#[contractevent]
pub struct SpendingCapViolated {
    pub sub_id: u64,
    pub amount: i128,
    pub cap: i128,
}

#[contractevent]
pub struct GlobalCapViolated {
    pub owner: Address,
    pub amount: i128,
    pub cap: i128,
}

#[contractevent]
pub struct UserCapUpdated {
    pub user: Address,
    pub cap: i128,
}

#[contract]
pub struct SubscriptionRenewalContract;

#[contractimpl]
impl SubscriptionRenewalContract {
    // ── Admin / Pause management ──────────────────────────────────

    /// Initialize the contract admin. Can only be called once.
    pub fn init(env: Env, admin: Address) {
        if env.storage().instance().has(&ContractKey::Admin) {
            panic!("Already initialized");
        }
        env.storage().instance().set(&ContractKey::Admin, &admin);
        env.storage().instance().set(&ContractKey::Paused, &false);
    }

    /// Internal helper – loads admin and calls `require_auth`.
    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&ContractKey::Admin)
            .expect("Contract not initialized");
        admin.require_auth();
    }

    /// Pause or unpause all renewal execution. Admin only.
    pub fn set_paused(env: Env, paused: bool) {
        Self::require_admin(&env);
        env.storage().instance().set(&ContractKey::Paused, &paused);
        PauseToggled { paused }.publish(&env);
    }

    /// Query the current pause state.
    pub fn is_paused(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&ContractKey::Paused)
            .unwrap_or(false)
    }

    // ── Subscription logic ────────────────────────────────────────

    /// Initialize a subscription
    pub fn init_sub(
        env: Env,
        owner: Address,
        merchant: Address,
        amount: i128,
        frequency: u64,
        spending_cap: i128,
        sub_id: u64,
    ) {
        // Integrity hash calculation will be added in Issue #35
        let integrity_hash = soroban_sdk::BytesN::from_array(&env, &[0u8; 32]);

        let key = sub_id;
        let data = SubscriptionData {
            owner,
            merchant,
            amount,
            frequency,
            spending_cap,
            integrity_hash,
            state: SubscriptionState::Active,
            failure_count: 0,
            last_attempt_ledger: 0,
        };
        env.storage().persistent().set(&key, &data);
    }

    /// Set global spending cap for a user. Admin only.
    pub fn set_user_cap(env: Env, user: Address, cap: i128) {
        Self::require_admin(&env);
        env.storage().persistent().set(&UserCapKey::UserCap(user.clone()), &cap);
        UserCapUpdated { user, cap }.publish(&env);
    }

    /// Get global spending cap for a user.
    pub fn get_user_cap(env: Env, user: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&UserCapKey::UserCap(user))
            .unwrap_or(0)
    }

    /// Get current global spent amount for a user.
    pub fn get_user_spent(env: Env, user: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&UserCapKey::UserSpent(user))
            .unwrap_or(0)
    }

    /// Explicitly cancel a subscription
    pub fn cancel_sub(env: Env, sub_id: u64) {
        let key = sub_id;
        let mut data: SubscriptionData = env
            .storage()
            .persistent()
            .get(&key)
            .expect("Subscription not found");

        data.owner.require_auth();

        if data.state == SubscriptionState::Cancelled {
            panic!("Subscription already cancelled");
        }

        data.state = SubscriptionState::Cancelled;
        env.storage().persistent().set(&key, &data);

        // Emit state transition event
        StateTransition {
            sub_id,
            new_state: SubscriptionState::Cancelled,
        }
        .publish(&env);
    }

    // ── Approval management ───────────────────────────────────────

    /// Create a renewal approval for a subscription
    pub fn approve_renewal(
        env: Env,
        sub_id: u64,
        approval_id: u64,
        max_spend: i128,
        expires_at: u32,
    ) {
        let sub_key = sub_id;
        let data: SubscriptionData = env
            .storage()
            .persistent()
            .get(&sub_key)
            .expect("Subscription not found");

        data.owner.require_auth();

        let approval = RenewalApproval {
            sub_id,
            max_spend,
            expires_at,
            used: false,
        };

        let key = ApprovalKey {
            sub_id,
            approval_id,
        };
        env.storage().persistent().set(&key, &approval);

        ApprovalCreated {
            sub_id,
            approval_id,
            max_spend,
            expires_at,
        }
        .publish(&env);
    }

    /// Validate and consume an approval
    fn consume_approval(env: &Env, sub_id: u64, approval_id: u64, amount: i128) -> bool {
        let key = ApprovalKey {
            sub_id,
            approval_id,
        };

        let approval_opt: Option<RenewalApproval> = env.storage().persistent().get(&key);

        if approval_opt.is_none() {
            ApprovalRejected {
                sub_id,
                approval_id,
                reason: 4,
            }
            .publish(env);
            return false;
        }

        let mut approval = approval_opt.unwrap();

        if approval.used {
            ApprovalRejected {
                sub_id,
                approval_id,
                reason: 2,
            }
            .publish(env);
            return false;
        }

        let current_ledger = env.ledger().sequence();
        if current_ledger > approval.expires_at {
            ApprovalRejected {
                sub_id,
                approval_id,
                reason: 1,
            }
            .publish(env);
            return false;
        }

        if amount > approval.max_spend {
            ApprovalRejected {
                sub_id,
                approval_id,
                reason: 3,
            }
            .publish(env);
            return false;
        }

        approval.used = true;
        env.storage().persistent().set(&key, &approval);
        true
    }

    // ── Renewal logic ─────────────────────────────────────────────

    /// Attempt to renew the subscription.
    /// Returns true if renewal is successful (simulated), false if it failed and retry logic was triggered.
    /// limits: max retries allowed.
    /// cooldown: min ledgers between retries.
    pub fn renew(
        env: Env,
        sub_id: u64,
        approval_id: u64,
        amount: i128,
        max_retries: u32,
        cooldown_ledgers: u32,
        cycle_id: u64,
        succeed: bool,
    ) -> bool {
        // 1. Check global pause
        if Self::is_paused(env.clone()) {
            panic!("Protocol is paused");
        }

        // 2. Load subscription data
        let key = sub_id;
        let mut data: SubscriptionData = env
            .storage()
            .persistent()
            .get(&key)
            .expect("Subscription not found");

        // 3. Check failed state
        if data.state == SubscriptionState::Failed {
            panic!("Subscription is in FAILED state");
        }

        // 4. Cycle guard: reject duplicate renewal for the same billing cycle
        let cycle_key = CycleKey { sub_id };
        let last_cycle: Option<u64> = env.storage().persistent().get(&cycle_key);
        if let Some(last) = last_cycle {
            if cycle_id == last {
                DuplicateRenewalRejected { sub_id, cycle_id }.publish(&env);
                panic!("Duplicate renewal for cycle");
            }
        }

        // 5. Check cooldown
        let current_ledger = env.ledger().sequence();
        if data.failure_count > 0 && current_ledger < data.last_attempt_ledger + cooldown_ledgers {
            panic!("Cooldown period active");
        }

        // 6. Validate and consume approval
        if !Self::consume_approval(&env, sub_id, approval_id, amount) {
            panic!("Invalid or expired approval");
        }

        // 7. Enforce per-subscription spending cap
        if data.spending_cap > 0 && amount > data.spending_cap {
            SpendingCapViolated {
                sub_id,
                amount,
                cap: data.spending_cap,
            }
            .publish(&env);
            panic!("Per-subscription spending cap exceeded");
        }

        // 8. Enforce global user spending cap
        let global_cap: i128 = env
            .storage()
            .persistent()
            .get(&UserCapKey::UserCap(data.owner.clone()))
            .unwrap_or(0);
        if global_cap > 0 {
            let current_spent: i128 = env
                .storage()
                .persistent()
                .get(&UserCapKey::UserSpent(data.owner.clone()))
                .unwrap_or(0);
            if current_spent + amount > global_cap {
                GlobalCapViolated {
                    owner: data.owner.clone(),
                    amount: current_spent + amount,
                    cap: global_cap,
                }
                .publish(&env);
                panic!("Global user spending cap exceeded");
            }
        }

        if succeed {
            // Simulated success - renewal successful
            data.state = SubscriptionState::Active;
            data.failure_count = 0;
            data.last_attempt_ledger = current_ledger;
            env.storage().persistent().set(&key, &data);

            // Store cycle_id on success only
            env.storage().persistent().set(&cycle_key, &cycle_id);

            // Update user global spent
            if global_cap > 0 {
                let current_spent: i128 = env
                    .storage()
                    .persistent()
                    .get(&UserCapKey::UserSpent(data.owner.clone()))
                    .unwrap_or(0);
                env.storage()
                    .persistent()
                    .set(&UserCapKey::UserSpent(data.owner.clone()), &(current_spent + amount));
            }

            // Emit renewal success event
            RenewalSuccess {
                sub_id,
                owner: data.owner.clone(),
            }
            .publish(&env);

            true
        } else {
            // Simulated failure - renewal failed, apply retry logic
            // Do NOT store cycle_id on failure — retries with same cycle_id remain allowed
            data.failure_count += 1;
            data.last_attempt_ledger = current_ledger;

            // Emit renewal failure event
            RenewalFailed {
                sub_id,
                failure_count: data.failure_count,
                ledger: current_ledger,
            }
            .publish(&env);

            // Determine new state based on retry count
            if data.failure_count > max_retries {
                data.state = SubscriptionState::Failed;
                StateTransition {
                    sub_id,
                    new_state: SubscriptionState::Failed,
                }
                .publish(&env);
            } else {
                data.state = SubscriptionState::Retrying;
                StateTransition {
                    sub_id,
                    new_state: SubscriptionState::Retrying,
                }
                .publish(&env);
            }

            env.storage().persistent().set(&key, &data);
            false
        }
    }

    pub fn get_sub(env: Env, sub_id: u64) -> SubscriptionData {
        env.storage()
            .persistent()
            .get(&sub_id)
            .expect("Subscription not found")
    }
}

#[cfg(test)]
mod test;
