import { signOutAction } from "@/lib/auth/actions";
import { currentMember } from "@/lib/auth/guard";
import { TopNav } from "./top-nav";

export async function TopNavGate() {
  const member = await currentMember();
  return <TopNav signedIn={!!member} email={member?.email ?? null} signOutAction={signOutAction} />;
}
