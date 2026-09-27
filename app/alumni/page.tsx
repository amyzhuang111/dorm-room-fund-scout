import { AlumniReferrals } from "@/components/alumni-referrals";
import { alumniReferralDirectory, introCoverage } from "@/lib/domain/who-can-intro";

export default function AlumniPage() {
  return <AlumniReferrals rows={alumniReferralDirectory()} coverage={introCoverage()} />;
}
