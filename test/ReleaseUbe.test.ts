import {
  ADDRESS_ZERO as ZERO,
  getCurrentBlockNumber,
  getCurrentTime,
  increaseTime,
  mineBlock,
} from "@ubeswap/hardhat-celo/lib/testing";
import { expect } from "chai";
import { BigNumber, Signature, Wallet } from "ethers";
import { parseEther, splitSignature } from "ethers/lib/utils";
import hre from "hardhat";
import {
  LinearReleaseToken,
  ReleaseUbe__factory,
  UbeToken,
  UbeToken__factory,
} from "../build/types/";

describe("LinearReleaseToken", () => {
  let wallet: Wallet;
  let other0: Wallet;
  let other1: Wallet;
  const released: BigNumber = parseEther("10000000");

  let releaseUbe: LinearReleaseToken;
  let ube: UbeToken;
  let start: number;

  let other0RU: LinearReleaseToken;
  let other1RU: LinearReleaseToken;

  let chainId: number;

  before(async () => {
    const wallets = await hre.waffle.provider.getWallets();
    chainId = await (await hre.waffle.provider.getNetwork()).chainId;

    wallet = wallets[0]!;
    other0 = wallets[1]!;
    other1 = wallets[2]!;
  });

  beforeEach(async () => {
    ube = await new UbeToken__factory(wallet).deploy(wallet.address);

    start = (await getCurrentTime()) + 60 * 60; // 1 hour from now

    releaseUbe = await new ReleaseUbe__factory(wallet).deploy(
      wallet.address,
      ube.address,
      released,
      start,
      0,
      start + 52 * 3 * 24 * 7 * 60 * 60 // 3 year release
    );
    await ube.transfer(releaseUbe.address, released);

    other0RU = ReleaseUbe__factory.connect(releaseUbe.address, other0);
    other1RU = ReleaseUbe__factory.connect(releaseUbe.address, other1);
  });

  it("has info", async () => {
    expect(await releaseUbe.name()).to.equal("Release Ube");
    expect(await releaseUbe.symbol()).to.equal("rUBE");
    expect(await releaseUbe.decimals()).to.equal(18);
  });

  describe("#allocate", () => {
    it("works", async () => {
      const alloc = released.div(10);
      await expect(releaseUbe.allocate([other0.address], [alloc]))
        .to.emit(releaseUbe, "Allocated")
        .withArgs(other0.address, alloc)
        .and.to.emit(releaseUbe, "Transfer")
        .withArgs(ZERO, other0.address, alloc);

      const otherRU = ReleaseUbe__factory.connect(releaseUbe.address, other0);

      // delegate to self
      await UbeToken__factory.connect(ube.address, other0).delegate(
        other0.address
      );
      await otherRU.delegate(other0.address);

      expect(await releaseUbe.getCurrentVotes(other0.address)).to.equal(alloc);
      expect(await releaseUbe.balanceOf(other0.address)).to.equal(alloc);
      expect(await releaseUbe.lifetimeTotalAllocated(other0.address)).to.equal(
        alloc
      );
      expect(await ube.getCurrentVotes(other0.address)).to.equal(0);
      expect(await ube.balanceOf(other0.address)).to.equal(0);

      // one week
      await increaseTime(24 * 7 * 60 * 60);

      // test that claim works
      await expect(otherRU.claim(), "Claim event not emitted").to.emit(
        releaseUbe,
        "Claimed"
      );
      const currentVotes = await releaseUbe.getCurrentVotes(other0.address);
      expect(currentVotes.gt(0)).to.be.true;

      const ubeVotes = await ube.getCurrentVotes(other0.address);
      expect(ubeVotes, "Ube votes incorrect").to.equal(alloc.sub(currentVotes));
    });

    it("length mismatch", async () => {
      await expect(
        releaseUbe.allocate([other0.address, other1.address], [123])
      ).to.be.revertedWith("LinearReleaseToken: length mismatch");
    });

    it("can allocate multiple times to the same address", async () => {
      const amt = parseEther("1000000");
      await releaseUbe.allocate([other0.address], [amt]);
      await releaseUbe.allocate([other0.address], [amt]);
      expect(await releaseUbe.balanceOf(other0.address)).to.equal(amt.mul(2));
    });

    it("limit 20", async () => {
      const amt = parseEther("10000");
      await expect(
        releaseUbe.allocate(
          Array(21)
            .fill(null)
            .map(() => other0.address),
          Array(21)
            .fill(null)
            .map(() => amt)
        )
      ).to.be.revertedWith(
        "LinearReleaseToken: max 20 holders at initial allocation"
      );
    });

    it("can allocate to multiple addresses at once", async () => {
      const amt = released.div(10);
      await releaseUbe.allocate(
        [other0.address, other1.address],
        [amt, amt.mul(2)]
      );

      expect(await releaseUbe.totalVotingPower()).to.equal(amt.mul(3));
      expect(await releaseUbe.totalSupply()).to.equal(amt.mul(3));

      expect(await releaseUbe.balanceOf(other0.address)).to.equal(amt);
      expect(await releaseUbe.balanceOf(other1.address)).to.equal(amt.mul(2));
    });

    it("cannot overallocate", async () => {
      await releaseUbe.allocate([other0.address], [1]);
      await releaseUbe.allocate([other0.address], [released.sub(1)]);
      await expect(
        releaseUbe.allocate([other0.address], [1])
      ).to.be.revertedWith("LinearReleaseToken::_allocate: overallocated");
    });

    it("cannot allocate to zero address", async () => {
      await expect(releaseUbe.allocate([ZERO], [released])).to.be.revertedWith(
        "VotingPower::_mintVotes: cannot mint to the zero address"
      );
    });
  });

  describe("#claim", () => {
    let other0RU: LinearReleaseToken;

    beforeEach(() => {
      other0RU = ReleaseUbe__factory.connect(releaseUbe.address, other0);
    });

    it("claiming before the start gives 0", async () => {
      const amt = released;
      await releaseUbe.allocate([other0.address], [amt]);
      await expect(other0RU.claim())
        .to.not.emit(other0RU, "Claimed")
        .and.to.not.emit(ube, "Transfer");
      expect(await other0RU.totalClaimed(other0.address)).to.equal(0);
    });

    it("anyone can claim but will get 0", async () => {
      await expect(other0RU.claim())
        .to.not.emit(other0RU, "Claimed")
        .and.to.not.emit(ube, "Transfer");
    });

    it("allows claiming entire time", async () => {
      const amt = released.div(10);

      await releaseUbe.allocate([other0.address], [amt]);

      await increaseTime(
        52 * 4 * 24 * 7 * 60 * 60 // 4 years
      );

      expect(await other0RU.releasableSupply()).to.equal(released);

      await expect(other0RU.claim())
        .to.emit(other0RU, "Claimed")
        .withArgs(other0.address, amt)
        .and.to.emit(ube, "Transfer")
        .withArgs(other0RU.address, other0.address, amt);

      expect(await other0RU.releasableSupply()).to.equal(released.sub(amt));
    });

    it("allows claiming based on initial date if tokens are released later", async () => {
      const amt = released.div(10);

      await releaseUbe.allocate([other0.address], [amt]);
      expect(await other0RU.releasableSupply()).to.equal(0);
      await increaseTime(
        52 * 4 * 24 * 7 * 60 * 60 // 4 years
      );
      expect(await other0RU.totalClaimed(other0.address)).to.equal(0);
      expect(await other0RU.releasableSupply()).to.equal(released);

      await expect(other0RU.claim())
        .to.emit(other0RU, "Claimed")
        .withArgs(other0.address, amt);

      const amt2 = amt.mul(3);
      await releaseUbe.allocate([other0.address], [amt2]);

      expect(await other0RU.totalClaimed(other0.address)).to.equal(amt);
      expect(await other0RU.earned(other0.address)).to.equal(amt2);
      await expect(other0RU.claim())
        .to.emit(other0RU, "Claimed")
        .withArgs(other0.address, amt2);
      expect(await other0RU.totalClaimed(other0.address)).to.equal(
        amt.add(amt2)
      );
    });

    it("claim does not add up to more than the amount", async () => {
      const amt = released.div(10);

      await releaseUbe.allocate([other0.address], [amt]);
      await increaseTime(
        52 * 1 * 24 * 7 * 60 * 60 // 1 year
      );

      // all tokens are unclaimed
      expect(await releaseUbe.totalSupply()).to.equal(amt);

      await expect(other0RU.claim())
        .to.emit(other0RU, "Claimed")
        .and.to.emit(ube, "Transfer");

      const totalClaimed = await other0RU.totalClaimed(other0.address);

      // claimed tokens should be gone from supply
      expect(await releaseUbe.totalSupply()).to.equal(amt.sub(totalClaimed));

      await increaseTime(
        52 * 1 * 24 * 7 * 60 * 60 // 1 year
      );

      await expect(other0RU.claim())
        .to.emit(other0RU, "Claimed")
        .and.to.emit(ube, "Transfer");
      const nextTotalClaimed = await other0RU.totalClaimed(other0.address);
      expect(nextTotalClaimed.gt(totalClaimed)).to.be.true;

      // less unclaimed tokens
      expect(await releaseUbe.totalSupply()).to.equal(
        amt.sub(nextTotalClaimed)
      );

      await increaseTime(
        52 * 2 * 24 * 7 * 60 * 60 // 2 years
      );

      await other0RU.claim();
      expect(await other0RU.totalClaimed(other0.address)).to.equal(amt);
      expect(await ube.balanceOf(other0.address)).to.equal(amt);

      // no more unclaimed tokens
      expect(await releaseUbe.totalSupply()).to.equal(0);
    });
  });

  describe("#delegate", () => {
    it("should allow multiple delegations to one address", async () => {
      await other0RU.delegate(wallet.address);
      await other1RU.delegate(wallet.address);

      const amt = released.div(2);
      await releaseUbe.allocate([other0.address, other1.address], [amt, amt]);

      await increaseTime(
        52 * 4 * 24 * 7 * 60 * 60 // 4 years
      );

      expect(await releaseUbe.getCurrentVotes(wallet.address)).to.equal(
        released
      );
      expect(await releaseUbe.getCurrentVotes(other0.address)).to.equal(0);
      expect(await releaseUbe.getCurrentVotes(other1.address)).to.equal(0);

      await other1RU.delegate(other1.address);

      expect(await releaseUbe.getCurrentVotes(wallet.address)).to.equal(amt);
      expect(await releaseUbe.getCurrentVotes(other0.address)).to.equal(0);
      expect(await releaseUbe.getCurrentVotes(other1.address)).to.equal(amt);
    });

    it("should remove delegations if claimed", async () => {
      await other0RU.delegate(wallet.address);
      await other1RU.delegate(wallet.address);

      const amt = released.div(2);
      await releaseUbe.allocate([other0.address, other1.address], [amt, amt]);

      expect(await releaseUbe.getCurrentVotes(wallet.address)).to.equal(
        released
      );
      expect(await releaseUbe.getCurrentVotes(other0.address)).to.equal(0);
      expect(await releaseUbe.getCurrentVotes(other1.address)).to.equal(0);

      await increaseTime(
        52 * 4 * 24 * 7 * 60 * 60 // 4 years
      );

      await other0RU.claim();
      expect(await ube.balanceOf(other0.address)).to.equal(amt);
      expect(await releaseUbe.balanceOf(other0.address)).to.equal(0);

      expect(await releaseUbe.getCurrentVotes(wallet.address)).to.equal(amt);
      expect(await releaseUbe.getCurrentVotes(other0.address)).to.equal(0);
      expect(await releaseUbe.getCurrentVotes(other1.address)).to.equal(0);

      expect(await ube.getCurrentVotes(wallet.address)).to.equal(0);

      // delegate using UBE instead
      await UbeToken__factory.connect(ube.address, other0).delegate(
        wallet.address
      );
      expect(await ube.getCurrentVotes(wallet.address)).to.equal(amt);
    });

    it("nested delegation", async () => {
      await releaseUbe.allocate(
        [other0.address, other1.address],
        [parseEther("1"), parseEther("2")]
      );

      let currentVotes0 = await releaseUbe.getCurrentVotes(other0.address);
      let currentVotes1 = await releaseUbe.getCurrentVotes(other1.address);
      expect(currentVotes0).to.be.eq(0);
      expect(currentVotes1).to.be.eq(0);

      expect(await releaseUbe.getCurrentVotes(wallet.address)).to.equal(0);
      await other0RU.delegate(wallet.address);
      expect(await releaseUbe.getCurrentVotes(wallet.address)).to.equal(
        parseEther("1")
      );

      await other1RU.delegate(other0.address);
      expect(await releaseUbe.getCurrentVotes(wallet.address)).to.equal(
        parseEther("1")
      );
      expect(await releaseUbe.getCurrentVotes(other0.address)).to.equal(
        parseEther("2")
      );

      await other0RU.delegate(other0.address);
      expect(await releaseUbe.getCurrentVotes(wallet.address)).to.equal(
        parseEther("0")
      );
      expect(await releaseUbe.getCurrentVotes(other0.address)).to.equal(
        parseEther("3")
      );
    });
  });

  describe("#getPriorVotes", () => {
    it("should be preserved when allocating", async () => {
      const initialNumber = await getCurrentBlockNumber();

      const amt = released.div(10);
      await releaseUbe.allocate([other0.address], [amt]);

      await mineBlock();
      await mineBlock();
      await mineBlock();
      await mineBlock();
      await mineBlock();

      const nextBlock = (await (await other0RU.delegate(other0.address)).wait())
        .blockNumber;
      await mineBlock();

      expect(await releaseUbe.getCurrentVotes(other0.address)).to.equal(amt);
      expect(
        await releaseUbe.getPriorVotes(other0.address, initialNumber)
      ).to.equal(0);
      expect(
        await releaseUbe.getPriorVotes(other0.address, nextBlock - 1)
      ).to.equal(0);
      expect(
        await releaseUbe.getPriorVotes(other0.address, nextBlock)
      ).to.equal(amt);
    });

    it("should be preserved when claiming", async () => {
      const initialNumber = await getCurrentBlockNumber();

      expect(await releaseUbe.getCurrentVotes(other0.address)).to.equal(0);

      const amt = released.div(10);
      await other0RU.delegate(other0.address);
      const atAllocation = (
        await (await releaseUbe.allocate([other0.address], [amt])).wait()
      ).blockNumber;

      expect(await releaseUbe.getCurrentVotes(other0.address)).to.equal(amt);

      await mineBlock();
      await mineBlock();
      await mineBlock();
      await mineBlock();

      await increaseTime(
        4 * 52 * 24 * 7 * 60 * 60 // 4 years
      );

      const nextBlock = (await (await other0RU.claim()).wait()).blockNumber;
      await mineBlock();

      // test all boundary conditions

      expect(await releaseUbe.getCurrentVotes(other0.address)).to.equal(0);
      expect(
        await releaseUbe.getPriorVotes(other0.address, initialNumber)
      ).to.equal(0);

      expect(
        await releaseUbe.getPriorVotes(other0.address, atAllocation - 1)
      ).to.equal(0);
      expect(
        await releaseUbe.getPriorVotes(other0.address, atAllocation)
      ).to.equal(amt);
      expect(
        await releaseUbe.getPriorVotes(other0.address, atAllocation + 1)
      ).to.equal(amt);

      expect(
        await releaseUbe.getPriorVotes(other0.address, nextBlock - 1)
      ).to.equal(amt);
      expect(
        await releaseUbe.getPriorVotes(other0.address, nextBlock)
      ).to.equal(0);
    });

    it("cannot get latest block", async () => {
      const initialNumber = await getCurrentBlockNumber();
      await expect(
        releaseUbe.getPriorVotes(wallet.address, initialNumber)
      ).to.be.revertedWith("Uni::getPriorVotes: not yet determined");
    });

    it("no checkpoints == no votes", async () => {
      const initialNumber = await getCurrentBlockNumber();
      expect(
        await releaseUbe.getPriorVotes(wallet.address, initialNumber - 1)
      ).to.equal(0);
    });

    it("binary search -- binary search find", async () => {
      const amt = released.div(2);
      await releaseUbe.allocate([other0.address], [amt]);

      await other0RU.delegate(wallet.address);
      await other0RU.delegate(other0.address);
      const number = (await (await other0RU.delegate(wallet.address)).wait())
        .blockNumber;
      await other0RU.delegate(other0.address);
      await other0RU.delegate(wallet.address);

      expect(await releaseUbe.getPriorVotes(wallet.address, number)).to.equal(
        amt
      );
    });

    it("many checkpoints -- binary search high", async () => {
      const amt = released.div(2);
      await releaseUbe.allocate([other0.address], [amt]);

      await other0RU.delegate(other1.address);
      await other0RU.delegate(wallet.address);
      await other0RU.delegate(other1.address);
      await other0RU.delegate(wallet.address);
      const number = (await (await other0RU.delegate(wallet.address)).wait())
        .blockNumber;
      await other0RU.delegate(other1.address);

      expect(await releaseUbe.getPriorVotes(wallet.address, number)).to.equal(
        amt
      );
    });
  });

  describe("#delegateBySig", () => {
    let doSign: (
      wallet: Wallet,
      args: Record<string, any>
    ) => Promise<Signature>;

    beforeEach(() => {
      doSign = async (
        wallet: Wallet,
        args: Record<string, any>
      ): Promise<Signature> => {
        const raw = await wallet._signTypedData(
          {
            name: "Release Ube",
            chainId,
            verifyingContract: releaseUbe.address,
          },
          {
            Delegation: [
              { name: "delegatee", type: "address" },
              { name: "nonce", type: "uint256" },
              { name: "expiry", type: "uint256" },
            ],
          },
          args
        );
        return splitSignature(raw);
      };
    });

    it("reverts if the signatory is invalid", async () => {
      const delegatee = wallet.address,
        nonce = 0,
        expiry = 0;

      await expect(
        other1RU.delegateBySig(
          delegatee,
          nonce,
          expiry,
          0,
          "0xbad0bad0bad0bad0bad0bad0bad0bad0bad0bad0bad0bad0bad0bad0bad0bad0",
          "0xbad0bad0bad0bad0bad0bad0bad0bad0bad0bad0bad0bad0bad0bad0bad0bad0"
        )
      ).to.be.revertedWith("Uni::delegateBySig: invalid signature");
    });

    it("reverts if the nonce is bad", async () => {
      const delegatee = wallet.address,
        nonce = 1,
        expiry = 0;
      const { v, r, s } = await doSign(other0, { delegatee, nonce, expiry });
      await expect(
        other1RU.delegateBySig(delegatee, nonce, expiry, v, r, s)
      ).to.be.revertedWith("Uni::delegateBySig: invalid nonce");
    });

    it("reverts if the signature has expired", async () => {
      const delegatee = wallet.address,
        nonce = 0,
        expiry = 0;
      const { v, r, s } = await doSign(other0, { delegatee, nonce, expiry });
      await expect(
        other1RU.delegateBySig(delegatee, nonce, expiry, v, r, s)
      ).to.be.revertedWith("Uni::delegateBySig: signature expired");
    });

    it("delegates on behalf of the signatory", async () => {
      const delegatee = wallet.address,
        nonce = 0,
        expiry = 10e9;

      const amt = released.div(2);
      await releaseUbe.allocate([other0.address], [amt]);

      expect(await releaseUbe.getCurrentVotes(wallet.address)).to.equal(0);

      const { v, r, s } = await doSign(other0, { delegatee, nonce, expiry });
      const result = await (
        await releaseUbe.delegateBySig(delegatee, nonce, expiry, v, r, s)
      ).wait();
      expect(result.gasUsed.lt(80000));

      expect(await releaseUbe.getCurrentVotes(wallet.address)).to.equal(amt);
    });
  });
});
