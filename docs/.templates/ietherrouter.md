# Ether Router (`IEtherRouter`)

Ether Router is an internal contract used to implement upgradability. A
proxy contract, this contract provides consistent storage while allowing for
function calls to be dispatched to other contracts. This allows for a colony's
state to remain constant while upgrading the function logic available to users.
