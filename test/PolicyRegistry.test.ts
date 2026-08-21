import { expect } from "chai";
import { ethers } from "hardhat";
import { PolicyRegistry } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("PolicyRegistry", function () {
  let registry: PolicyRegistry;
  let governance: SignerWithAddress; // stand-in EOA — same pattern as AttributeRegistry.test.ts.
  // See test/Integration.test.ts for the real-GovernanceVoting-wired version, which we'll
  // extend to cover PolicyRegistry too if a future week needs it; for now this mirrors the
  // isolation-testing approach already established for AttributeRegistry.
  let alice: SignerWithAddress;

  const initialHash = ethers.keccak256(ethers.toUtf8Bytes("policy-v1"));
  const initialURI = "ipfs://policy-v1";

  beforeEach(async function () {
    [governance, alice] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("PolicyRegistry");
    registry = (await Registry.deploy(
      governance.address,
      initialHash,
      initialURI
    )) as unknown as PolicyRegistry;
    await registry.waitForDeployment();
  });

  describe("constructor", function () {
    it("sets the initial policy hash, URI, and version", async function () {
      expect(await registry.policyHash()).to.equal(initialHash);
      expect(await registry.policyURI()).to.equal(initialURI);
      expect(await registry.version()).to.equal(1);
    });

    it("rejects a zero address as the governance contract", async function () {
      const Registry = await ethers.getContractFactory("PolicyRegistry");
      await expect(
        Registry.deploy(ethers.ZeroAddress, initialHash, initialURI)
      ).to.be.revertedWithCustomError(Registry, "ZeroGovernanceAddress");
    });

    it("emits PolicyUpdated on deployment", async function () {
      // Deployment itself establishes policy v1 — emitting the same event a later update
      // would emit keeps off-chain indexers (the PDP's policy sync, arriving Week 5/6) able
      // to rely on a single event type for "what is the current policy," rather than needing
      // separate handling for "initial" vs. "updated" policy state.
      //
      // Note: the emit matcher's target must be a deployed contract INSTANCE (so it can bind
      // the address and parse logs from the receipt), not the ContractFactory itself — passing
      // the factory directly produced an opaque "expected 32 bytes" error from deep in the
      // provider layer the first time this was written. Deploy first, then assert against the
      // resulting instance's deploymentTransaction().
      const Registry = await ethers.getContractFactory("PolicyRegistry");
      const deployed = await Registry.deploy(governance.address, initialHash, initialURI);

      await expect(deployed.deploymentTransaction())
        .to.emit(deployed, "PolicyUpdated")
        .withArgs(initialHash, initialURI, 1);
    });
  });

  describe("updatePolicy", function () {
    it("allows the governance address to update the policy and bumps the version", async function () {
      const newHash = ethers.keccak256(ethers.toUtf8Bytes("policy-v2"));
      const newURI = "ipfs://policy-v2";

      await expect(registry.connect(governance).updatePolicy(newHash, newURI))
        .to.emit(registry, "PolicyUpdated")
        .withArgs(newHash, newURI, 2);

      expect(await registry.policyHash()).to.equal(newHash);
      expect(await registry.policyURI()).to.equal(newURI);
      expect(await registry.version()).to.equal(2);
    });

    it("rejects a call from a non-governance address", async function () {
      const newHash = ethers.keccak256(ethers.toUtf8Bytes("policy-v2"));
      await expect(
        registry.connect(alice).updatePolicy(newHash, "ipfs://policy-v2")
      )
        .to.be.revertedWithCustomError(registry, "NotGovernance")
        .withArgs(alice.address);
    });

    it("supports multiple sequential updates, each bumping the version", async function () {
      const hash2 = ethers.keccak256(ethers.toUtf8Bytes("policy-v2"));
      const hash3 = ethers.keccak256(ethers.toUtf8Bytes("policy-v3"));

      await registry.connect(governance).updatePolicy(hash2, "ipfs://policy-v2");
      await registry.connect(governance).updatePolicy(hash3, "ipfs://policy-v3");

      expect(await registry.version()).to.equal(3);
      expect(await registry.policyHash()).to.equal(hash3);
    });
  });
});
