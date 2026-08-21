import { expect } from "chai";
import { ethers } from "hardhat";
import { GovernanceVoting, AttributeRegistry } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * Integration test: the real GovernanceVoting contract controlling the real
 * AttributeRegistry contract — as opposed to AttributeRegistry.test.ts, which uses a plain
 * EOA standing in for "governance" to test that contract's logic in isolation.
 *
 * This is the test that actually proves the project's central claim end-to-end: an attribute
 * change only takes effect after k-of-n governor approval, and no single account — including
 * a governor acting alone — can write directly to AttributeRegistry.
 */
describe("Integration: GovernanceVoting + AttributeRegistry", function () {
  let governance: GovernanceVoting;
  let registry: AttributeRegistry;
  let governors: SignerWithAddress[];
  let alice: SignerWithAddress;
  const THRESHOLD = 3;

  const Role = { None: 0, Analyst: 1, Manager: 2, Auditor: 3, Admin: 4 };
  const Department = { None: 0, Engineering: 1, Legal: 2, Security: 3 };

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    governors = signers.slice(0, 5);
    alice = signers[6];

    const Governance = await ethers.getContractFactory("GovernanceVoting");
    governance = (await Governance.deploy(
      governors.map((g) => g.address),
      THRESHOLD
    )) as unknown as GovernanceVoting;
    await governance.waitForDeployment();

    const Registry = await ethers.getContractFactory("AttributeRegistry");
    registry = (await Registry.deploy(await governance.getAddress())) as unknown as AttributeRegistry;
    await registry.waitForDeployment();
  });

  it("applies an attribute change only after governance approval and execution", async function () {
    const data = registry.interface.encodeFunctionData("setSubjectAttributes", [
      alice.address,
      Role.Analyst,
      3,
      Department.Engineering,
      92,
    ]);

    await governance
      .connect(governors[0])
      .propose(await registry.getAddress(), data, "grant alice analyst clearance 3");

    // Before threshold is met, the attribute must not exist yet.
    await expect(registry.getSubjectAttributes(alice.address)).to.be.revertedWithCustomError(
      registry,
      "SubjectNotFound"
    );

    await governance.connect(governors[1]).approve(0);
    await governance.connect(governors[2]).approve(0);

    await governance.execute(0);

    const attrs = await registry.getSubjectAttributes(alice.address);
    expect(attrs.role).to.equal(Role.Analyst);
    expect(attrs.clearance).to.equal(3);
    expect(attrs.department).to.equal(Department.Engineering);
    expect(attrs.deviceTrustScore).to.equal(92);
  });

  it("proves no single governor can bypass governance and write directly to the registry", async function () {
    // This is the core adversarial claim of the whole project, tested at the integration
    // level: a governor — even one of only 5, with real signing authority in the system — has
    // no direct write path into AttributeRegistry at all. Their only avenue is the proposal
    // mechanism, which structurally requires 2 other governors to agree.
    await expect(
      registry
        .connect(governors[0])
        .setSubjectAttributes(alice.address, Role.Admin, 4, Department.Security, 100)
    )
      .to.be.revertedWithCustomError(registry, "NotGovernance")
      .withArgs(governors[0].address);
  });

  it("a proposal with insufficient approvals never takes effect, even after multiple execute() attempts", async function () {
    const data = registry.interface.encodeFunctionData("setSubjectAttributes", [
      alice.address,
      Role.Admin,
      4,
      Department.Security,
      100,
    ]);

    await governance.connect(governors[0]).propose(await registry.getAddress(), data, "malicious-ish grant");
    await governance.connect(governors[1]).approve(0); // only 2 of 3

    await expect(governance.execute(0)).to.be.revertedWithCustomError(governance, "ThresholdNotMet");
    // Retry — still not enough approvals, still must fail. Demonstrates this isn't a
    // race-condition or one-time check, it's enforced every time execute() is called.
    await expect(governance.execute(0)).to.be.revertedWithCustomError(governance, "ThresholdNotMet");

    await expect(registry.getSubjectAttributes(alice.address)).to.be.revertedWithCustomError(
      registry,
      "SubjectNotFound"
    );
  });
});
