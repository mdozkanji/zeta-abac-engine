// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title GovernanceVoting
/// @notice A generic k-of-n proposal executor: any authorized governor can propose an
///         arbitrary contract call; it only executes once `threshold` governors approve.
///         This single mechanism secures attribute changes (AttributeRegistry), policy
///         updates (PolicyRegistry), AND the governor set itself — a proposal can target this
///         contract's own addGovernor/removeGovernor functions, which is what makes the
///         governor set "self-amending" without ever needing a separate privileged admin.
/// @dev This is the same conceptual pattern used by production multisig wallets like Gnosis
///      Safe: propose(target, data) -> approve x k -> execute() calls target.call(data).
contract GovernanceVoting {
    // --- Governor set ---

    mapping(address => bool) public isGovernor;
    address[] public governorList;
    uint256 public governorCount;

    /// @notice Fixed approval threshold (k). Not amendable in this version — changing the
    /// threshold itself is a meaningful enough decision that it's deliberately left as a
    /// documented future extension rather than something the same self-amending mechanism
    /// silently allows to be lowered to 1 by a bare k-of-n vote.
    uint256 public immutable threshold;

    // --- Proposals ---
    // Note: `hasApproved` is a separate top-level mapping (not nested inside Proposal) so
    // Proposal itself contains no mapping — Solidity forbids returning structs that contain
    // mappings, and we want `proposals(id)` to be freely readable.

    struct Proposal {
        bool exists;
        address proposer;
        address target;
        bytes data;
        string description;
        uint256 approvalCount;
        bool executed;
    }

    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasApproved;
    uint256 public proposalCount;

    // --- Events ---

    event ProposalCreated(
        uint256 indexed proposalId,
        address indexed proposer,
        address indexed target,
        string description
    );
    event ProposalApproved(uint256 indexed proposalId, address indexed governor, uint256 approvalCount);
    event ProposalExecuted(uint256 indexed proposalId, address indexed executor);
    event GovernorAdded(address indexed governor);
    event GovernorRemoved(address indexed governor);

    // --- Errors ---

    error NotGovernor(address caller);
    error OnlySelf(address caller);
    error ProposalNotFound(uint256 proposalId);
    error AlreadyExecuted(uint256 proposalId);
    error AlreadyApproved(uint256 proposalId, address governor);
    error ThresholdNotMet(uint256 proposalId, uint256 approvals, uint256 threshold);
    error ExecutionFailed(uint256 proposalId);
    error GovernorAlreadyExists(address governor);
    error GovernorNotFound(address governor);
    error CannotDropBelowThreshold(uint256 wouldBeCount, uint256 threshold);
    error InvalidThreshold();
    error DuplicateInitialGovernor(address governor);
    error ZeroAddressGovernor();

    // --- Modifiers ---

    modifier onlyGovernor() {
        if (!isGovernor[msg.sender]) revert NotGovernor(msg.sender);
        _;
    }

    /// @dev Restricts a function to only be callable by this contract calling itself — i.e.
    /// only reachable via an approved, executed proposal. This is what makes addGovernor/
    /// removeGovernor "self-amending" rather than owner-controlled.
    modifier onlySelf() {
        if (msg.sender != address(this)) revert OnlySelf(msg.sender);
        _;
    }

    constructor(address[] memory initialGovernors, uint256 threshold_) {
        if (threshold_ == 0 || threshold_ > initialGovernors.length) revert InvalidThreshold();

        for (uint256 i = 0; i < initialGovernors.length; i++) {
            address governor = initialGovernors[i];
            if (governor == address(0)) revert ZeroAddressGovernor();
            if (isGovernor[governor]) revert DuplicateInitialGovernor(governor);
            isGovernor[governor] = true;
            governorList.push(governor);
        }

        governorCount = initialGovernors.length;
        threshold = threshold_;
    }

    // --- Proposal lifecycle ---

    /// @notice Create a new proposal. The proposer's approval is recorded automatically —
    /// proposing is treated as an implicit first vote in favor, a common convention that
    /// saves a redundant transaction.
    function propose(address target, bytes calldata data, string calldata description)
        external
        onlyGovernor
        returns (uint256 proposalId)
    {
        proposalId = proposalCount++;
        proposals[proposalId] = Proposal({
            exists: true,
            proposer: msg.sender,
            target: target,
            data: data,
            description: description,
            approvalCount: 0,
            executed: false
        });

        emit ProposalCreated(proposalId, msg.sender, target, description);
        _approve(proposalId, msg.sender);
    }

    function approve(uint256 proposalId) external onlyGovernor {
        _approve(proposalId, msg.sender);
    }

    function _approve(uint256 proposalId, address governor) internal {
        Proposal storage p = proposals[proposalId];
        if (!p.exists) revert ProposalNotFound(proposalId);
        if (p.executed) revert AlreadyExecuted(proposalId);
        if (hasApproved[proposalId][governor]) revert AlreadyApproved(proposalId, governor);

        hasApproved[proposalId][governor] = true;
        p.approvalCount += 1;

        emit ProposalApproved(proposalId, governor, p.approvalCount);
    }

    /// @notice Execute an approved proposal. Deliberately not governor-gated — once threshold
    /// approvals exist, the proposal's authorization is already established; anyone (a
    /// governor, a keeper bot, etc.) triggering the actual execution transaction doesn't need
    /// additional trust, since `target.call(data)` is fixed by the original proposal.
    function execute(uint256 proposalId) external {
        Proposal storage p = proposals[proposalId];
        if (!p.exists) revert ProposalNotFound(proposalId);
        if (p.executed) revert AlreadyExecuted(proposalId);
        if (p.approvalCount < threshold) {
            revert ThresholdNotMet(proposalId, p.approvalCount, threshold);
        }

        // Effects before interaction: mark executed before the external call, standard
        // reentrancy-safety ordering even though the call target here is expected to be a
        // known, non-malicious contract in this project's threat model.
        p.executed = true;

        // Emit before the external call, not after — Slither's reentrancy-events detector
        // flags event-after-call as a pattern that can confuse off-chain observers about
        // execution order during a reentrant call. Safe to move earlier: if p.target.call
        // below fails, the whole transaction reverts, unwinding this emit along with
        // everything else, so no event is ever recorded for a failed execution either way.
        emit ProposalExecuted(proposalId, msg.sender);

        (bool success, ) = p.target.call(p.data);
        if (!success) revert ExecutionFailed(proposalId);
    }

    // --- Self-amending governor set ---
    // Reachable ONLY via a proposal that targets address(this) — see onlySelf modifier.

    function addGovernor(address governor) external onlySelf {
        if (governor == address(0)) revert ZeroAddressGovernor();
        if (isGovernor[governor]) revert GovernorAlreadyExists(governor);

        isGovernor[governor] = true;
        governorList.push(governor);
        governorCount += 1;

        emit GovernorAdded(governor);
    }

    function removeGovernor(address governor) external onlySelf {
        if (!isGovernor[governor]) revert GovernorNotFound(governor);
        if (governorCount - 1 < threshold) {
            revert CannotDropBelowThreshold(governorCount - 1, threshold);
        }

        isGovernor[governor] = false;
        governorCount -= 1;

        // Swap-and-pop removal from the enumeration array — O(1) instead of shifting every
        // element, at the cost of not preserving insertion order (irrelevant here).
        // Note: Slither's costly-loop detector flags the loop below since it contains a
        // storage-mutating operation (.pop()). Accepted as-is: governor sets in this design
        // are expected to stay small (single digits to low tens of addresses at most), so the
        // O(n) scan cost is negligible in practice. Worth revisiting only if this contract
        // were ever repurposed for a much larger governor set.
        uint256 len = governorList.length;
        for (uint256 i = 0; i < len; i++) {
            if (governorList[i] == governor) {
                governorList[i] = governorList[len - 1];
                governorList.pop();
                break;
            }
        }

        emit GovernorRemoved(governor);
    }

    function getGovernors() external view returns (address[] memory) {
        return governorList;
    }
}
