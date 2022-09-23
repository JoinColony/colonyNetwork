# Token Locking (`ITokenLocking`)

This contract supports secure token voting for the Colony Network,
allowing for on-chain token votes to occur without the risk of "double-voting".
Unlike Snapshot, which uses state snapshots to allow for secure voting off-chain,
this contract allows for secure voting on-chain by preventing users from
transferring their tokens until their votes have been cast. Only tokens which
have been deposited in this contract can be used to vote.
