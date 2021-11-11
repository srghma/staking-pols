    "@codechecks/client": "^0.1.11", various
1   "@commitlint/cli": "^13.1.0",
2   "cz-conventional-changelog": "^3.3.0",
    "fs-extra": "^10.0.0", hard?
    "solhint": "^3.3.6", e hint, mythx global?


# Staking Contract with Time-based Rewards

## Overview

This repo implements a basic staking!!! contract with some added functionality for stake-time based rewards.

This staking contract shall eventually! be the basis for an improved incentive mechanism for a rewards-based lottery ticket allocation.

lottery ticket allocation on bl?
---

## Deployment Parameter

At time of deployment, the "contract address of the token which can be staked" needs to be provided as well as the "time" (in seconds) the "staked token shall be locked".

After deployment, (optionally) a "ERC20 rewards token"????TODO can be set and "reward tokens" provided to the contract, which can be claimed later by the users.

with what fn?
---

## User functions (Basic features)

### stake(amount)

Deposit the specified amount of POLS! token into the staking contract. In our context POLS is the "staking token".

The user has to approve POLS token first by calling the `approve()`! function on the POLS ERC20 token contract, before he can call the stake function.

Every time a user stakes token, either for the first time or adding tokens later, a **new lockTimePeriod starts**.

The **`unlockTime` will be calculcalted** at the time of staking (current time + **`lockTimePeriod`**) and stored for every user individually.

### stakeAmount_msgSender() returns (uint256 amount)

Returns the amount of staked token (POLS) for `msg.sender`

### stakeTime_msgSender() returns (uint time)
 why needed
Returns the unix epoch time (in seconds) when the user executed a transaction (stake or unstake???) the last time.

### ! getUnlockTime_msgSender returns (uint time)

Returns the time when the user's token will be unlocked and can be withdrawn.

### withdraw(uint256 amount) returns (uint256 amount)

If `lockTimePeriod` had been set, lockTimePeriod !has to be expired! since the last `stake` transaction, before the staked tokens can be **withdrawn**.

There is no need for the user to explicitly 'unlock' the staked token, they will 'automatically' be unlocked after the `lockTimePeriod` expired.
ok
`withdraw(amount)`, return `amount` staked tokens to the user's account.

The lock period will not be extended, unlock time will stay unchanged.
ok only stake
All internal rewards??? will stay within the contract.???

### withdrawAll() returns (uint256 amount)

As `withdraw(amount)`, but all staked tokens will be returned to the user's account.

---

## User Reward functions

While the user has staked token, 'internal rewards'!!! are being earned.

`stakeRewardEndTime` defines the time when **reward scheme ends** and no more 'internal rewards' are being earned for staking token.

### userClaimableRewards_msgSender() returns (uint256 amount)

Over time the user earns 'internal rewards' which are (to begin with) only tracked internally within the contract.
`userClaimableRewards` is the ongoing **reward allocation = amount of staked token \* the time since the last stake/unstake** transaction was executed.

### userAccumulatedRewards_msgSender() returns (uint256 amount)

**Whenever the staking amount changes**, the past earned rewards (= `userClaimableRewards`) are being added to `userAccumulatedRewards`. Then the **`stakeTime`** is reset to the current time, and `userClaimableRewards` are being calculated anew based on the new time period \* new staked token amount.

### userTotalRewards_msgSender() returns (uint256 amount)

`userTotalRewards` is just the sum of `userAccumulatedRewards` and `userClaimableRewards`

### claim()

Calculates the amount of reward tokens for `msg.sender` based on `userTotalRewards / stakeRewardFactor!!!`.

If enough reward tokens are within the contract, the 'reward tokens' are being transferred to the account of `msg.sender`.

After `claim` all 'internal rewards' have been converted to reward tokens and **`userAccumulatedRewards` as well as `userClaimableRewards` will be 0 thereafter**.

---

## Admin functions

The deployer account is being assigned the `DEFAULT_ADMIN_ROLE` which is allowed to execute various administrative functions.

### setLockTimePeriod(uint48 \_lockTimePeriod)

Sets the time (in seconds) a user has to wait **after the last stake transaction** until he can withdraw the staked tokens.

`lockTimePeriod` can be changed any time and there are no restrictions to the value.

As `unlockTime` **will be calculcalted at the time of staking** (current time + `lockTimePeriod`) and stored for every user individually, `lockTimePeriod` can be changed while users have staked token, but it will only affect stakes after `lockTimePeriod` has been changed.

### setRewardToken(address)

Specify the contract address of a ERC20 reward token.

Setting it to `address(0)` (obviously) prevents user from claiming reward tokens.

If the contract holds an amoun of a previous rewards token, that amount will be transferred to the `msg.sender` who has to own the `DEFAULT_ADMIN_ROLE`.

