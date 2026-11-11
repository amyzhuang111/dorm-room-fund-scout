import type { Ratings } from '../scoring/rubric';
export interface StartbookPerson {
  key: string; name: string; role: string; sourceUrl: string; linkedin: string | null;
  lseQualification: string | null; reportedGraduationYear: number | null;
}
export interface StartbookCompany {
  key: string; name: string; sourceUrl: string; website: string | null; companyLinkedin: string | null;
  description: string; sectors: string[]; countries: string[]; reportedStage: string | null;
  fundraisingStatus: string | null; hq: string | null; teamSize: string | null;
  snapshotSha256: string; availableEvidenceFields: string[]; founders: StartbookPerson[];
  existingProjectId?: string; identityEvidence?: string; identitySourceUrl?: string;
  businessModelTags: string[];
  review: { status: string; ratings: Ratings; notes: string; evaluator: string; reviewedAt: string };
}
export interface StartbookBatch {
  sourceUrl: string; retrievedAt: string; expectedCount: number; companies: StartbookCompany[];
}
