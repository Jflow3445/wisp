import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { acceptFlightRules, atomic, controls, flightSnapshot, FLIGHT_TERMS, offerDraw, pilotFlight, abortMission, recoverFlight, startFlight, collectFlight } from "../src/lib/flight-service";
import { drawResult, drawCommitment, type DrawRules } from "../src/lib/flight-draw";
import { creditUserAvailableFunds } from "../src/lib/wallet-funds";
import { missionRules, missionCommitment } from "../src/lib/flight-mission-server";
import { flyMission } from "./flight-mission-fixture";
const url = new URL(process.env.DATABASE_URL || "");
if(url.pathname!=="/nister_flight_test"||!["127.0.0.1","localhost"].includes(url.hostname))throw Error("Draw integration requires the isolated loopback test database.");
let count=0;
const check=(ok:unknown,label:string)=>{assert.ok(ok,label);count++;console.log(`PASS ${label}`)};
const balance=async(id:string)=>(await prisma.userTradingProfile.findUniqueOrThrow({where:{userId:id}})).availableFundsUsdCents!;
async function capital(){const c=await controls(),w=await prisma.userTradingProfile.aggregate({_sum:{availableFundsUsdCents:true}}),h=await prisma.flightWithdrawal.aggregate({where:{status:{in:["PENDING","APPROVED"]}},_sum:{amountCents:true}});return c.houseBalanceCents+c.insuranceBalanceCents+(w._sum.availableFundsUsdCents??0)+(h._sum.amountCents??0);}
async function main(){
 const a="flight-test-member",b="flight-test-admin";
 await prisma.flightControl.update({where:{id:1},data:{houseBalanceCents:1000000,protectedHouseCents:0,reservedCents:0,houseEdgePpm:64250,enabled:true,maxStakeCents:10000,liveLaunchedAt:new Date()}});
 for(const id of [a,b]){await acceptFlightRules(id);await atomic(tx=>creditUserAvailableFunds({tx,userId:id,creditUsdCents:20000,reference:`draw-fixture:${id}`}));}
 let offer=await offerDraw(a,500);
 check(offer.prizeCents===1000&&offer.totalCents===515&&!['seed','winPpm','retainedCents','weather','houseEdgePpm'].some(k=>k in offer),"entry shows its fixed prize and exact cost without operating settings");
 const before=await balance(a);
 await assert.rejects(()=>startFlight(b,500,randomUUID(),FLIGHT_TERMS,offer.id,offer.commitment),/Refresh/);
 await assert.rejects(()=>startFlight(a,500,randomUUID(),FLIGHT_TERMS,offer.id,'0'.repeat(64)),/Refresh/);
 await prisma.flightOffer.update({where:{id:offer.id},data:{expiresAt:new Date(Date.now()-1000)}});
 await assert.rejects(()=>startFlight(a,500,randomUUID(),FLIGHT_TERMS,offer.id,offer.commitment),/Refresh/);
 check(await balance(a)===before,"foreign, altered and expired entries never charge a wallet");
 offer=await offerDraw(a,500);const key=randomUUID(),totalBefore=await capital();
 const replies=await Promise.all(Array.from({length:5},()=>startFlight(a,500,key,FLIGHT_TERMS,offer.id,offer.commitment)));
 const r=replies[0],row=await prisma.flightRound.findUniqueOrThrow({where:{id:r.id}}),rules=row.rulesJson as unknown as DrawRules;
 check(replies.every(x=>x.id===r.id)&&await balance(a)===before-515,"concurrent entry retries debit one stake and one play fee");
 check(r.engine===9&&!r.pilot&&!r.mission&&r.draw?.prizeCents===1000&&!('proof' in r)&&!r.offerId,"new draws have no controls, contests, cashout or early seed disclosure");
 check(drawCommitment(row.seed,rules,500)===offer.commitment&&row.reservationCents===0,"the accepted configuration remains committed and the pool condition is recorded without inventing a guaranteed liability");
 await assert.rejects(()=>pilotFlight(a,r.id,1,500,0),/no piloting/);
 await assert.rejects(()=>abortMission(a,r.id),/finish automatically/);
 await assert.rejects(()=>collectFlight(a,r.id,'0'.repeat(32)),/still running/);
 check((await recoverFlight(a,r.id)).status==="FLYING"&&await balance(a)===before-515,"early recovery and control attempts cannot alter a random outcome or create refunds");
 const expected=drawResult(row.seed,key,rules).payoutCents,protectedBefore=(await controls()).protectedHouseCents;
 await prisma.flightControl.update({where:{id:1},data:{enabled:false,houseEdgePpm:500000}});
 await prisma.flightRound.update({where:{id:r.id},data:{endsAt:new Date(Date.now()-1000)}});
 const receipts=await Promise.all(Array.from({length:6},()=>recoverFlight(a,r.id)));
 check(receipts.every(x=>x.status==="SETTLED"&&x.payoutCents===expected)&&await balance(a)===before-515+expected,"accepted draws settle under their frozen rules even after an admin changes or pauses new play");
 check(await prisma.flightWalletEntry.count({where:{reference:`flight:${r.id}:return`}})===1&&(await controls()).reservedCents===0,"repeated recovery pays once and releases the complete liability");
 check(await capital()===totalBefore&&(await controls()).protectedHouseCents===protectedBefore,"draw settlement conserves every cent and cannot spend protected revenue");
 check((await startFlight(a,500,key,'legacy')).id===r.id,"an accepted entry remains recoverable without a current offer or new consent");
 check(!['winPpm','houseEdgePpm','operatorMarginCents'].some(k=>JSON.stringify(receipts[0]).includes(k)),"completed member receipts keep private configuration fields out of the response");
 await prisma.flightControl.update({where:{id:1},data:{enabled:true,houseEdgePpm:64250}});
 // Isolated fixtures choose known nonces to verify both real financial branches.
 for (const winning of [true,false]) {
   const q=await offerDraw(a,100),secret=await prisma.flightOffer.findUniqueOrThrow({where:{id:q.id}}),frozen=secret.rulesJson as unknown as DrawRules;
   let nonce=randomUUID();while(!!drawResult(secret.seed,nonce,frozen).payoutCents!==winning)nonce=randomUUID();
   const prior=await balance(a),record=await startFlight(a,100,nonce,FLIGHT_TERMS,q.id,q.commitment);
   await prisma.flightRound.update({where:{id:record.id},data:{endsAt:new Date(Date.now()-1000)}});
   const settled=await recoverFlight(a,record.id);
   check(settled.payoutCents===(winning?200:0)&&await balance(a)===prior-103+(winning?200:0),winning?"a winning draw credits the entire displayed prize":"a losing draw keeps the stake and fee without a false return");
 }
 // Existing accepted engine-7 missions retain their original physical settlement.
 offer=await offerDraw(a,500);const legacy=await startFlight(a,500,randomUUID(),FLIGHT_TERMS,offer.id,offer.commitment);
 const oldRules=missionRules(500,64250),seed='accepted-legacy-mission',run=flyMission(seed,oldRules),at=new Date(Date.now()-run.state.tick*20-1000);
 await prisma.flightControl.update({where:{id:1},data:{reservedCents:{increment:1000}}});
 await prisma.flightRound.update({where:{id:legacy.id},data:{engineVersion:7,reservationCents:1000,seed,commitment:missionCommitment(seed,oldRules,500,1000),rulesJson:oldRules as unknown as Prisma.InputJsonValue,missionSeedJson:[],pilotStateJson:run.state as unknown as Prisma.InputJsonValue,pilotInputsJson:run.inputs as Prisma.InputJsonValue,startedAt:at,endsAt:new Date(at.getTime()+60000)}});
 const old=await recoverFlight(a,legacy.id);
 check(old.engine===7&&old.payoutCents===(run.state.stop==='LANDED'?625:0),"already accepted missions keep their original objectives and prize during the change");
 check((await flightSnapshot(a)).termsVersion===FLIGHT_TERMS,"new rules require explicit updated consent while retaining the existing account");
 console.log(`Completed ${count} draw integration checks against isolated MariaDB.`);
}
main().finally(()=>prisma.$disconnect());
