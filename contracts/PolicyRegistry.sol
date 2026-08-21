// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title PolicyRegistry
/// @notice On-chain hash + URI anchor for ZeTA's off-chain policy rule set. See
///         docs/abac-model.md §6 for the full rationale: the JSON policy document itself
///         lives off-chain for gas-cost reasons, but *which* rule set is currently active is
///         anchored here, gated by the same GovernanceVoting k-of-n approval as attribute
///         mutation — so changing the active policy still can't be done unilaterally.
contract PolicyRegistry {
    address public immutable governance;

    bytes32 public policyHash;
    string public policyURI;
    uint256 public version;

    event PolicyUpdated(bytes32 indexed policyHash, string policyURI, uint256 version);

    error NotGovernance(address caller);
    error ZeroGovernanceAddress();

    modifier onlyGovernance() {
        if (msg.sender != governance) revert NotGovernance(msg.sender);
        _;
    }

    constructor(address governance_, bytes32 initialHash, string memory initialURI) {
        if (governance_ == address(0)) revert ZeroGovernanceAddress();
        governance = governance_;
        policyHash = initialHash;
        policyURI = initialURI;
        version = 1;

        emit PolicyUpdated(initialHash, initialURI, 1);
    }

    /// @notice Anyone can independently verify the active policy by fetching the document at
    /// `policyURI` and comparing keccak256(document) against `policyHash` — the property that
    /// actually matters here is that tampering with the off-chain document is detectable,
    /// not that the rules are directly queryable from chain state.
    function updatePolicy(bytes32 newHash, string calldata newURI) external onlyGovernance {
        policyHash = newHash;
        policyURI = newURI;
        version += 1;

        emit PolicyUpdated(newHash, newURI, version);
    }
}
