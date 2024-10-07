/* globals artifacts, hre */

const BN = require("bn.js");
const { signTypedData_v4: signTypedData } = require("eth-sig-util");

const { ethers } = require("hardhat");
const { UINT256_MAX, MANAGER_PAYOUT, EVALUATOR_PAYOUT, WORKER_PAYOUT, INITIAL_FUNDING, SLOT0, SLOT1, SLOT2, ADDRESS_ZERO } = require("./constants");

const { getTokenArgs, web3GetAccounts, getChildSkillIndex, getChainId } = require("./test-helper");

const IColony = artifacts.require("IColony");
const IMetaColony = artifacts.require("IMetaColony");
const ITokenLocking = artifacts.require("ITokenLocking");
const Token = artifacts.require("Token");
const BasicMetaTransaction = artifacts.require("BasicMetaTransaction");
const EtherRouter = artifacts.require("EtherRouter");
const Resolver = artifacts.require("Resolver");
const MetaTxToken = artifacts.require("MetaTxToken");
const IColonyNetwork = artifacts.require("IColonyNetwork");

const TokenAuthority = artifacts.require("contracts/common/TokenAuthority.sol:TokenAuthority");

exports.makeExpenditure = async function makeExpenditure({ colonyNetwork, colony, domainId = 1, skillId, manager, evaluator, worker }) {
  if (colonyNetwork === undefined) {
    const networkAddress = await colony.getColonyNetwork();
    colonyNetwork = await IColonyNetwork.at(networkAddress); // eslint-disable-line no-param-reassign
  }

  if (skillId === undefined) {
    const rootLocalSkillId = await colony.getRootLocalSkill();
    const rootLocalSkill = await colonyNetwork.getSkill(rootLocalSkillId);
    if (rootLocalSkill.children.length > 0) {
      [skillId] = rootLocalSkill.children; // eslint-disable-line no-param-reassign
    } else {
      await colony.addLocalSkill();
      skillId = await colonyNetwork.getSkillCount(); // eslint-disable-line no-param-reassign
    }
  }

  const accounts = await web3GetAccounts();
  manager = manager || accounts[0]; // eslint-disable-line no-param-reassign
  evaluator = evaluator || manager; // eslint-disable-line no-param-reassign
  worker = worker || accounts[2]; // eslint-disable-line no-param-reassign

  // Only Colony admins are allowed to make Expenditures, make the account an admin
  const childSkillIndex = await getChildSkillIndex(colonyNetwork, colony, 1, domainId);
  await colony.setAdministrationRole(1, childSkillIndex, manager, domainId, true);

  const { logs } = await colony.makeExpenditure(1, childSkillIndex, domainId, { from: manager });
  const { expenditureId } = logs.filter((log) => log.event === "ExpenditureAdded")[0].args;

  await colony.setExpenditureRecipients(expenditureId, [SLOT0, SLOT1, SLOT2], [manager, evaluator, worker], { from: manager });
  await colony.setExpenditureSkills(expenditureId, [SLOT2], [skillId], { from: manager });

  return expenditureId;
};

exports.setupFundedExpenditure = async function setupFundedExpenditure({
  colonyNetwork,
  colony,
  domainId,
  skillId,
  manager,
  evaluator,
  worker,
  tokenAddress,
  managerPayout = MANAGER_PAYOUT,
  evaluatorPayout = EVALUATOR_PAYOUT,
  workerPayout = WORKER_PAYOUT,
}) {
  const accounts = await web3GetAccounts();
  manager = manager || accounts[0]; // eslint-disable-line no-param-reassign

  if (tokenAddress === undefined) {
    tokenAddress = await colony.getToken(); // eslint-disable-line no-param-reassign
  }

  const expenditureId = await exports.makeExpenditure({ colonyNetwork, colony, domainId, skillId, manager, evaluator, worker });

  const expenditure = await colony.getExpenditure(expenditureId);
  const childSkillIndex = await getChildSkillIndex(colonyNetwork, colony, 1, expenditure.domainId);
  const moveFundsBetweenPots = colony.methods["moveFundsBetweenPots(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,address)"];
  const totalPayouts = new BN(managerPayout).add(new BN(evaluatorPayout)).add(new BN(workerPayout));

  // Only Colony funders are allowed to fund Expenditures, make the account a funder
  await colony.setFundingRole(1, UINT256_MAX, manager, 1, true);
  await moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, childSkillIndex, 1, expenditure.fundingPotId, totalPayouts, tokenAddress, {
    from: manager,
  });

  await colony.setExpenditurePayouts(expenditureId, [SLOT0, SLOT1, SLOT2], tokenAddress, [managerPayout, evaluatorPayout, workerPayout], {
    from: manager,
  });

  return expenditureId;
};

