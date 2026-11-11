import type Database from 'better-sqlite3';
import type { Catalog } from '../../lib/discovery/review';

export function readCatalog(db:Database.Database):Catalog {
  const roles=db.prepare('SELECT person_id,project_id FROM person_project_roles').all() as {person_id:string;project_id:string}[];
  const affiliations=db.prepare('SELECT person_id,university_id FROM affiliations').all() as {person_id:string;university_id:string}[];
  const companiesByPerson=new Map<string,string[]>(), campusesByPerson=new Map<string,string[]>();
  for(const row of roles) companiesByPerson.set(row.person_id,[...(companiesByPerson.get(row.person_id)??[]),row.project_id]);
  for(const row of affiliations) campusesByPerson.set(row.person_id,[...(campusesByPerson.get(row.person_id)??[]),row.university_id]);
  return {
    campuses:db.prepare('SELECT id,name FROM universities').all() as Catalog['campuses'],
    companies:db.prepare("SELECT id,name,website_url AS website FROM projects WHERE kind='company'").all() as Catalog['companies'],
    people:(db.prepare('SELECT id,name,aliases_json FROM people').all() as {id:string;name:string;aliases_json:string}[]).map(p=>({id:p.id,name:p.name,linkedinUrls:(JSON.parse(p.aliases_json) as string[]).filter(v=>v.includes('linkedin.com/in/')).map(v=>v.replace(/^linkedin:/,'')),campusIds:campusesByPerson.get(p.id)??[],companyIds:companiesByPerson.get(p.id)??[]})),
  };
}
