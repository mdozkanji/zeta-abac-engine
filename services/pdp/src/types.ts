/**
 * Mirrors the enums and structs defined in contracts/AttributeRegistry.sol and
 * docs/abac-model.md §2. Keeping the numeric values in the same order as the Solidity enum
 * declarations is essential — ABI-decoded values arrive as plain numbers, and this is the
 * only place that order is encoded on the TypeScript side.
 */

export enum Role {
  None = 0,
  Analyst = 1,
  Manager = 2,
  Auditor = 3,
  Admin = 4,
}

export enum Department {
  None = 0,
  Engineering = 1,
  Legal = 2,
  Security = 3,
}

export enum ResourceType {
  None = 0,
  Report = 1,
  Contract = 2,
  PersonnelRecord = 3,
}

export interface SubjectAttributes {
  role: Role;
  clearance: number;
  department: Department;
  deviceTrustScore: number;
}

export interface ResourceAttributes {
  classification: number;
  ownerDepartment: Department;
  resourceType: ResourceType;
}
