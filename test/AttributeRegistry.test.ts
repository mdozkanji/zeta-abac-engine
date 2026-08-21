import { expect } from "chai";
import { ethers } from "hardhat";
import { AttributeRegistry } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("AttributeRegistry", function () {
  let registry: AttributeRegistry;
  let governance: SignerWithAddress; // stand-in EOA for a GovernanceVoting contract address —
  // see test/Integration.test.ts for the real wired-together version. Testing this contract
  // against a plain account first keeps these tests focused purely on AttributeRegistry's own
  // logic, independent of GovernanceVoting's correctness.
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  const Role = { None: 0, Analyst: 1, Manager: 2, Auditor: 3, Admin: 4 };
  const Department = { None: 0, Engineering: 1, Legal: 2, Security: 3 };
  const ResourceType = { None: 0, Report: 1, Contract: 2, PersonnelRecord: 3 };

  beforeEach(async function () {
    [governance, alice, bob] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("AttributeRegistry");
    registry = (await Registry.deploy(governance.address)) as unknown as AttributeRegistry;
    await registry.waitForDeployment();
  });

  describe("constructor", function () {
    it("rejects a zero address as the governance contract", async function () {
      const Registry = await ethers.getContractFactory("AttributeRegistry");
      await expect(Registry.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        Registry,
        "ZeroGovernanceAddress"
      );
    });

    it("records the governance address immutably", async function () {
      expect(await registry.governance()).to.equal(governance.address);
    });
  });

  describe("setSubjectAttributes", function () {
    it("allows the governance address to set and retrieve subject attributes", async function () {
      await registry
        .connect(governance)
        .setSubjectAttributes(alice.address, Role.Analyst, 2, Department.Engineering, 85);

      const attrs = await registry.getSubjectAttributes(alice.address);
      expect(attrs.role).to.equal(Role.Analyst);
      expect(attrs.clearance).to.equal(2);
      expect(attrs.department).to.equal(Department.Engineering);
      expect(attrs.deviceTrustScore).to.equal(85);
    });

    it("emits SubjectAttributesSet on write", async function () {
      await expect(
        registry
          .connect(governance)
          .setSubjectAttributes(alice.address, Role.Manager, 3, Department.Legal, 90)
      )
        .to.emit(registry, "SubjectAttributesSet")
        .withArgs(alice.address, Role.Manager, 3, Department.Legal, 90);
    });

    it("rejects a call from any address other than governance — including the deployer", async function () {
      // This is the test that matters most this week: it's the direct, testable proof of
      // "no single account has unilateral write access," which is the entire point of Week
      // 3. Note this isn't testing "a random stranger can't write" (Week 2 already proved
      // that via onlyOwner) — it's testing that NO plain EOA can, including whoever deployed
      // the contract or would have been the "owner" under the old model.
      await expect(
        registry
          .connect(alice)
          .setSubjectAttributes(bob.address, Role.Analyst, 1, Department.None, 50)
      )
        .to.be.revertedWithCustomError(registry, "NotGovernance")
        .withArgs(alice.address);
    });

    it("rejects clearance values above the valid range (0-4)", async function () {
      await expect(
        registry
          .connect(governance)
          .setSubjectAttributes(alice.address, Role.Analyst, 5, Department.None, 50)
      )
        .to.be.revertedWithCustomError(registry, "ClearanceOutOfRange")
        .withArgs(5);
    });

    it("rejects device trust scores above 100", async function () {
      await expect(
        registry
          .connect(governance)
          .setSubjectAttributes(alice.address, Role.Analyst, 2, Department.None, 101)
      )
        .to.be.revertedWithCustomError(registry, "TrustScoreOutOfRange")
        .withArgs(101);
    });
  });

  describe("setResourceAttributes", function () {
    const docId = ethers.keccak256(ethers.toUtf8Bytes("document-42"));

    it("allows the governance address to set and retrieve resource attributes", async function () {
      await registry
        .connect(governance)
        .setResourceAttributes(docId, 4, Department.Security, ResourceType.Report);

      const attrs = await registry.getResourceAttributes(docId);
      expect(attrs.classification).to.equal(4);
      expect(attrs.ownerDepartment).to.equal(Department.Security);
      expect(attrs.resourceType).to.equal(ResourceType.Report);
    });

    it("rejects a call from a non-governance address", async function () {
      await expect(
        registry
          .connect(alice)
          .setResourceAttributes(docId, 2, Department.Engineering, ResourceType.Report)
      )
        .to.be.revertedWithCustomError(registry, "NotGovernance")
        .withArgs(alice.address);
    });

    it("rejects classification values above the valid range (0-4)", async function () {
      await expect(
        registry
          .connect(governance)
          .setResourceAttributes(docId, 5, Department.Security, ResourceType.Report)
      )
        .to.be.revertedWithCustomError(registry, "ClassificationOutOfRange")
        .withArgs(5);
    });
  });

  describe("unregistered attribute lookups", function () {
    it("reverts (rather than returning zeroed defaults) for an unregistered subject", async function () {
      await expect(registry.getSubjectAttributes(bob.address))
        .to.be.revertedWithCustomError(registry, "SubjectNotFound")
        .withArgs(bob.address);
    });

    it("reverts for an unregistered resource", async function () {
      const unknownId = ethers.keccak256(ethers.toUtf8Bytes("does-not-exist"));
      await expect(registry.getResourceAttributes(unknownId))
        .to.be.revertedWithCustomError(registry, "ResourceNotFound")
        .withArgs(unknownId);
    });
  });
});
