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
  ReleaseTGEN__factory,
  TGENToken,
  TGENToken__factory,
} from "../build/types";

describe("LinearReleaseToken", () => {
  let wallet: Wallet;
  let other0: Wallet;
  let other1: Wallet;
  const released: BigNumber = parseEther("10000000");

  let releaseTgen: LinearReleaseToken;
  let tgen: TGENToken;
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
    tgen = await new TGENToken__factory(wallet).deploy(wallet.address);

    start = (await getCurrentTime()) + 60 * 60; // 1 hour from now

    releaseTgen = await new ReleaseTGEN__factory(wallet).deploy(
      wallet.address,
      tgen.address,
      released,
      start,
      0,
      start + 52 * 3 * 24 * 7 * 60 * 60 // 3 year release
    );
    await tgen.transfer(releaseTgen.address, released);

    other0RU = ReleaseTGEN__factory.connect(releaseTgen.address, other0);
    other1RU = ReleaseTGEN__factory.connect(releaseTgen.address, other1);
  });

  it("has info", async () => {
    expect(await releaseTgen.name()).to.equal("Release TGEN");
    expect(await releaseTgen.symbol()).to.equal("rTGEN");
    expect(await releaseTgen.decimals()).to.equal(18);
  });

  describe("#allocate", () => {
    it("works", async () => {
      const alloc = released.div(10);
      await expect(releaseTgen.allocate([other0.address], [alloc]))
        .to.emit(releaseTgen, "Allocated")
        .withArgs(other0.address, alloc)
        .and.to.emit(releaseTgen, "Transfer")
        .withArgs(ZERO, other0.address, alloc);

      const otherRU = ReleaseTGEN__factory.connect(releaseTgen.address, other0);

      // delegate to self
      await TGENToken__factory.connect(tgen.address, other0).delegate(
        other0.address
      );
      await otherRU.delegate(other0.address);

      expect(await releaseTgen.getCurrentVotes(other0.address)).to.equal(alloc);
      expect(await releaseTgen.balanceOf(other0.address)).to.equal(alloc);
      expect(await releaseTgen.lifetimeTotalAllocated(other0.address)).to.equal(
        alloc
      );
      expect(await tgen.getCurrentVotes(other0.address)).to.equal(0);
      expect(await tgen.balanceOf(other0.address)).to.equal(0);

      // one week
      await increaseTime(24 * 7 * 60 * 60);

      // test that claim works
      await expect(otherRU.claim(), "Claim event not emitted").to.emit(
        releaseTgen,
        "Claimed"
      );
      const currentVotes = await releaseTgen.getCurrentVotes(other0.address);
      expect(currentVotes.gt(0)).to.be.true;

      const tgenVotes = await tgen.getCurrentVotes(other0.address);
      expect(tgenVotes, "TGEN votes incorrect").to.equal(alloc.sub(currentVotes));
    });

    it("length mismatch", async () => {
      await expect(
        releaseTgen.allocate([other0.address, other1.address], [123])
      ).to.be.revertedWith("LinearReleaseToken: length mismatch");
    });

    it("can allocate multiple times to the same address", async () => {
      const amt = parseEther("1000000");
      await releaseTgen.allocate([other0.address], [amt]);
      await releaseTgen.allocate([other0.address], [amt]);
      expect(await releaseTgen.balanceOf(other0.address)).to.equal(amt.mul(2));
    });

    it("limit 20", async () => {
      const amt = parseEther("10000");
      await expect(
        releaseTgen.allocate(
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
      await releaseTgen.allocate(
        [other0.address, other1.address],
        [amt, amt.mul(2)]
      );

      expect(await releaseTgen.totalVotingPower()).to.equal(amt.mul(3));
      expect(await releaseTgen.totalSupply()).to.equal(amt.mul(3));

      expect(await releaseTgen.balanceOf(other0.address)).to.equal(amt);
      expect(await releaseTgen.balanceOf(other1.address)).to.equal(amt.mul(2));
    });

    it("cannot overallocate", async () => {
      await releaseTgen.allocate([other0.address], [1]);
      await releaseTgen.allocate([other0.address], [released.sub(1)]);
      await expect(
        releaseTgen.allocate([other0.address], [1])
      ).to.be.revertedWith("LinearReleaseToken::_allocate: overallocated");
    });

    it("cannot allocate to zero address", async () => {
      await expect(releaseTgen.allocate([ZERO], [released])).to.be.revertedWith(
        "VotingPower::_mintVotes: cannot mint to the zero address"
      );
    });
  });

  describe("#claim", () => {
    let other0RU: LinearReleaseToken;

    beforeEach(() => {
      other0RU = ReleaseTGEN__factory.connect(releaseTgen.address, other0);
    });

    it("claiming before the start gives 0", async () => {
      const amt = released;
      await releaseTgen.allocate([other0.address], [amt]);
      await expect(other0RU.claim())
        .to.not.emit(other0RU, "Claimed")
        .and.to.not.emit(tgen, "Transfer");
      expect(await other0RU.totalClaimed(other0.address)).to.equal(0);
    });

    it("anyone can claim but will get 0", async () => {
      await expect(other0RU.claim())
        .to.not.emit(other0RU, "Claimed")
        .and.to.not.emit(tgen, "Transfer");
    });

    it("allows claiming entire time", async () => {
      const amt = released.div(10);

      await releaseTgen.allocate([other0.address], [amt]);

      await increaseTime(
        52 * 4 * 24 * 7 * 60 * 60 // 4 years
      );

      expect(await other0RU.releasableSupply()).to.equal(released);

      await expect(other0RU.claim())
        .to.emit(other0RU, "Claimed")
        .withArgs(other0.address, amt)
        .and.to.emit(tgen, "Transfer")
        .withArgs(other0RU.address, other0.address, amt);

      expect(await other0RU.releasableSupply()).to.equal(released.sub(amt));
    });

    it("allows claiming based on initial date if tokens are released later", async () => {
      const amt = released.div(10);

      await releaseTgen.allocate([other0.address], [amt]);
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
      await releaseTgen.allocate([other0.address], [amt2]);

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

      await releaseTgen.allocate([other0.address], [amt]);
      await increaseTime(
        52 * 1 * 24 * 7 * 60 * 60 // 1 year
      );

      // all tokens are unclaimed
      expect(await releaseTgen.totalSupply()).to.equal(amt);

      await expect(other0RU.claim())
        .to.emit(other0RU, "Claimed")
        .and.to.emit(tgen, "Transfer");

      const totalClaimed = await other0RU.totalClaimed(other0.address);

      // claimed tokens should be gone from supply
      expect(await releaseTgen.totalSupply()).to.equal(amt.sub(totalClaimed));

      await increaseTime(
        52 * 1 * 24 * 7 * 60 * 60 // 1 year
      );

      await expect(other0RU.claim())
        .to.emit(other0RU, "Claimed")
        .and.to.emit(tgen, "Transfer");
      const nextTotalClaimed = await other0RU.totalClaimed(other0.address);
      expect(nextTotalClaimed.gt(totalClaimed)).to.be.true;

      // less unclaimed tokens
      expect(await releaseTgen.totalSupply()).to.equal(
        amt.sub(nextTotalClaimed)
      );

      await increaseTime(
        52 * 2 * 24 * 7 * 60 * 60 // 2 years
      );

      await other0RU.claim();
      expect(await other0RU.totalClaimed(other0.address)).to.equal(amt);
      expect(await tgen.balanceOf(other0.address)).to.equal(amt);

      // no more unclaimed tokens
      expect(await releaseTgen.totalSupply()).to.equal(0);
    });
  });

  describe("#delegate", () => {
    it("should allow multiple delegations to one address", async () => {
      await other0RU.delegate(wallet.address);
      await other1RU.delegate(wallet.address);

      const amt = released.div(2);
      await releaseTgen.allocate([other0.address, other1.address], [amt, amt]);

      await increaseTime(
        52 * 4 * 24 * 7 * 60 * 60 // 4 years
      );

      expect(await releaseTgen.getCurrentVotes(wallet.address)).to.equal(
        released
      );
      expect(await releaseTgen.getCurrentVotes(other0.address)).to.equal(0);
      expect(await releaseTgen.getCurrentVotes(other1.address)).to.equal(0);

      await other1RU.delegate(other1.address);

      expect(await releaseTgen.getCurrentVotes(wallet.address)).to.equal(amt);
      expect(await releaseTgen.getCurrentVotes(other0.address)).to.equal(0);
      expect(await releaseTgen.getCurrentVotes(other1.address)).to.equal(amt);
    });

    it("should remove delegations if claimed", async () => {
      await other0RU.delegate(wallet.address);
      await other1RU.delegate(wallet.address);

      const amt = released.div(2);
      await releaseTgen.allocate([other0.address, other1.address], [amt, amt]);

      expect(await releaseTgen.getCurrentVotes(wallet.address)).to.equal(
        released
      );
      expect(await releaseTgen.getCurrentVotes(other0.address)).to.equal(0);
      expect(await releaseTgen.getCurrentVotes(other1.address)).to.equal(0);

      await increaseTime(
        52 * 4 * 24 * 7 * 60 * 60 // 4 years
      );

      await other0RU.claim();
      expect(await tgen.balanceOf(other0.address)).to.equal(amt);
      expect(await releaseTgen.balanceOf(other0.address)).to.equal(0);

      expect(await releaseTgen.getCurrentVotes(wallet.address)).to.equal(amt);
      expect(await releaseTgen.getCurrentVotes(other0.address)).to.equal(0);
      expect(await releaseTgen.getCurrentVotes(other1.address)).to.equal(0);

      expect(await tgen.getCurrentVotes(wallet.address)).to.equal(0);

      // delegate using UBE instead
      await TGENToken__factory.connect(tgen.address, other0).delegate(
        wallet.address
      );
      expect(await tgen.getCurrentVotes(wallet.address)).to.equal(amt);
    });

    it("nested delegation", async () => {
      await releaseTgen.allocate(
        [other0.address, other1.address],
        [parseEther("1"), parseEther("2")]
      );

      let currentVotes0 = await releaseTgen.getCurrentVotes(other0.address);
      let currentVotes1 = await releaseTgen.getCurrentVotes(other1.address);
      expect(currentVotes0).to.be.eq(0);
      expect(currentVotes1).to.be.eq(0);

      expect(await releaseTgen.getCurrentVotes(wallet.address)).to.equal(0);
      await other0RU.delegate(wallet.address);
      expect(await releaseTgen.getCurrentVotes(wallet.address)).to.equal(
        parseEther("1")
      );

      await other1RU.delegate(other0.address);
      expect(await releaseTgen.getCurrentVotes(wallet.address)).to.equal(
        parseEther("1")
      );
      expect(await releaseTgen.getCurrentVotes(other0.address)).to.equal(
        parseEther("2")
      );

      await other0RU.delegate(other0.address);
      expect(await releaseTgen.getCurrentVotes(wallet.address)).to.equal(
        parseEther("0")
      );
      expect(await releaseTgen.getCurrentVotes(other0.address)).to.equal(
        parseEther("3")
      );
    });
  });

  describe("#getPriorVotes", () => {
    it("should be preserved when allocating", async () => {
      const initialNumber = await getCurrentBlockNumber();

      const amt = released.div(10);
      await releaseTgen.allocate([other0.address], [amt]);

      await mineBlock();
      await mineBlock();
      await mineBlock();
      await mineBlock();
      await mineBlock();

      const nextBlock = (await (await other0RU.delegate(other0.address)).wait())
        .blockNumber;
      await mineBlock();

      expect(await releaseTgen.getCurrentVotes(other0.address)).to.equal(amt);
      expect(
        await releaseTgen.getPriorVotes(other0.address, initialNumber)
      ).to.equal(0);
      expect(
        await releaseTgen.getPriorVotes(other0.address, nextBlock - 1)
      ).to.equal(0);
      expect(
        await releaseTgen.getPriorVotes(other0.address, nextBlock)
      ).to.equal(amt);
    });

    it("should be preserved when claiming", async () => {
      const initialNumber = await getCurrentBlockNumber();

      expect(await releaseTgen.getCurrentVotes(other0.address)).to.equal(0);

      const amt = released.div(10);
      await other0RU.delegate(other0.address);
      const atAllocation = (
        await (await releaseTgen.allocate([other0.address], [amt])).wait()
      ).blockNumber;

      expect(await releaseTgen.getCurrentVotes(other0.address)).to.equal(amt);

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

      expect(await releaseTgen.getCurrentVotes(other0.address)).to.equal(0);
      expect(
        await releaseTgen.getPriorVotes(other0.address, initialNumber)
      ).to.equal(0);

      expect(
        await releaseTgen.getPriorVotes(other0.address, atAllocation - 1)
      ).to.equal(0);
      expect(
        await releaseTgen.getPriorVotes(other0.address, atAllocation)
      ).to.equal(amt);
      expect(
        await releaseTgen.getPriorVotes(other0.address, atAllocation + 1)
      ).to.equal(amt);

      expect(
        await releaseTgen.getPriorVotes(other0.address, nextBlock - 1)
      ).to.equal(amt);
      expect(
        await releaseTgen.getPriorVotes(other0.address, nextBlock)
      ).to.equal(0);
    });

    it("cannot get latest block", async () => {
      const initialNumber = await getCurrentBlockNumber();
      await expect(
        releaseTgen.getPriorVotes(wallet.address, initialNumber)
      ).to.be.revertedWith("TGEN::getPriorVotes: not yet determined");
    });

    it("no checkpoints == no votes", async () => {
      const initialNumber = await getCurrentBlockNumber();
      expect(
        await releaseTgen.getPriorVotes(wallet.address, initialNumber - 1)
      ).to.equal(0);
    });

    it("binary search -- binary search find", async () => {
      const amt = released.div(2);
      await releaseTgen.allocate([other0.address], [amt]);

      await other0RU.delegate(wallet.address);
      await other0RU.delegate(other0.address);
      const number = (await (await other0RU.delegate(wallet.address)).wait())
        .blockNumber;
      await other0RU.delegate(other0.address);
      await other0RU.delegate(wallet.address);

      expect(await releaseTgen.getPriorVotes(wallet.address, number)).to.equal(
        amt
      );
    });

    it("many checkpoints -- binary search high", async () => {
      const amt = released.div(2);
      await releaseTgen.allocate([other0.address], [amt]);

      await other0RU.delegate(other1.address);
      await other0RU.delegate(wallet.address);
      await other0RU.delegate(other1.address);
      await other0RU.delegate(wallet.address);
      const number = (await (await other0RU.delegate(wallet.address)).wait())
        .blockNumber;
      await other0RU.delegate(other1.address);

      expect(await releaseTgen.getPriorVotes(wallet.address, number)).to.equal(
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
            name: "Release TGEN",
            chainId,
            verifyingContract: releaseTgen.address,
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
      ).to.be.revertedWith("TGEN::delegateBySig: invalid signature");
    });

    it("reverts if the nonce is bad", async () => {
      const delegatee = wallet.address,
        nonce = 1,
        expiry = 0;
      const { v, r, s } = await doSign(other0, { delegatee, nonce, expiry });
      await expect(
        other1RU.delegateBySig(delegatee, nonce, expiry, v, r, s)
      ).to.be.revertedWith("TGEN::delegateBySig: invalid nonce");
    });

    it("reverts if the signature has expired", async () => {
      const delegatee = wallet.address,
        nonce = 0,
        expiry = 0;
      const { v, r, s } = await doSign(other0, { delegatee, nonce, expiry });
      await expect(
        other1RU.delegateBySig(delegatee, nonce, expiry, v, r, s)
      ).to.be.revertedWith("TGEN::delegateBySig: signature expired");
    });

    it("delegates on behalf of the signatory", async () => {
      const delegatee = wallet.address,
        nonce = 0,
        expiry = 10e9;

      const amt = released.div(2);
      await releaseTgen.allocate([other0.address], [amt]);

      expect(await releaseTgen.getCurrentVotes(wallet.address)).to.equal(0);

      const { v, r, s } = await doSign(other0, { delegatee, nonce, expiry });
      const result = await (
        await releaseTgen.delegateBySig(delegatee, nonce, expiry, v, r, s)
      ).wait();
      expect(result.gasUsed.lt(80000));

      expect(await releaseTgen.getCurrentVotes(wallet.address)).to.equal(amt);
    });
  });
});
