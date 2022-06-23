# One Transaction Payment Extension (`OneTxPayment`)

Ordinarily payments require more than one transaction, because the payment lifecycle requires more than one permissioned [role](/colonynetwork/docs-modular-permissions).

In some use cases, there might be a need for one authorized individual to be able to create, funds, and finalize a payment within a single transaction.

The `OneTxPayment` extension adds this functionality by adding a `makePayment` function which requires the caller to have *both* `Funding` and administration ability within the domain of the payment.

Extension therefore requires `Administration` and `Funding` roles to function.

_Note: if you deployed your Colony using the Dapp, the `OneTxPayment` extension is already installed for you_
