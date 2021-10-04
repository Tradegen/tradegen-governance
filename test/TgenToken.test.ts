import { expect } from "chai";
import { ecsign } from "ethereumjs-util";
import { BigNumber, constants, utils, Wallet } from "ethers";
import { parseEther } from "ethers/lib/utils";
import hre from "hardhat";
import { TGENToken, TGENToken__factory } from "../build/types/";

const max96 = BigNumber.from(2).pow(96).sub(1);

const DOMAIN_TYPEHASH = utils.keccak256(
  utils.toUtf8Bytes(
    "EIP712Domain(string name,uint256 chainId,address verifyingContract)"
  )
);

const PERMIT_TYPEHASH = utils.keccak256(
  utils.toUtf8Bytes(
    "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
  )
);

describe("TGEN", () => {
  let wallet: Wallet;
  let other0: Wallet;
  let other1: Wallet;
  let tgen: TGENToken;

  beforeEach(async () => {
    const wallets = await hre.waffle.provider.getWallets();

    wallet = wallets[0]!;
    other0 = wallets[1]!;
    other1 = wallets[2]!;

    tgen = await new TGENToken__factory(wallet).deploy(wallet.address);
  });

  it("has correct token info", async () => {
    expect(await tgen.name()).to.equal("Tradegen");
    expect(await tgen.symbol()).to.equal("TGEN");
    expect(await tgen.totalSupply()).to.equal(parseEther("1000000000"));
    expect(await tgen.balanceOf(wallet.address)).to.equal(
      parseEther("1000000000")
    );
  });

  describe("#permit", () => {
    it("permit", async () => {
      const domainSeparator = utils.keccak256(
        utils.defaultAbiCoder.encode(
          ["bytes32", "bytes32", "uint256", "address"],
          [
            DOMAIN_TYPEHASH,
            utils.keccak256(utils.toUtf8Bytes("Tradegen")),
            await wallet.getChainId(),
            tgen.address,
          ]
        )
      );

      const owner = wallet.address;
      const spender = other0.address;
      const value = 123;
      const nonce = await tgen.nonces(wallet.address);
      const deadline = constants.MaxUint256;
      const digest = utils.keccak256(
        utils.solidityPack(
          ["bytes1", "bytes1", "bytes32", "bytes32"],
          [
            "0x19",
            "0x01",
            domainSeparator,
            utils.keccak256(
              utils.defaultAbiCoder.encode(
                [
                  "bytes32",
                  "address",
                  "address",
                  "uint256",
                  "uint256",
                  "uint256",
                ],
                [PERMIT_TYPEHASH, owner, spender, value, nonce, deadline]
              )
            ),
          ]
        )
      );

      const { v, r, s } = ecsign(
        Buffer.from(digest.slice(2), "hex"),
        Buffer.from(wallet.privateKey.slice(2), "hex")
      );

      await tgen.permit(
        owner,
        spender,
        value,
        deadline,
        v,
        utils.hexlify(r),
        utils.hexlify(s)
      );
      expect(await tgen.allowance(owner, spender)).to.eq(value);
      expect(await tgen.nonces(owner)).to.eq(1);

      await tgen.connect(other0).transferFrom(owner, spender, value);
    });

    it("max permit", async () => {
      const domainSeparator = utils.keccak256(
        utils.defaultAbiCoder.encode(
          ["bytes32", "bytes32", "uint256", "address"],
          [
            DOMAIN_TYPEHASH,
            utils.keccak256(utils.toUtf8Bytes("Tradegen")),
            await wallet.getChainId(),
            tgen.address,
          ]
        )
      );

      const owner = wallet.address;
      const spender = other0.address;
      const value = constants.MaxUint256;
      const nonce = await tgen.nonces(wallet.address);
      const deadline = constants.MaxUint256;
      const digest = utils.keccak256(
        utils.solidityPack(
          ["bytes1", "bytes1", "bytes32", "bytes32"],
          [
            "0x19",
            "0x01",
            domainSeparator,
            utils.keccak256(
              utils.defaultAbiCoder.encode(
                [
                  "bytes32",
                  "address",
                  "address",
                  "uint256",
                  "uint256",
                  "uint256",
                ],
                [PERMIT_TYPEHASH, owner, spender, value, nonce, deadline]
              )
            ),
          ]
        )
      );

      const { v, r, s } = ecsign(
        Buffer.from(digest.slice(2), "hex"),
        Buffer.from(wallet.privateKey.slice(2), "hex")
      );

      await tgen.permit(
        owner,
        spender,
        value,
        deadline,
        v,
        utils.hexlify(r),
        utils.hexlify(s)
      );
      expect(await tgen.allowance(owner, spender)).to.eq(max96);
      expect(await tgen.nonces(owner)).to.eq(1);
    });
  });

  it("nested delegation", async () => {
    await tgen.transfer(other0.address, parseEther("1"));
    await tgen.transfer(other1.address, parseEther("2"));

    let currentVotes0 = await tgen.getCurrentVotes(other0.address);
    let currentVotes1 = await tgen.getCurrentVotes(other1.address);
    expect(currentVotes0).to.be.eq(0);
    expect(currentVotes1).to.be.eq(0);

    await tgen.connect(other0).delegate(other1.address);
    currentVotes1 = await tgen.getCurrentVotes(other1.address);
    expect(currentVotes1).to.be.eq(parseEther("1"));

    await tgen.connect(other1).delegate(other1.address);
    currentVotes1 = await tgen.getCurrentVotes(other1.address);
    expect(currentVotes1).to.be.eq(parseEther("1").add(parseEther("2")));

    await tgen.connect(other1).delegate(wallet.address);
    currentVotes1 = await tgen.getCurrentVotes(other1.address);
    expect(currentVotes1).to.be.eq(parseEther("1"));
  });

  describe("#approve", () => {
    it("max approve becoomes max uint96", async () => {
      await expect(tgen.approve(other0.address, constants.MaxUint256))
        .to.emit(tgen, "Approval")
        .withArgs(wallet.address, other0.address, max96);

      expect(await tgen.allowance(wallet.address, other0.address)).to.equal(
        max96
      );
    });

    it("more than 96 bits reverts", async () => {
      await expect(
        tgen.approve(other0.address, max96.add(1))
      ).to.be.revertedWith("TGEN::approve: amount exceeds 96 bits");
    });
  });

  describe("#transfer", () => {
    it("cannot send tokens to contract", async () => {
      await expect(tgen.transfer(tgen.address, 1)).to.be.revertedWith(
        "TransferrableVotingToken::transfer: cannot send tokens to contract"
      );
    });
  });

  describe("#transferFrom", () => {
    it("cannot send tokens to contract", async () => {
      await expect(
        tgen.transferFrom(other0.address, tgen.address, 1)
      ).to.be.revertedWith(
        "TransferrableVotingToken::transferFrom: cannot send tokens to contract"
      );
    });
  });
});