exports.setupClaimedExpenditure = async function setupClaimedExpenditure({
  colonyNetwork,
  colony,
  domainId,
  skillId,
  manager,
  evaluator,
  worker,
  tokenAddress,
  managerPayout,
  evaluatorPayout,
  workerPayout,
}) {
  const accounts = await web3GetAccounts();
  manager = manager || accounts[0]; // eslint-disable-line no-param-reassign

  if (tokenAddress === undefined) {
    tokenAddress = await colony.getToken(); // eslint-disable-line no-param-reassign
  }

  const expenditureId = await exports.setupFundedExpenditure({
    colonyNetwork,
    colony,
    domainId,
    skillId,
    manager,
    evaluator,
    worker,
    tokenAddress,
    managerPayout,
    evaluatorPayout,
    workerPayout,
  });

  await colony.finalizeExpenditure(expenditureId, { from: manager });
  await colony.claimExpenditurePayout(expenditureId, SLOT0, tokenAddress);
  await colony.claimExpenditurePayout(expenditureId, SLOT1, tokenAddress);
  await colony.claimExpenditurePayout(expenditureId, SLOT2, tokenAddress);
};

exports.giveUserCLNYTokens = async function giveUserCLNYTokens(colonyNetwork, userAddress, amount) {
  const metaColonyAddress = await colonyNetwork.getMetaColony();
  const metaColony = await IMetaColony.at(metaColonyAddress);
  const clnyAddress = await metaColony.getToken();
  const clnyToken = await Token.at(clnyAddress);

  const accounts = await web3GetAccounts();
  await clnyToken.mint(userAddress, amount, { from: accounts[11] });
};

exports.giveUserCLNYTokensAndStake = async function giveUserCLNYTokensAndStake(colonyNetwork, user, _amount) {
  let amount;
  if (web3.utils.isBN(_amount)) {
    amount = _amount;
  } else {
    amount = new BN(_amount);
  }

  const metaColonyAddress = await colonyNetwork.getMetaColony();
  const metaColony = await IMetaColony.at(metaColonyAddress);
  const clnyAddress = await metaColony.getToken();
  const clnyToken = await Token.at(clnyAddress);

  await exports.giveUserCLNYTokens(colonyNetwork, user, amount);
  const tokenLockingAddress = await colonyNetwork.getTokenLocking();
  const tokenLocking = await ITokenLocking.at(tokenLockingAddress);
  await clnyToken.approve(tokenLocking.address, amount, { from: user });
  await tokenLocking.methods["deposit(address,uint256,bool)"](clnyToken.address, amount, true, { from: user });
  await colonyNetwork.stakeForMining(amount, { from: user });
};

exports.fundColonyWithTokens = async function fundColonyWithTokens(colony, token, tokenAmount = INITIAL_FUNDING) {
  // We get input either a plan JS number or a BN.js instance. Ensure we always pass on BN.js
  let tokenAmountBN;
  if (web3.utils.isBN(tokenAmount)) {
    tokenAmountBN = tokenAmount;
  } else {
    tokenAmountBN = new BN(tokenAmount);
  }

  const colonyToken = await colony.getToken();
  if (colonyToken === token.address) {
    await colony.mintTokens(tokenAmountBN);
  } else {
    await token.mint(colony.address, tokenAmountBN);
  }
  await colony.claimColonyFunds(token.address);
};

exports.setupMetaColonyWithLockedCLNYToken = async function setupMetaColonyWithLockedCLNYToken(colonyNetwork) {
  const accounts = await web3GetAccounts();
  const clnyToken = await Token.new("Colony Network Token", "CLNY", 18);
  await colonyNetwork.createMetaColony(clnyToken.address);
  const metaColonyAddress = await colonyNetwork.getMetaColony();
  const metaColony = await IMetaColony.at(metaColonyAddress);
  await metaColony.setNetworkFeeInverse(100);

  const tokenLockingAddress = await colonyNetwork.getTokenLocking();

  // The following are the needed `transfer` function permissions on the locked CLNY that we setup via the TokenAuthority here
  // IColonyNetworkMining: rewardStakers
  // IColony: bootstrapColony, claimPayout and claimRewardPayout
  // ITokenLocking: withdraw, deposit
  const tokenAuthority = await TokenAuthority.new(clnyToken.address, metaColonyAddress, [colonyNetwork.address, tokenLockingAddress]);

  await clnyToken.setAuthority(tokenAuthority.address);
  // Set the CLNY token owner to a dedicated account representing the Colony Multisig
  await clnyToken.setOwner(accounts[11]);

  const locked = await clnyToken.locked();
  assert.isTrue(locked);

  return { metaColony, clnyToken };
};

