import { plainTextDeep } from "@/lib/display/plain-text";
import { newsForPerson, newsForProject } from "@/lib/domain/news";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const personId = url.searchParams.get("person");
  const projectId = url.searchParams.get("project");
  if (personId) return Response.json({ items: plainTextDeep(newsForPerson(personId)) });
  if (projectId) return Response.json({ items: plainTextDeep(newsForProject(projectId)) });
  return Response.json({ items: [] });
}
