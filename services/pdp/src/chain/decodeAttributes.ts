import { SubjectAttributes, ResourceAttributes } from "../types";

/**
 * Deliberately pure functions with no I/O — no ethers Contract, no Redis, nothing that
 * requires mocking a network or a database to test. Event args arrive from ethers as plain
 * numbers/strings (or bigint for larger integer types, though everything here fits in a JS
 * number safely since the contract caps clearance/classification at 4 and trust score at
 * 100). Keeping this decoding logic separate from the code that actually listens for events
 * is what makes it possible to unit test the "did we interpret the on-chain data correctly"
 * question independently of "did we correctly subscribe to the right event."
 */

export function decodeSubjectAttributes(
  role: number,
  clearance: number,
  department: number,
  deviceTrustScore: number
): SubjectAttributes {
  return { role, clearance, department, deviceTrustScore };
}

export function decodeResourceAttributes(
  classification: number,
  ownerDepartment: number,
  resourceType: number
): ResourceAttributes {
  return { classification, ownerDepartment, resourceType };
}