exports.unlockCLNYToken = async function unlockCLNYToken(metaColony) {
  const clnyAddress = await metaColony.getToken();
  const clny = await Token.at(clnyAddress);

  // Unlock CLNY
  const accounts = await web3GetAccounts();
  await clny.unlock({ from: accounts[11] });
  const isLocked = await clny.locked();
  assert.isFalse(isLocked);

  // Note: In future when starting to work with an unlocked token, ownership can potentially be transferred to MetaColony
  // await clny.setOwner(accounts[11], { from: accounts[11] });
  // Authority could be cleared as well?
  // await clny.setAuthority(0x0, { from: accounts[11] });
};

exports.setupColonyNetwork = async function setupColonyNetwork() {
  const cnAddress = (await EtherRouter.deployed()).address;
  const deployedColonyNetwork = await IColonyNetwork.at(cnAddress);

  // Make a new ColonyNetwork
  const etherRouter = await EtherRouter.new();
  const colonyNetworkResolver = await Resolver.deployed();
  await etherRouter.setResolver(colonyNetworkResolver.address);
  const colonyNetwork = await IColonyNetwork.at(etherRouter.address);

  // Get the version resolver and version number from the metacolony deployed during migration
  const deployedMetaColonyAddress = await deployedColonyNetwork.getMetaColony();
  const deployedMetaColony = await IMetaColony.at(deployedMetaColonyAddress);
  const deployedMetaColonyAsEtherRouter = await EtherRouter.at(deployedMetaColonyAddress);
  const colonyVersionResolverAddress = await deployedMetaColonyAsEtherRouter.resolver();
  const version = await deployedMetaColony.version();

  // Initialise with originally deployed version
  await colonyNetwork.initialise(colonyVersionResolverAddress, version);

  const chainId = await getChainId();
  const miningChainId = parseInt(process.env.MINING_CHAIN_ID, 10) || chainId;
  if (chainId === miningChainId) {
    // Jumping through these hoops to avoid the need to rewire ReputationMiningCycleResolver.
    const reputationMiningCycleResolverAddress = await deployedColonyNetwork.getMiningResolver();
    await colonyNetwork.setMiningResolver(reputationMiningCycleResolverAddress);
  }

  // Get token-locking router from when it was deployed during migrations
  const deployedTokenLockingAddress = await deployedColonyNetwork.getTokenLocking();
  const deployedTokenLockingAsEtherRouter = await EtherRouter.at(deployedTokenLockingAddress);
  const tokenLockingResolverAddress = await deployedTokenLockingAsEtherRouter.resolver();
  const tokenLockingEtherRouter = await EtherRouter.new();
  await tokenLockingEtherRouter.setResolver(tokenLockingResolverAddress);

  await colonyNetwork.setTokenLocking(tokenLockingEtherRouter.address);
  const tokenLocking = await ITokenLocking.at(tokenLockingEtherRouter.address);
  await tokenLocking.setColonyNetwork(colonyNetwork.address);

  return colonyNetwork;
};

exports.setupRandomToken = async function setupRandomToken(lockedToken) {
  const tokenArgs = getTokenArgs();
  const token = await Token.new(...tokenArgs);
  if (!lockedToken) {
    await token.unlock();
  }
  return token;
};

exports.setupRandomColony = async function setupRandomColony(colonyNetwork, lockedToken = false) {
  const token = await exports.setupRandomToken(lockedToken);
  const colony = await exports.setupColony(colonyNetwork, token.address);

  await colony.addLocalSkill();
  const localSkillId = await colonyNetwork.getSkillCount();

  const tokenLockingAddress = await colonyNetwork.getTokenLocking();
  const tokenAuthority = await TokenAuthority.new(token.address, colony.address, [tokenLockingAddress]);
  await token.setAuthority(tokenAuthority.address);

  return { colony, token, localSkillId };
};

exports.setupColony = async function setupColony(colonyNetwork, tokenAddress, version = 0) {
  if (version > 0) {
    const resolverAddress = await colonyNetwork.getColonyVersionResolver(version);
    if (resolverAddress === ADDRESS_ZERO) {
      throw new Error(`No resolver found for version ${version}. Do you need to use deployOldColonyVersion in your test?`);
    }
  }
  const { logs } = await colonyNetwork.createColony(tokenAddress, version, "", "");
  const { colonyAddress } = logs.filter((x) => x.event === "ColonyAdded")[0].args;
  const colony = await IColony.at(colonyAddress);
  return colony;
};

