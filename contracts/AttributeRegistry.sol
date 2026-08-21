// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title AttributeRegistry
/// @notice On-chain store for subject and resource attributes used by ZeTA's ABAC policy
///         engine. See docs/abac-model.md for the full attribute schema and rationale.
/// @dev Week 3: mutation is gated to a single immutable `governance` address, set at
///      deployment to a GovernanceVoting contract's address. Only that contract can call
///      setSubjectAttributes/setResourceAttributes — and it only does so as the result of an
///      executed, k-of-n-approved proposal (see GovernanceVoting.sol). This replaces Week 2's
///      `onlyOwner` placeholder with the actual security property this project is built
///      around: no single account, including the original deployer, has unilateral write
///      access.
contract AttributeRegistry {
    // --- Enums (mirrors docs/abac-model.md §2) ---

    enum Role {
        None,
        Analyst,
        Manager,
        Auditor,
        Admin
    }

    enum Department {
        None,
        Engineering,
        Legal,
        Security
    }

    enum ResourceType {
        None,
        Report,
        Contract,
        PersonnelRecord
    }

    // --- Structs ---

    struct SubjectAttributes {
        Role role;
        uint8 clearance; // 0-4, see docs/abac-model.md
        Department department;
        uint8 deviceTrustScore; // 0-100
        bool exists;
    }

    struct ResourceAttributes {
        uint8 classification; // 0-4, same scale as subject clearance
        Department ownerDepartment;
        ResourceType resourceType;
        bool exists;
    }

    // --- Storage ---

    /// @notice The only address permitted to mutate attributes — expected to be a deployed
    /// GovernanceVoting contract. Immutable: set once at deployment, never changeable, which
    /// is itself a deliberate security property (no upgrade path that could redirect
    /// authority elsewhere without deploying an entirely new registry).
    address public immutable governance;

    mapping(address => SubjectAttributes) private subjects;
    mapping(bytes32 => ResourceAttributes) private resources;

    // --- Events ---
    // Off-chain services (the PDP's attribute cache, per docs/architecture.md) sync state by
    // listening for these events rather than polling contract storage on every request.

    event SubjectAttributesSet(
        address indexed subject,
        Role role,
        uint8 clearance,
        Department department,
        uint8 deviceTrustScore
    );

    event ResourceAttributesSet(
        bytes32 indexed resourceId,
        uint8 classification,
        Department ownerDepartment,
        ResourceType resourceType
    );

    // --- Errors ---
    // Custom errors (vs. require-with-string) save gas on revert and are the modern Solidity
    // 0.8.4+ convention.

    error ClearanceOutOfRange(uint8 provided);
    error ClassificationOutOfRange(uint8 provided);
    error TrustScoreOutOfRange(uint8 provided);
    error SubjectNotFound(address subject);
    error ResourceNotFound(bytes32 resourceId);
    error NotGovernance(address caller);
    error ZeroGovernanceAddress();

    modifier onlyGovernance() {
        if (msg.sender != governance) revert NotGovernance(msg.sender);
        _;
    }

    constructor(address governance_) {
        if (governance_ == address(0)) revert ZeroGovernanceAddress();
        governance = governance_;
    }

    // --- Mutations (governance-gated — see contract-level @dev note) ---

    function setSubjectAttributes(
        address subject,
        Role role,
        uint8 clearance,
        Department department,
        uint8 deviceTrustScore
    ) external onlyGovernance {
        if (clearance > 4) revert ClearanceOutOfRange(clearance);
        if (deviceTrustScore > 100) revert TrustScoreOutOfRange(deviceTrustScore);

        subjects[subject] = SubjectAttributes({
            role: role,
            clearance: clearance,
            department: department,
            deviceTrustScore: deviceTrustScore,
            exists: true
        });

        emit SubjectAttributesSet(subject, role, clearance, department, deviceTrustScore);
    }

    function setResourceAttributes(
        bytes32 resourceId,
        uint8 classification,
        Department ownerDepartment,
        ResourceType resourceType
    ) external onlyGovernance {
        if (classification > 4) revert ClassificationOutOfRange(classification);

        resources[resourceId] = ResourceAttributes({
            classification: classification,
            ownerDepartment: ownerDepartment,
            resourceType: resourceType,
            exists: true
        });

        emit ResourceAttributesSet(resourceId, classification, ownerDepartment, resourceType);
    }

    // --- Reads ---
    // Reverting on "not found" (rather than silently returning zeroed structs) makes a
    // missing attribute fail loudly instead of being misread as "role: None, clearance: 0",
    // which could otherwise be misinterpreted by a caller as a legitimate low-privilege
    // subject rather than an unregistered one.

    function getSubjectAttributes(address subject)
        external
        view
        returns (SubjectAttributes memory)
    {
        SubjectAttributes memory attrs = subjects[subject];
        if (!attrs.exists) revert SubjectNotFound(subject);
        return attrs;
    }

    function getResourceAttributes(bytes32 resourceId)
        external
        view
        returns (ResourceAttributes memory)
    {
        ResourceAttributes memory attrs = resources[resourceId];
        if (!attrs.exists) revert ResourceNotFound(resourceId);
        return attrs;
    }
}
