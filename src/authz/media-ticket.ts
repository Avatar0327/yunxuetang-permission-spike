import {createHmac,timingSafeEqual} from 'node:crypto';
import {Denied} from '../infrastructure/db.js';
export interface MediaBinding {tenantId:string;personId:string;projectId:string;segment:string;revision:number}
// Public synthetic prototype key is deliberately not a production key-management claim.
const key=()=>process.env.MEDIA_TICKET_SECRET??'isolated-synthetic-permission-spike-media-key-v1';
export function issueMediaTicket(binding:MediaBinding){const body=Buffer.from(JSON.stringify({...binding,version:1,expires:Date.now()+60000})).toString('base64url');return body+'.'+createHmac('sha256',key()).update(body).digest('base64url');}
export function verifyMediaTicket(ticket:string,binding:MediaBinding){
 try{
  if(ticket.length>4096)throw new Denied();const [body,signature,...rest]=ticket.split('.');if(!body||!signature||rest.length)throw new Denied();
  const expected=createHmac('sha256',key()).update(body).digest(),actual=Buffer.from(signature,'base64url');if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new Denied();
  const decoded=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));if(decoded.version!==1||!Number.isFinite(decoded.expires)||decoded.expires<=Date.now()||Object.entries(binding).some(([k,v])=>decoded[k]!==v))throw new Denied();
 }catch{throw new Denied();}
}
