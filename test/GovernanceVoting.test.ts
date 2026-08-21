import { expect } from "chai";
import { ethers } from "hardhat";
import { GovernanceVoting } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("GovernanceVoting", function () {
  let governance: GovernanceVoting;
  let governors: SignerWithAddress[]; // 5 initial governors
  let outsider: SignerWithAddress; // not a governor
  const THRESHOLD = 3;

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    governors = signers.slice(0, 5);
    outsider = signers[5];

    const Governance = await ethers.getContractFactory("GovernanceVoting");
    governance = (await Governance.deploy(
      governors.map((g) => g.address),
      THRESHOLD
    )) as unknown as GovernanceVoting;
    await governance.waitForDeployment();
  });

  describe("constructor", function () {
    it("registers all initial governors", async function () {
      for (const g of governors) {
        expect(await governance.isGovernor(g.address)).to.equal(true);
      }
      expect(await governance.governorCount()).to.equal(5);
    });

    it("rejects a threshold of zero", async function () {
      const Governance = await ethers.getContractFactory("GovernanceVoting");
      await expect(
        Governance.deploy(governors.map((g) => g.address), 0)
      ).to.be.revertedWithCustomError(Governance, "InvalidThreshold");
    });

    it("rejects a threshold greater than the number of initial governors", async function () {
      const Governance = await ethers.getContractFactory("GovernanceVoting");
      await expect(
        Governance.deploy(governors.map((g) => g.address), 6)
      ).to.be.revertedWithCustomError(Governance, "InvalidThreshold");
    });

    it("rejects duplicate addresses in the initial governor list", async function () {
      const Governance = await ethers.getContractFactory("GovernanceVoting");
      const dup = [governors[0].address, governors[0].address, governors[1].address];
      await expect(Governance.deploy(dup, 2)).to.be.revertedWithCustomError(
        Governance,
        "DuplicateInitialGovernor"
      );
    });
  });

  describe("propose / approve / execute — happy path", function () {
    it("executes once threshold approvals are reached", async function () {
      // A trivial, harmless target call: propose that the governance contract call its own
      // getGovernors() — a view function, safe as an execution target, purely to exercise
      // the propose->approve->execute mechanics without depending on AttributeRegistry.
      const data = governance.interface.encodeFunctionData("getGovernors");

      const tx = await governance.connect(governors[0]).propose(
        await governance.getAddress(),
        data,
        "test proposal"
      );
      const receipt = await tx.wait();
      const proposalId = 0; // first proposal in a fresh contract

      // Proposer's approval is automatic (see propose()'s @notice) — 1 of 3 needed already.
      let proposal = await governance.proposals(proposalId);
      expect(proposal.approvalCount).to.equal(1);

      await governance.connect(governors[1]).approve(proposalId);
      await governance.connect(governors[2]).approve(proposalId);

      proposal = await governance.proposals(proposalId);
      expect(proposal.approvalCount).to.equal(3);

      await expect(governance.execute(proposalId)).to.emit(governance, "ProposalExecuted");
    });

    it("allows any account (not just governors) to trigger execute() once threshold is met", async function () {
      const data = governance.interface.encodeFunctionData("getGovernors");
      await governance.connect(governors[0]).propose(await governance.getAddress(), data, "p");
      await governance.connect(governors[1]).approve(0);
      await governance.connect(governors[2]).approve(0);

      // outsider is not a governor at all, yet can call execute — see execute()'s @notice for
      // why this is safe: the call target/data was already fixed and authorized at proposal
      // approval time.
      await expect(governance.connect(outsider).execute(0)).to.not.be.reverted;
    });
  });

  describe("adversarial: single governor cannot force execution", function () {
    it("reverts ThresholdNotMet when only the proposer has approved", async function () {
      const data = governance.interface.encodeFunctionData("getGovernors");
      await governance.connect(governors[0]).propose(await governance.getAddress(), data, "p");

      // This is the single most important test in this file: it directly demonstrates the
      // property the entire project claims — one governor, alone, cannot make a change take
      // effect, no matter how many times they try.
      await expect(governance.execute(0))
        .to.be.revertedWithCustomError(governance, "ThresholdNotMet")
        .withArgs(0, 1, THRESHOLD);
    });

    it("reverts even with 2 of 3 required approvals", async function () {
      const data = governance.interface.encodeFunctionData("getGovernors");
      await governance.connect(governors[0]).propose(await governance.getAddress(), data, "p");
      await governance.connect(governors[1]).approve(0);

      await expect(governance.execute(0))
        .to.be.revertedWithCustomError(governance, "ThresholdNotMet")
        .withArgs(0, 2, THRESHOLD);
    });
  });

  describe("approval integrity", function () {
    it("rejects a governor approving the same proposal twice", async function () {
      const data = governance.interface.encodeFunctionData("getGovernors");
      await governance.connect(governors[0]).propose(await governance.getAddress(), data, "p");

      await expect(governance.connect(governors[0]).approve(0))
        .to.be.revertedWithCustomError(governance, "AlreadyApproved")
        .withArgs(0, governors[0].address);
    });

    it("rejects approval from a non-governor", async function () {
      const data = governance.interface.encodeFunctionData("getGovernors");
      await governance.connect(governors[0]).propose(await governance.getAddress(), data, "p");

      await expect(
        governance.connect(outsider).approve(0)
      ).to.be.revertedWithCustomError(governance, "NotGovernor").withArgs(outsider.address);
    });

    it("rejects proposals from a non-governor", async function () {
      const data = governance.interface.encodeFunctionData("getGovernors");
      await expect(
        governance.connect(outsider).propose(await governance.getAddress(), data, "p")
      ).to.be.revertedWithCustomError(governance, "NotGovernor").withArgs(outsider.address);
    });

    it("rejects executing an already-executed proposal", async function () {
      const data = governance.interface.encodeFunctionData("getGovernors");
      await governance.connect(governors[0]).propose(await governance.getAddress(), data, "p");
      await governance.connect(governors[1]).approve(0);
      await governance.connect(governors[2]).approve(0);
      await governance.execute(0);

      await expect(governance.execute(0)).to.be.revertedWithCustomError(
        governance,
        "AlreadyExecuted"
      );
    });

    it("rejects approving an already-executed proposal", async function () {
      const data = governance.interface.encodeFunctionData("getGovernors");
      await governance.connect(governors[0]).propose(await governance.getAddress(), data, "p");
      await governance.connect(governors[1]).approve(0);
      await governance.connect(governors[2]).approve(0);
      await governance.execute(0);

      await expect(
        governance.connect(governors[3]).approve(0)
      ).to.be.revertedWithCustomError(governance, "AlreadyExecuted");
    });
  });

  describe("self-amending governor set", function () {
    it("adds a new governor via an approved proposal", async function () {
      const newGovernor = outsider;
      const data = governance.interface.encodeFunctionData("addGovernor", [newGovernor.address]);

      await governance.connect(governors[0]).propose(await governance.getAddress(), data, "add governor");
      await governance.connect(governors[1]).approve(0);
      await governance.connect(governors[2]).approve(0);

      await expect(governance.execute(0))
        .to.emit(governance, "GovernorAdded")
        .withArgs(newGovernor.address);

      expect(await governance.isGovernor(newGovernor.address)).to.equal(true);
      expect(await governance.governorCount()).to.equal(6);
    });

    it("a newly added governor can propose and approve", async function () {
      const newGovernor = outsider;
      const addData = governance.interface.encodeFunctionData("addGovernor", [newGovernor.address]);
      await governance.connect(governors[0]).propose(await governance.getAddress(), addData, "add");
      await governance.connect(governors[1]).approve(0);
      await governance.connect(governors[2]).approve(0);
      await governance.execute(0);

      // Now proposal #1: newGovernor participates
      const data = governance.interface.encodeFunctionData("getGovernors");
      await expect(governance.connect(newGovernor).propose(await governance.getAddress(), data, "p2"))
        .to.not.be.reverted;
    });

    it("removes a governor via an approved proposal", async function () {
      const toRemove = governors[4];
      const data = governance.interface.encodeFunctionData("removeGovernor", [toRemove.address]);

      await governance.connect(governors[0]).propose(await governance.getAddress(), data, "remove");
      await governance.connect(governors[1]).approve(0);
      await governance.connect(governors[2]).approve(0);

      await expect(governance.execute(0))
        .to.emit(governance, "GovernorRemoved")
        .withArgs(toRemove.address);

      expect(await governance.isGovernor(toRemove.address)).to.equal(false);
      expect(await governance.governorCount()).to.equal(4);
    });

    it("prevents removing a governor below the threshold count", async function () {
      // Start at 5 governors, threshold 3. Remove 2 (down to 3) — should succeed. A third
      // removal would drop below threshold and must revert.
      async function removeViaProposal(target: SignerWithAddress) {
        const data = governance.interface.encodeFunctionData("removeGovernor", [target.address]);
        const nextId = await governance.proposalCount();
        await governance.connect(governors[0]).propose(await governance.getAddress(), data, "remove");
        // Approve with two governors that are NOT the target being removed, and not already
        // used up — cycle through remaining governors to always have 2 more approvals.
        const approvers = governors.filter((g) => g.address !== target.address).slice(1, 3);
        for (const a of approvers) {
          await governance.connect(a).approve(nextId);
        }
        await governance.execute(nextId);
      }

      await removeViaProposal(governors[4]); // 5 -> 4
      await removeViaProposal(governors[3]); // 4 -> 3 (== threshold, allowed)

      // Now attempt a third removal — should fail since count would drop to 2 < threshold 3.
      const data = governance.interface.encodeFunctionData("removeGovernor", [governors[2].address]);
      const proposalId = await governance.proposalCount();
      await governance.connect(governors[0]).propose(await governance.getAddress(), data, "remove");
      await governance.connect(governors[1]).approve(proposalId);
      // Remaining governor set at this point is exactly {g0, g1, g2} — reaching the 3-approval
      // threshold requires g2 (the removal target) to approve their own removal too. Nothing
      // in the contract prevents a target from voting on a proposal about themselves; this is
      // a deliberate simplification worth flagging as a real design question for a future
      // iteration (should self-removal votes be disallowed?), not an oversight here.
      await governance.connect(governors[2]).approve(proposalId);
      // With all 3 approvals in, execute() proceeds past the ThresholdNotMet check and
      // actually calls removeGovernor — which itself reverts with CannotDropBelowThreshold,
      // surfacing here as the outer call's generic ExecutionFailed.
      await expect(governance.execute(proposalId)).to.be.revertedWithCustomError(
        governance,
        "ExecutionFailed"
      );
    });

    it("rejects a direct (non-self) call to addGovernor", async function () {
      // Proves addGovernor/removeGovernor are only reachable via the proposal mechanism, not
      // callable directly by any governor or outsider.
      await expect(
        governance.connect(governors[0]).addGovernor(outsider.address)
      ).to.be.revertedWithCustomError(governance, "OnlySelf");
    });

    it("rejects a direct (non-self) call to removeGovernor", async function () {
      await expect(
        governance.connect(governors[0]).removeGovernor(governors[1].address)
      ).to.be.revertedWithCustomError(governance, "OnlySelf");
    });
  });
});
