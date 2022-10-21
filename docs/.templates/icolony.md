# Colony (`IColony`)

The main body of functionality of a colony. If extensions can be thought of
as "applications", providing specific functionality, then this contract can
be thought of as the "operating system", providing "system calls" for managing
a colony's underlying resources, such as managing roles & permissions,
creating new domains and expenditures, and moving resources throughout a
colony. Extensions express their functionality by calling these functions
on the colony on which they are installed, and users with the proper
permissions can call these functions directly.
