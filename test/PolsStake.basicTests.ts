import hre from "hardhat";

// https://www.chaijs.com/guide/styles/#expect
// https://www.chaijs.com/api/bdd/
// https://ethereum-waffle.readthedocs.io/en/latest/matchers.html
import { expect } from "chai";

import { BigNumber, BigNumberish } from "ethers";

// https://docs.ethers.io/v5/api/utils/bignumber/
// const { BigNumber } = hre.ethers;

const DECIMALS = 18;
const DECMULBN = BigNumber.from(10).pow(DECIMALS);
const stakeAmount = DECMULBN.mul(1000); // 1000 token

export function basicTests(_timePeriod: number): void {
  const timePeriod = _timePeriod;
  console.log("timePeriod =", timePeriod, "seconds");

  const stakeRewardFactor = 5 * timePeriod * 1000; // 1 reward token for staking 1000 stake token for 5 periods
  const LOCK_TIME_PERIOD = 7 * timePeriod; // TODO get from PolsStake.ts

  let userClaimableRewards_contract = BigNumber.from(0); // typeof BigNumber; // causes problems with solidity-coverage
  let stakeTokenDecimals: number;
  let rewardTokenDecimals: number;

  describe("basicTests", function () {
    it("stake token should have 18 decimals", async function () {
      stakeTokenDecimals = await this.stakeToken.decimals();
      expect(stakeTokenDecimals).to.equal(DECIMALS);
    });

    it("reward token should have 18 decimals", async function () {
      rewardTokenDecimals = await this.rewardToken.decimals();
      expect(rewardTokenDecimals).to.equal(DECIMALS);
    });

    it("get lockTime from stake contracts", async function () {
      const lockTimePeriod = await this.stake.lockTimePeriod();
      expect(lockTimePeriod).to.equal(LOCK_TIME_PERIOD);
    });

    it("send stake token from admin account to user1 account", async function () {
      const amount = "10000" + "0".repeat(18);

      const tx = await this.stakeToken.connect(this.signers.admin).transfer(this.signers.user1.address, amount);
      await tx.wait();

      const balance = await this.stakeToken.balanceOf(this.signers.user1.address);
      console.log("user1 : stakeToken balance = ", hre.ethers.utils.formatUnits(balance, stakeTokenDecimals));
      expect(balance).to.equal(amount);
    });

    it("user1 should have some stake tokens", async function () {
      const amount = "10000" + "0".repeat(18);
      // no transfer of stake token to user1 here
      const balance = await this.stakeToken.balanceOf(this.signers.user1.address);
      console.log("user1 : stakeToken balance = ", hre.ethers.utils.formatUnits(balance, stakeTokenDecimals));
      expect(balance).to.equal(amount);
    });

    it("deploy a reward token and mint some token to admin account", async function () {
      const balance = await this.rewardToken.balanceOf(this.signers.admin.address);
      console.log("reward token balance of admin =", hre.ethers.utils.formatUnits(balance, rewardTokenDecimals));
      expect(balance).to.gte(hre.ethers.utils.parseUnits("1000.0", rewardTokenDecimals));
    });

    it("user1 should have no rewards token", async function () {
      const balance = await this.rewardToken.balanceOf(this.signers.user1.address);
      console.log("reward token balance of user1 = ", balance.toString());
      expect(balance).to.equal(0);
    });

    it("send 1000 reward tokens from admin account to staking contract", async function () {
      const amount = hre.ethers.utils.parseUnits("1000.0", rewardTokenDecimals);

      const tx = await this.rewardToken.connect(this.signers.admin).transfer(this.stake.address, amount);
      await tx.wait();

      const balance = await this.rewardToken.balanceOf(this.stake.address);
      console.log(
        "staking contract reward token balance = ",
        hre.ethers.utils.formatUnits(balance, rewardTokenDecimals),
      );
      expect(balance).to.equal(amount);
    });

    it("decrease lock time period - setLockTimePeriod()", async function () {
      const lockTimePeriod = await this.stake.lockTimePeriod();
      console.log("current lockTimePeriod =", lockTimePeriod);

      const tx = await this.stake.connect(this.signers.admin).setLockTimePeriod(lockTimePeriod - 1); // reduce by 1 second
      await tx.wait();

      const result = await this.stake.lockTimePeriod();
      console.log("lockTimePeriod (seconds) = ", result.toString());
      expect(result).to.equal(lockTimePeriod - 1);
    });

    it("increase lock time period - setLockTimePeriod() - should revert", async function () {
      await expect(this.stake.connect(this.signers.admin).setLockTimePeriod(14 * timePeriod)).to.be.reverted; // TODO : does not work with remote RPC blockchain
    });

    it("setRewardToken()", async function () {
      const tx = await this.stake.connect(this.signers.admin).setRewardToken(this.rewardToken.address);
      await tx.wait();

      const rewardToken_address = await this.stake.rewardToken();
      console.log("this.stake.rewardToken() = ", rewardToken_address);
      expect(rewardToken_address).to.equal(this.rewardToken.address);
    });

    it("setStakeRewardFactor()", async function () {
      const tx = await this.stake.connect(this.signers.admin).setStakeRewardFactor(stakeRewardFactor);
      await tx.wait();

      const result = await this.stake.stakeRewardFactor();
      console.log("stakeRewardFactor = ", result.toString());
      expect(result).to.equal(stakeRewardFactor);
    });
  });

  /**
   * @notice testing full staking cycle
   */

  describe("test stake & unstake, time lock and rewards", function () {
    let timeNow: number; // number type makes time calculations easier
    let startTime: number; // time when the test starts
    let timeRelative: number; // will store time relative to start time
    let blocktime: number;
    let stakeBalance = BigNumber.from(0);
    let difference = BigNumber.from(0);
    let user1BalanceStart = BigNumber.from(0);

    /**
     * @dev helper function to get block.timestamp from hardhat provider
     * @returns block.timestamp in unix epoch time (seconds)
     */
    const blockTimestamp = async (): Promise<number> => {
      const blockNumber = await hre.ethers.provider.getBlockNumber();
      return (await hre.ethers.provider._getBlock(blockNumber)).timestamp;
    };

    /**
     * @dev helper function for hardhat local blockchain to move time
     * @param timeAmount in seconds blockchain time should move forward
     */
    const moveTime = async (timeAmount: number): Promise<number> => {
      console.log("Jumping ", timeAmount, "seconds into the future ...");
      await hre.ethers.provider.send("evm_increaseTime", [timeAmount]);
      await hre.ethers.provider.send("evm_mine", []);
      const blockNumber = await hre.ethers.provider.getBlockNumber();
      const timeNow = (await hre.ethers.provider._getBlock(blockNumber)).timestamp;
      console.log("moveTime : timeNow =", timeNow);
      console.log("----------------------------------------------------------------------------");
      return timeNow;
    };

    const getTimestamp = async (): Promise<number> => {
      let currentTime: number;
      if (hre.network.name == "hardhat") {
        currentTime = await blockTimestamp();
      } else {
        currentTime = Math.floor(Date.now() / 1000);
      }
      return currentTime;
    };

    /**
     * @dev move time forward on hardhat
     * @dev just wait if on a "real" blockchain
     * @param timeAmount in seconds blockchain time should move forward
     */
    const waitTime = async (timeAmount: number): Promise<number> => {
      let newTime: number;
      if (hre.network.name == "hardhat") {
        newTime = await moveTime(timeAmount);
      } else {
        await new Promise(f => setTimeout(f, timeAmount * 1000));
        newTime = Math.floor(Date.now() / 1000);
      }
      return newTime;
    };

    /**
     * @notice testing full staking & reward round-trip
     */

    it("user approves stake token & balance check", async function () {
      startTime = await getTimestamp();
      console.log("startTime =", startTime);

      user1BalanceStart = await this.stakeToken.balanceOf(this.signers.user1.address);
      console.log("user1Balance =", hre.ethers.utils.formatUnits(user1BalanceStart, stakeTokenDecimals));

      const tx = await this.stakeToken.connect(this.signers.user1).approve(this.stake.address, user1BalanceStart);
      await tx.wait();

      // at this time the balance of the stake token in the contract should be 0
      stakeBalance = await this.stake.stakeAmount(this.signers.user1.address);
      expect(stakeBalance).to.equal(0, "user should have a stake balance of 0");
    });

    it("user can stake token", async function () {
      console.log("staking now ... stakeAmount =", hre.ethers.utils.formatUnits(stakeAmount, stakeTokenDecimals));

      const tx = await this.stake.connect(this.signers.user1).stake(stakeAmount);
      await tx.wait();

      blocktime = await getTimestamp();
      console.log("blocktime =", blocktime.toString());
      const stakeTime = await this.stake.connect(this.signers.user1).stakeTime_msgSender();
      console.log("stakeTime =", stakeTime.toString());
      expect(Math.abs(blocktime - stakeTime)).lte(60, "stakeTime not within 60 seconds of current blocktime");

      stakeBalance = await this.stake.stakeAmount(this.signers.user1.address);
      console.log("stakeBalance =", hre.ethers.utils.formatUnits(stakeBalance, stakeTokenDecimals));
      expect(stakeBalance).to.equal(stakeAmount, "stake contract does not reflect staked amount");

      expect(await this.stakeToken.balanceOf(this.signers.user1.address)).to.equal(
        user1BalanceStart.sub(stakeAmount),
        "user1 balance was not reduced by staked amount",
      );
    });

    it("verify getUnlockTime_msgSender()", async function () {
      const unlockTime = await this.stake.connect(this.signers.user1).getUnlockTime_msgSender();
      const stakeTime = await this.stake.connect(this.signers.user1).stakeTime_msgSender();
      console.log("unlockTime =", unlockTime);
      console.log("stakeTime  =", stakeTime);
      console.log("LOCK_TIME_PERIOD =", LOCK_TIME_PERIOD);
      expect(Math.abs(unlockTime - stakeTime - LOCK_TIME_PERIOD)).lte(
        60,
        "stakeTime not within 60 seconds of current blocktime",
      );
    });

    it("user can not unstake during the lockTimePeriod", async function () {
      // wait 5 timePeriods
      if (hre.network.name != "hardhat") this.timeout(5 * timePeriod * 1000 + 15 * 60 * 1000); // wait time + 15 min timeout for RPC call
      timeNow = await waitTime(5 * timePeriod);
      timeRelative = timeNow - startTime;

      /**
       * Test TIMELOCK
       * LockTimePeriod of 7 timePeriods has not expired yet - withdraw should fail
       * https://ethereum-waffle.readthedocs.io/en/latest/matchers.html?highlight=revert#revert
       */
      await expect(this.stake.connect(this.signers.user1).withdraw()).to.be.reverted;
    });

    it("no accumulated rewards while staking for the first time", async function () {
      expect(await this.stake.connect(this.signers.user1).userAccumulatedRewards_msgSender()).to.equal(
        0,
        "user should not have any accumulated rewards",
      );
    });

    it("user should have claimable rewards after staking for some time", async function () {
      const stakeTime = await this.stake.connect(this.signers.user1).stakeTime_msgSender();
      console.log("stakeTime =", stakeTime.toString());

      const blockTime = await blockTimestamp();
      console.log("blockTime =", blockTime);

      const stakeRewardEndTime = await this.stake.stakeRewardEndTime();
      console.log("stakeRewardEndTime =", stakeRewardEndTime.toString());

      const userClaimableRewards_expected = stakeAmount.mul(5).mul(timePeriod);
      console.log("userClaimableRewards_expected =", userClaimableRewards_expected.toString());

      userClaimableRewards_contract = await this.stake.connect(this.signers.user1).userClaimableRewards_msgSender();
      console.log("userClaimableRewards_contract =", userClaimableRewards_contract.toString());

      difference = userClaimableRewards_contract.sub(userClaimableRewards_expected).div(stakeBalance).abs();
      console.log("difference =", difference.toString());
      expect(difference).to.lte(5, "userClaimableRewards calculation is too far off");
    });

    it("user can stake same amount again, should have staked 2x then", async function () {
      // stake same amount again - lock period starts again
      console.log("staking now ... stakeAmount =", hre.ethers.utils.formatUnits(stakeAmount, stakeTokenDecimals));

      const tx = await this.stake.connect(this.signers.user1).stake(stakeAmount);
      await tx.wait();

      stakeBalance = await this.stake.stakeAmount(this.signers.user1.address);
      console.log("stakeBalance =", hre.ethers.utils.formatUnits(stakeBalance, stakeTokenDecimals));
      expect(stakeBalance).to.equal(stakeAmount.mul(2), "stake contract does not reflect staked amount");

      expect(await this.stakeToken.balanceOf(this.signers.user1.address)).to.equal(
        user1BalanceStart.sub(stakeAmount).sub(stakeAmount),
        "user1 balance was not reduced by staked amount",
      );
    });

    it("after the 2nd staking, claimable rewards should have become accumulated reward", async function () {
      /**
       * Check userAccumulatedRewards
       * After the 2nd staking, claimable reward should have become accumulated reward
       * There may be a difference of one block time of rewards
       */
      const userAccumulatedRewards_contract = await this.stake
        .connect(this.signers.user1)
        .userAccumulatedRewards_msgSender();
      difference = userAccumulatedRewards_contract.sub(userClaimableRewards_contract).div(stakeBalance).abs();
      console.log(
        "(userAccumulatedRewards_contract - userClaimableRewards_contract) / stakeBalance =",
        difference.toString(),
      );
      expect(difference).to.lte(60, "userAccumulatedRewards is too far off");
    });

    it("after staking again, userClaimableRewards should be close to zero", async function () {
      /**
       * Check userClaimableRewards
       * After the 2nd staking, claimable reward should have been reset to 0
       * At most 20 sec should have been passed since then, accumulating a small userClaimableRewards balance
       */
      userClaimableRewards_contract = await this.stake.connect(this.signers.user1).userClaimableRewards_msgSender();

      expect(userClaimableRewards_contract).to.lte(
        stakeBalance.mul(20),
        "claimable reward should have been reset to 0",
      );
    });

    it("check userClaimableRewards", async function () {
      // wait 10 time periods
      if (hre.network.name != "hardhat") this.timeout(10 * timePeriod * 1000 + 15 * 60 * 1000); // wait time + 15 min timeout for RPC call
      timeNow = await waitTime(10 * timePeriod);
      timeRelative = timeNow - startTime;

      /**
       * check claimable rewards. should be ~ 2 * stakeAmount * 10 timePeriods
       */
      const userClaimableRewards_expected = stakeAmount.mul(2).mul(10).mul(timePeriod);
      console.log("userClaimableRewards_expected =", userClaimableRewards_expected.toString());

      userClaimableRewards_contract = await this.stake.connect(this.signers.user1).userClaimableRewards_msgSender();
      console.log("userClaimableRewards_contract =", userClaimableRewards_contract.toString());

      difference = userClaimableRewards_contract.sub(userClaimableRewards_expected).div(stakeBalance).abs();
      console.log("difference =", difference.toString());
      expect(difference).to.lte(1, "userClaimableRewards calculation is too far off");
    });

    it("user can unstake after the lockTimePeriod is over", async function () {
      const lastStakeBalance = stakeBalance;

      const tx = await this.stake.connect(this.signers.user1).withdraw();
      await tx.wait();

      stakeBalance = await this.stake.stakeAmount(this.signers.user1.address);
      expect(stakeBalance).to.equal(0, "stake amount should be 0");
      expect(await this.stakeToken.balanceOf(this.signers.user1.address)).to.equal(
        user1BalanceStart,
        "user1 balance should be back to original amount",
      );

      // wait 10 time periods - user should not receive any additional rewards
      if (hre.network.name != "hardhat") this.timeout(10 * timePeriod * 1000 + 15 * 60 * 1000); // wait time + 15 min timeout for RPC call
      timeNow = await waitTime(10 * timePeriod);
      timeRelative = timeNow - startTime;

      console.log("simulated time : seconds / timePeriods", timeRelative, timeRelative / timePeriod);
      console.log("----------------------------------------------------------------------------");

      /**
       * Check userClaimableRewards
       * After unstaking, claimable rewards should have been reset to 0 ...
       * and no rewards should have been earned in the timePeriods thereafter
       */
      expect(await this.stake.connect(this.signers.user1).userClaimableRewards_msgSender()).to.equal(
        0,
        "claimable reward should have been reset to 0",
      );

      /**
       * Check userAccumulatedRewards
       */
      const rewardsStake1 = stakeAmount.mul(15).mul(timePeriod); // TODO - use measured, expired time
      const rewardsStake2 = stakeAmount.mul(10).mul(timePeriod);
      const userAccumulatedRewards_expected = rewardsStake1.add(rewardsStake2);

      const userAccumulatedRewards_contract = await this.stake
        .connect(this.signers.user1)
        .userAccumulatedRewards_msgSender();

      difference = userAccumulatedRewards_contract.sub(userAccumulatedRewards_expected).div(lastStakeBalance).abs();
      console.log("userAccumulatedRewards_expected =", userAccumulatedRewards_expected.toString());
      console.log("userAccumulatedRewards_contract =", userAccumulatedRewards_contract.toString());
      console.log("userAccumulatedRewards : difference contract vers expected =", difference.toString());
      expect(difference).to.lte(60, "userAccumulatedRewards is too far off");

      /**
       * Check userTotalRewards, should equal accumulatedRewards at this stage
       */
      const userTotalRewards_contract = await this.stake.connect(this.signers.user1).userTotalRewards_msgSender();
      difference = userAccumulatedRewards_contract.sub(userTotalRewards_contract).div(lastStakeBalance).abs();
      console.log("userTotalRewards       : difference contract vers expected =", difference.toString());
      expect(difference).to.lte(1, "userTotalRewards is too far off");
    });

    /**
     * test reward token minting based on userTotalRewards
     */
    it("enable MINTER_ROLE on RewardToken for staking contract", async function () {
      const MINTER_ROLE = await this.rewardToken.MINTER_ROLE();

      const tx = await this.rewardToken.connect(this.signers.admin).grantRole(MINTER_ROLE, this.stake.address);
      await tx.wait();

      expect(await this.rewardToken.hasRole(MINTER_ROLE, this.stake.address)).to.equal(true);
    });

    /**
     * user should get 1 rewardToken for staking 1000 stakeToken for 5 timePeriods
     * In this test scenario we expect the user to receive 5 rewardToken (* 18 decimals)
     * (1000 token * 5 timePeriods) + (2000 token * 10 timePeriods) => 5 reward token
     */
    it("let user claim/mint rewardToken corresponding to their reward balance ", async function () {
      const tx = await this.stake.connect(this.signers.user1).claim();
      await tx.wait();

      const userRewardTokenBalance = await this.rewardToken.balanceOf(this.signers.user1.address);
      console.log("user reward token balance =", userRewardTokenBalance.toString());

      const balanceExpected = BigNumber.from(10).pow(rewardTokenDecimals).mul(5);
      const difference = userRewardTokenBalance.sub(balanceExpected);
      expect(userRewardTokenBalance).gte(balanceExpected); // user should have at least 5 reward tokens
      expect(balanceExpected.div(difference)).gte(50); // allow <= 2% error
    });
  });
}
