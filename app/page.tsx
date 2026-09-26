import { redirect } from "next/navigation";
import { HomeMap } from "@/components/home-map";

// `/` is the global map. Table and network stay on Startup Discover so those
// bookmarks keep working, and the globe shell does not wait on the database.
export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  if (sp.view === "table" || sp.view === "network") {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) {
      if (value) qs.set(key, value);
    }
    redirect(`/startup/discover?${qs.toString()}`);
  }
  return <HomeMap initial={sp} />;
}