exports.getMetaTransactionParameters = async function getMetaTransactionParameters(txData, userAddress, targetAddress) {
  const contract = await BasicMetaTransaction.at(targetAddress);
  const nonce = await contract.getMetatransactionNonce(userAddress);
  // We should just be able to get the chain id via a web3 call, but until ganache sort their stuff out,
  // we dance around the houses.
  const chainId = await getChainId();

  // Sign data
  const msg = web3.utils.soliditySha3(
    { t: "uint256", v: nonce.toString() },
    { t: "address", v: targetAddress },
    { t: "uint256", v: chainId },
    { t: "bytes", v: txData },
  );
  const sig = await web3.eth.sign(msg, userAddress);

  const r = `0x${sig.substring(2, 66)}`;
  const s = `0x${sig.substring(66, 130)}`;
  const v = parseInt(sig.substring(130), 16);

  return { r, s, v };
};

exports.getPermitParameters = async function getPermitParameters(owner, privateKey, spender, amount, deadline, targetAddress) {
  const contract = await MetaTxToken.at(targetAddress);
  const nonce = await contract.nonces(owner);
  const chainId = await getChainId();
  const name = await contract.name();

  const sigObject = {
    types: {
      EIP712Domain: [
        {
          name: "name",
          type: "string",
        },
        {
          name: "version",
          type: "string",
        },
        {
          name: "chainId",
          type: "uint256",
        },
        {
          name: "verifyingContract",
          type: "address",
        },
      ],
      Permit: [
        {
          name: "owner",
          type: "address",
        },
        {
          name: "spender",
          type: "address",
        },
        {
          name: "value",
          type: "uint256",
        },
        {
          name: "nonce",
          type: "uint256",
        },
        {
          name: "deadline",
          type: "uint256",
        },
      ],
    },
    primaryType: "Permit",
    domain: {
      name,
      version: "1",
      chainId,
      verifyingContract: contract.address,
    },
    message: {
      owner,
      spender,
      value: amount,
      nonce,
      deadline,
    },
  };

  const privateKeyArray = new Uint8Array(Buffer.from(privateKey.slice(2), "hex"));
  const sig = signTypedData(privateKeyArray, { data: sigObject });

  const r = `0x${sig.substring(2, 66)}`;
  const s = `0x${sig.substring(66, 130)}`;
  const v = parseInt(sig.substring(130), 16);

  return { r, s, v };
};

// exports.getEIP712Parameters = async function getEIP712Parameters(privateKey, sigObject, targetAddress) {
exports.getEIP712Parameters = async function getEIP712Parameters(typeString, args, signingAddress, targetAddress) {
  // MakeExpenditure(uint256 domainId,uint256 nonce,uint256 deadline)
  let privateKey;
  for (let i = 0; i < hre.config.networks.hardhat.accounts.length; i += 1) {
    if (ethers.utils.computeAddress(hre.config.networks.hardhat.accounts[i].privateKey) === signingAddress) {
      privateKey = hre.config.networks.hardhat.accounts[i].privateKey;
    }
  }
  if (privateKey === undefined) {
    throw new Error("No private key found for signing address");
  }

  const sigObject = {};
  sigObject.types = {};
  sigObject.domain = {};
  sigObject.message = {};

  const typeName = typeString.split("(")[0];
  sigObject.primaryType = typeName;
  const typeArgs = typeString.split("(")[1].split(")")[0].split(",");

  sigObject.types[typeName] = [];
  for (let i = 0; i < typeArgs.length; i += 1) {
    sigObject.types[typeName].push({
      name: typeArgs[i].split(" ")[1],
      type: typeArgs[i].split(" ")[0],
    });
  }

  for (let i = 0; i < args.length; i += 1) {
    sigObject.message[sigObject.types[typeName][i].name] = args[i];
  }

  const contract = await MetaTxToken.at(targetAddress);

  const nonce = await contract.getMetatransactionNonce(signingAddress);
  const chainId = await getChainId();
  const name = "Colony";

  sigObject.types.EIP712Domain = [
    {
      name: "name",
      type: "string",
    },
    {
      name: "version",
      type: "string",
    },
    {
      name: "verifyingContract",
      type: "address",
    },
    {
      name: "salt",
      type: "bytes32",
    },
  ];

  sigObject.domain.name = name;
  sigObject.domain.version = "1";
  sigObject.domain.salt = ethers.utils.keccak256(ethers.utils.hexZeroPad(`0x${chainId.toString(16)}`, 32));
  sigObject.domain.verifyingContract = contract.address;

  sigObject.message.nonce = nonce;
  const privateKeyArray = new Uint8Array(Buffer.from(privateKey.slice(2), "hex"));
  const sig = signTypedData(privateKeyArray, { data: sigObject });

  const r = `0x${sig.substring(2, 66)}`;
  const s = `0x${sig.substring(66, 130)}`;
  const v = parseInt(sig.substring(130), 16);

  return { r, s, v };
};
