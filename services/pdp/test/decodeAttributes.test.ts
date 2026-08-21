import { decodeSubjectAttributes, decodeResourceAttributes } from "../src/chain/decodeAttributes";
import { Role, Department, ResourceType } from "../src/types";

describe("decodeAttributes", () => {
  describe("decodeSubjectAttributes", () => {
    it("maps raw numeric event args to a typed SubjectAttributes object", () => {
      const result = decodeSubjectAttributes(Role.Manager, 3, Department.Legal, 90);
      expect(result).toEqual({
        role: Role.Manager,
        clearance: 3,
        department: Department.Legal,
        deviceTrustScore: 90,
      });
    });

    it("handles the None/0 case for role and department correctly (not confused with missing data)", () => {
      const result = decodeSubjectAttributes(Role.None, 0, Department.None, 0);
      expect(result.role).toBe(Role.None);
      expect(result.department).toBe(Department.None);
    });
  });

  describe("decodeResourceAttributes", () => {
    it("maps raw numeric event args to a typed ResourceAttributes object", () => {
      const result = decodeResourceAttributes(4, Department.Security, ResourceType.Report);
      expect(result).toEqual({
        classification: 4,
        ownerDepartment: Department.Security,
        resourceType: ResourceType.Report,
      });
    });
  });
});
