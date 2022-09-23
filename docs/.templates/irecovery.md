# Recovery (`IRecovery`)

This internal contract provides recovery functionality to both colonies and
the Colony Network. It implements logic for assinging the "recovery" role
to various addresses as well as for entering "recovery mode", a special state
which allows for direct writes to a colony's underlying storage, meant to
allow for recovery in case of critical bugs or security failures.
