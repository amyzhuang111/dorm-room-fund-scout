import type { Metadata } from "next";
import { FoundersDesk } from "@/components/founders-desk";

export const metadata: Metadata = {
  title: "Founders · Campus Scout",
  description:
    "Company websites and founder profile links for every project on the Campus Scout founders desk.",
};

export default function FoundersPage() {
  return <FoundersDesk />;
}
