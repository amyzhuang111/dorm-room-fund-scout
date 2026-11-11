/** Counts are computed from the same deployed database as the desks. */
import fs from "node:fs";
import {databasePath,getDb} from "@/lib/db/client";
import {buildDirectoryFromDb} from "@/lib/domain/directory";
import {buildFounderIndex} from "@/lib/domain/founder-index-build";
import {listUniversities} from "@/lib/domain/queries";

export type CorpusTotals = {
  investableCompanies: number;
  foundersListed: number;
  foundersIndexed: number;
  campusesOnMap: number;
  campusesTotal: number;
  campusesWithFounders: number;
  excludedOlderAlumni: number;
  unverifiedRecency: number;
  ycMembership: number;
  peopleTotal: number;
  companiesTotal: number;
  projectsTotal: number;
};

let memo: {stamp:string;value:CorpusTotals} | null = null;
export function loadCorpusTotals(): CorpusTotals {
  const db=getDb();
  const stamp=[databasePath(),databasePath()+"-wal"].map(file=>{try{const s=fs.statSync(file);return `${s.mtimeMs}:${s.size}`;}catch{return "missing";}}).join(":");
  if(memo?.stamp===stamp)return memo.value;
  const count=(sql:string)=>(db.prepare(sql).get() as {n:number}).n;
  const {cards}=buildDirectoryFromDb();
  const universities=listUniversities();
  const value:CorpusTotals={
    investableCompanies:cards.length,
    foundersListed:count(`SELECT COUNT(DISTINCT r.person_id) n FROM person_project_roles r JOIN projects p ON p.id=r.project_id WHERE p.kind='company' AND p.is_investable_candidate=1 AND r.role LIKE '%founder%'`),
    foundersIndexed:buildFounderIndex().length,
    campusesOnMap:universities.filter(u=>u.lat!=null&&u.lon!=null).length,
    campusesTotal:universities.length,
    campusesWithFounders:count(`SELECT COUNT(DISTINCT a.university_id) n FROM affiliations a JOIN people p ON p.id=a.person_id WHERE p.founder_status='founder'`),
    excludedOlderAlumni:count(`SELECT COUNT(*) n FROM projects WHERE kind='company' AND excluded_reason='founders not current/recent (<2023)'`),
    unverifiedRecency:count(`SELECT COUNT(*) n FROM projects WHERE kind='company' AND excluded_reason='unverified recency'`),
    ycMembership:cards.filter(c=>c.programs.some(p=>/y combinator/i.test(p))).length,
    peopleTotal:count('SELECT COUNT(*) n FROM people'),
    companiesTotal:count("SELECT COUNT(*) n FROM projects WHERE kind='company'"),
    projectsTotal:count('SELECT COUNT(*) n FROM projects'),
  };
  memo={stamp,value};return value;
}

export { formatCorpusDate } from "@/lib/display/corpus-date";