If the previous rewards token is identical to the staking token, then only the difference between the contract balance and the total staked amount is returned.

### setStakeRewardFactor(uint256)

The 'internal rewards' points are just accumulated `stakeAmount` \* `stakeTime`.

Example **1000 POLS token staked for 1 day** : 1000 \* 24 \* 60 \* 60 = 604800000

(This example assumes that stake token uses the same decimals as reward token, **otherwise it has to be accounted for when setting `stakeRewardFactor`.**???)

If 1000 is being set as `setStakeRewardFactor` then a user will able to claim/mint **1 reward token** after staking 1000 staking token for 1 week.

A user would also be able to claim/mint 1 reward token after staking 7000 staking token for 1 day.

### setStakeRewardEndTime(uint48 time)

Set the time when the reward scheme ends and no more 'internal rewards' are being earned for staking token.

---

### External Contract functions

### burnRewards(address from, uint256 amount) public onlyRole(BURNER_ROLE)

`burnRewards()` allows an external contract which has been assigned the `BURNER_ROLE` to **subtract a certain amount of 'internal rewards' of a specified account**.

This would allow the token sale contract to reduce the amount of 'internal rewards' of a user who was successful to claim a token allocation.???
If the **probability to win the token lottery is based on the 'internal rewards'**???, burning internal rewards can be used to setup a mechnism to decrease the chance of a user to win again (who just won and received a token allocation).

so this func is exec every time after each successfull allocation? I thought they execlude users who just won in the lottery gem

===============================================================================

# Project Setup

The Solidity template from [@paulrberg](https://github.com/paulrberg) was used to initialize this project.

https://github.com/paulrberg/solidity-template

- [Hardhat](https://github.com/nomiclabs/hardhat): compile and run the smart contracts on a local development network
- [TypeChain](https://github.com/ethereum-ts/TypeChain): generate TypeScript types for smart contracts
- [Ethers](https://github.com/ethers-io/ethers.js/): renowned Ethereum library and wallet implementation
- [Waffle](https://github.com/EthWorks/Waffle): tooling for writing comprehensive smart contract tests
- [Solhint](https://github.com/protofire/solhint): linter
- [Solcover](https://github.com/sc-forks/solidity-coverage): code coverage
- [Prettier Plugin Solidity](https://github.com/prettier-solidity/prettier-plugin-solidity): code formatter

## Usage

### Pre Requisites

Before running any command, make sure to install dependencies:

```sh
$ yarn install
```

### Compile

Compile the smart contracts with Hardhat:

```sh
$ yarn compile
```

### TypeChain

Compile the smart contracts and generate TypeChain artifacts:

```sh
$ yarn typechain
```

### Lint Solidity

Lint the Solidity code:

```sh
$ yarn lint:sol
```

### Lint TypeScript

Lint the TypeScript code:

```sh
$ yarn lint:ts
```

### Test

Run the Mocha tests on hardhat:

```sh
$ yarn test
```

Run the Mocha tests on a test blockchain:

Currently configured (in `hardhat.config.ts`) :

- mainnet (Ethereum)
- ganache
- goerli
- kovan
- rinkeby
- ropsten
- moonDev
- moonAlpha

```sh
$ yarn test --network <network>
```

### Coverage

Generate the code coverage report:

```sh
$ yarn coverage
```

### Report Gas

See the gas usage per unit test and average gas per method call:

```sh
$ REPORT_GAS=true yarn test
```

### Clean

Delete the smart contract artifacts, the coverage reports and the Hardhat cache:

```sh
$ yarn clean
```

### Deploy

Deploy the contracts to Hardhat Network:

```sh
$ yarn deploy
```

Deploy the contracts to a specific network, such as the Ropsten testnet:

```sh
$ yarn deploy --network kovan
```

Deploy the contracts to a specific main network, providing a private key:

```sh
$ MAINNET_PRIVATE_KEY=0xe15.... yarn deploy --network ethMain
```

### Flatten

```sh
$ yarn flatten
```

Will flatten `PolsStake.sol` and write the result file `contracts_flat/PolsStake_flat.sol`

### Audit

```sh
$ yarn audit
```

Will execute `slither` contract audit.

## Syntax Highlighting

If you use VSCode, you can enjoy syntax highlighting for your Solidity code via the
[vscode-solidity](https://github.com/juanfranblanco/vscode-solidity) extension. The recommended approach to set the
compiler version is to add the following fields to your VSCode user settings:

```json
{
  "solidity.compileUsingRemoteVersion": "v0.8.4+commit.c7e474f2",
  "solidity.defaultCompiler": "remote"
}
```

Where of course `v0.8.4+commit.c7e474f2` can be replaced with any other version.
