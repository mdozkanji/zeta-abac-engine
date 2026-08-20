import { expect } from "chai";
import { ethers } from "hardhat";
import { AttributeRegistry } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("AttributeRegistry", function () {
  let registry: AttributeRegistry;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  // Role/Department/ResourceType enum indices — mirrors docs/abac-model.md §2 and the
  // contract's enum declaration order. Keeping these as named constants (rather than bare
  // numbers scattered through the tests) is the readability habit worth building now, before
  // the test suite grows.
  const Role = { None: 0, Analyst: 1, Manager: 2, Auditor: 3, Admin: 4 };
  const Department = { None: 0, Engineering: 1, Legal: 2, Security: 3 };
  const ResourceType = { None: 0, Report: 1, Contract: 2, PersonnelRecord: 3 };

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("AttributeRegistry");
    registry = (await Registry.deploy()) as unknown as AttributeRegistry;
    await registry.waitForDeployment();
  });

  describe("setSubjectAttributes", function () {
    it("allows the owner to set and retrieve subject attributes", async function () {
      await registry.setSubjectAttributes(
        alice.address,
        Role.Analyst,
        2, // clearance
        Department.Engineering,
        85 // deviceTrustScore
      );

      const attrs = await registry.getSubjectAttributes(alice.address);
      expect(attrs.role).to.equal(Role.Analyst);
      expect(attrs.clearance).to.equal(2);
      expect(attrs.department).to.equal(Department.Engineering);
      expect(attrs.deviceTrustScore).to.equal(85);
    });

    it("emits SubjectAttributesSet on write", async function () {
      await expect(
        registry.setSubjectAttributes(alice.address, Role.Manager, 3, Department.Legal, 90)
      )
        .to.emit(registry, "SubjectAttributesSet")
        .withArgs(alice.address, Role.Manager, 3, Department.Legal, 90);
    });

    it("rejects a non-owner attempting to set attributes", async function () {
      // This test exists specifically to be revisited in Week 3: once GovernanceVoting
      // replaces onlyOwner, this assertion changes from "only the owner" to "only via an
      // approved k-of-n governance proposal." Documenting that intent here so it isn't lost.
      await expect(
        registry.connect(alice).setSubjectAttributes(bob.address, Role.Analyst, 1, Department.None, 50)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("rejects clearance values above the valid range (0-4)", async function () {
      await expect(
        registry.setSubjectAttributes(alice.address, Role.Analyst, 5, Department.None, 50)
      )
        .to.be.revertedWithCustomError(registry, "ClearanceOutOfRange")
        .withArgs(5);
    });

    it("rejects device trust scores above 100", async function () {
      await expect(
        registry.setSubjectAttributes(alice.address, Role.Analyst, 2, Department.None, 101)
      )
        .to.be.revertedWithCustomError(registry, "TrustScoreOutOfRange")
        .withArgs(101);
    });
  });

  describe("setResourceAttributes", function () {
    const docId = ethers.keccak256(ethers.toUtf8Bytes("document-42"));

    it("allows the owner to set and retrieve resource attributes", async function () {
      await registry.setResourceAttributes(
        docId,
        4, // classification: top-secret
        Department.Security,
        ResourceType.Report
      );

      const attrs = await registry.getResourceAttributes(docId);
      expect(attrs.classification).to.equal(4);
      expect(attrs.ownerDepartment).to.equal(Department.Security);
      expect(attrs.resourceType).to.equal(ResourceType.Report);
    });

    it("rejects classification values above the valid range (0-4)", async function () {
      await expect(
        registry.setResourceAttributes(docId, 5, Department.Security, ResourceType.Report)
      )
        .to.be.revertedWithCustomError(registry, "ClassificationOutOfRange")
        .withArgs(5);
    });
  });

  describe("unregistered attribute lookups", function () {
    it("reverts (rather than returning zeroed defaults) for an unregistered subject", async function () {
      // This is the specific behavior called out in the contract's doc comment: a missing
      // subject must fail loudly, not silently resolve to "role: None, clearance: 0" — which
      // could otherwise be misread as a legitimate low-privilege registered user.
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
