import {digest} from './benchmark-truth.js';
export function checkObservation(body:any,status:number,expected:{expectedCount:number;rowCount:number;resultDigest:string},candidate:string,cache:string,phase:string){
 const result:any={actualCandidate:body.meta?.candidate,actualCount:body.count??null,rowCount:Array.isArray(body.rows)?body.rows.length:null};
 let classification=status===200?'success':status===403?'denial':'failure';
 if(status===200){
  result.resultDigest=digest({count:body.count,rows:body.rows});
  if(phase!=='success'||body.count!==expected.expectedCount||result.rowCount!==expected.rowCount||result.resultDigest!==expected.resultDigest)classification='authorization_error';
  const timing=[body.evidence?.permissionMs,body.evidence?.dataMs,body.meta?.elapsedMs,body.meta?.queryCount];
  if(body.meta?.candidate!==candidate||!timing.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0)||!Number.isInteger(body.meta?.queryCount)||!body.meta?.instance||!body.evidence?.revision||(cache==='cold'?body.evidence?.cache!=='cold':!['L1','L2'].includes(body.evidence?.cache))){result.measurementError=true;classification=classification==='authorization_error'?classification:'measurement_error';}
 }
 return {...result,classification};
}
