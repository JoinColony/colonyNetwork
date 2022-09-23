# Reputation Mining Cycle (`IReputationMiningCycle`)

Used to manage the Colony Network reputation mining process. Short-lived
contracts, each instance exists to support a single mining cycle, and exists
in two phases: a first "inactive" phase, and a second, "active" phase.
During the inactive phase, the contract stores all reputation updates which
occur during that cycle. In the active phase, miners use the contents of the
log (now closed for updates) to calculate and submit the new reputation state.
