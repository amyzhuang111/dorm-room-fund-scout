/** Only in-product destinations may be carried through a network exploration. */
export function safeReturnTo(value:string|null|undefined):string {
  if(!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  try {const url=new URL(value,'https://campus-scout.invalid');if(url.origin!=='https://campus-scout.invalid')return '/';
    if(!['/','/companies','/founders','/campuses','/founder/discover','/work/shortlist'].includes(url.pathname) && !/^\/startup\/[\w-]+$/.test(url.pathname))return '/';
    return url.pathname+url.search;
  } catch {return '/';}
}
export function networkExplorationHref({entity,kind,campus,returnTo}:{entity?:string;kind?:'founder'|'startup';campus?:string;returnTo?:string}) {
  const params=new URLSearchParams();
  if(entity){params.set('entity',entity);if(kind)params.set('entityType',kind);}
  if(campus)params.set('campusName',campus);
  if(returnTo)params.set('returnTo',safeReturnTo(returnTo));
  return `/networks${params.size?'?'+params:''}#network-map`;
}
