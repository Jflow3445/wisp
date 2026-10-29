import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { acceptFlightRules, atomic, controls, FLIGHT_TERMS, offerDraw, recoverFlight, settleExpiredFlights, startFlight } from "../src/lib/flight-service";
import { qualifiedReferrals } from "../src/lib/flight-referral";
import { referralNetwork } from "../src/lib/flight-referral-network";
import { creditUserAvailableFunds } from "../src/lib/wallet-funds";
import { drawResult, type DrawRules } from "../src/lib/flight-draw";
import { __test as chain } from "../src/lib/tron-payments";
const url = new URL(process.env.DATABASE_URL || "");
if (url.pathname!=="/nister_flight_test"||!["127.0.0.1","localhost"].includes(url.hostname))throw Error("MLM tests require the isolated loopback test database.");
let checks=0;
const check=(ok:unknown,label:string)=>{assert.ok(ok,label);checks++;console.log(`PASS ${label}`)};
const balance=async(id:string)=>(await prisma.userTradingProfile.findUniqueOrThrow({where:{userId:id}})).availableFundsUsdCents!;
async function capital(){const c=await controls(),w=await prisma.userTradingProfile.aggregate({_sum:{availableFundsUsdCents:true}}),h=await prisma.flightWithdrawal.aggregate({where:{status:{in:["PENDING","APPROVED"]}},_sum:{amountCents:true}});return c.houseBalanceCents+c.insuranceBalanceCents+(w._sum.availableFundsUsdCents??0)+(h._sum.amountCents??0);}
async function entry(id:string,stake:number,win:boolean){const q=await offerDraw(id,stake),secret=await prisma.flightOffer.findUniqueOrThrow({where:{id:q.id}});let nonce=randomUUID();while(!!drawResult(secret.seed,nonce,secret.rulesJson as unknown as DrawRules).payoutCents!==win)nonce=randomUUID();return startFlight(id,stake,nonce,FLIGHT_TERMS,q.id,q.commitment);}
async function finish(id:string,userId:string){await prisma.flightRound.update({where:{id},data:{endsAt:new Date(Date.now()-1000)}});return recoverFlight(userId,id);}
async function main(){
 const player="flight-test-member", ancestors=["network-level-1","network-level-2","network-level-3","network-level-4"];
 for(let i=3;i>=0;i--){const id=ancestors[i];await prisma.user.create({data:{id,name:`Network fixture ${i+1}`,email:`network-${i+1}@example.test`,passwordHash:"isolated-fixture-only",emailVerifiedAt:new Date(),referredById:ancestors[i+1]??null,tradingProfile:{create:{availableFundsUsdCents:0}},flightPlayer:{create:{verifiedAt:new Date()}}}});await acceptFlightRules(id);}
 await prisma.user.update({where:{id:player},data:{referredById:ancestors[0]}});
 await prisma.flightControl.update({where:{id:1},data:{enabled:true,houseBalanceCents:1000000,protectedHouseCents:0,reservedCents:0,referralBps:125,referralLevel2Bps:75,referralLevel3Bps:50,referralsEnabled:true,maxStakeCents:10000,liveLaunchedAt:new Date()}});
 await atomic(tx=>creditUserAvailableFunds({tx,userId:player,creditUsdCents:100000,reference:"mlm-fixture:funding"}));
 const beforeDeposit=await Promise.all(ancestors.map(balance)),at=new Date(),wallet="TJRabPrwbZy45sbavfcjinPJC18kjpRTv8";
 const invoice=await prisma.paymentOrder.create({data:{userId:player,reference:"MLM-DEPOSIT-ONLY",baseAmountMicros:BigInt(100000000),invoiceAmountMicros:BigInt(100000000),merchantReceiveAddress:wallet,createdAt:new Date(at.getTime()-1000),expiresAt:new Date(Date.now()+60000),graceExpiresAt:new Date(Date.now()+120000),metadataJson:{source:"flight_topup"}}});
 const beforeRewards=await prisma.flightReferralReward.count();
 await chain.finalizeTransferCredit({event:{txHash:"e".repeat(64),parsedEventIndex:0,tokenContractHex:"41"+"1".repeat(40),fromAddressHex:"41"+"2".repeat(40),toAddressHex:"41"+"3".repeat(40),amountMicros:BigInt(100000000),blockNumber:BigInt(456),blockTimestamp:at,success:true,rawPayload:{}},orderId:invoice.id});
 check(JSON.stringify(await Promise.all(ancestors.map(balance)))===JSON.stringify(beforeDeposit)&&await prisma.flightReferralReward.count()===beforeRewards,"a confirmed $100 top-up creates no referral commission at any level");
 for(const winning of [true,false]){
   const total=await capital(),balances=await Promise.all(ancestors.map(balance)),round=await entry(player,10000,winning);
   check(await capital()===total&&await prisma.flightReferralReward.count({where:{roundId:round.id}})===0,"entry freezes commissions without minting money or paying before settlement");
   await prisma.flightControl.update({where:{id:1},data:{referralBps:150,referralLevel2Bps:50,referralLevel3Bps:25}});
   const receipt=await finish(round.id,player),paid=await prisma.flightReferralReward.findMany({where:{roundId:round.id},orderBy:{level:"asc"}});
   check(paid.length===3&&paid.every((r,i)=>r.userId===ancestors[i]&&r.level===i+1&&r.amountCents===[125,75,50][i]&&r.status==="PAID"),"all three ancestors receive their frozen percentage of the $100 stake");
   check(receipt.payoutCents===(winning?20000:0),winning?"a qualifying selected winner receives the full 2x prize":"a selected loss still pays the same referral commissions");
   check((await Promise.all(ancestors.map(balance))).every((n,i)=>n===balances[i]+([125,75,50,0][i])),"level four is excluded and each ancestor is credited exactly once");
   await Promise.all(Array.from({length:5},()=>recoverFlight(player,round.id)));
   check(await prisma.flightReferralReward.count({where:{roundId:round.id}})===3&&await capital()===total,"concurrent recovery preserves unique commissions and total capital");
   await prisma.flightControl.update({where:{id:1},data:{referralBps:125,referralLevel2Bps:75,referralLevel3Bps:50}});
 }
 await prisma.flightControl.update({where:{id:1},data:{referralBps:0,referralLevel2Bps:100,referralLevel3Bps:50}});
 const noDirect=await entry(player,1000,false);await finish(noDirect.id,player);
 const noDirectRewards=await prisma.flightReferralReward.findMany({where:{roundId:noDirect.id},orderBy:{level:"asc"}});
 check(noDirectRewards.length===2&&noDirectRewards[0].level===2&&noDirectRewards[0].amountCents===10&&noDirectRewards[1].level===3&&noDirectRewards[1].amountCents===5,"zero direct commission does not suppress configured level-two and level-three rewards");
 await prisma.flightControl.update({where:{id:1},data:{referralBps:125,referralLevel2Bps:75,referralLevel3Bps:50}});
 const extra="network-no-deposit";await prisma.user.create({data:{id:extra,name:"No deposit fixture",email:"network-manual@example.test",passwordHash:"isolated-only",emailVerifiedAt:new Date(),referredById:ancestors[0],tradingProfile:{create:{availableFundsUsdCents:10000}},flightPlayer:{create:{verifiedAt:new Date()}}}});await acceptFlightRules(extra);
 const manual=await entry(extra,100,false);await finish(manual.id,extra);check(await prisma.flightReferralReward.count({where:{roundId:manual.id}})===0,"manual funding without a confirmed deposit earns no three-level commission");
 await prisma.user.update({where:{id:ancestors[1]},data:{emailVerifiedAt:null}});
 const deferred=await entry(player,10000,false);await finish(deferred.id,player);
 const rewards=await prisma.flightReferralReward.findMany({where:{roundId:deferred.id},orderBy:{level:"asc"}});
 check(rewards[0].status==="PAID"&&rewards[1].status==="PENDING"&&rewards[2].status==="PAID","one ineligible recipient defers independently without blocking the player or other ancestors");
 await prisma.user.update({where:{id:ancestors[1]},data:{emailVerifiedAt:new Date()}});await settleExpiredFlights();
 check((await prisma.flightReferralReward.findUniqueOrThrow({where:{roundId_level:{roundId:deferred.id,level:2}}})).status==="PAID","deferred level-two rewards recover once eligibility is restored");
 await prisma.userTradingProfile.update({where:{userId:ancestors[2]},data:{accountState:"SUSPENDED"}});
 const restricted=await entry(player,500,false);await finish(restricted.id,player);
 check((await prisma.flightReferralReward.findUniqueOrThrow({where:{roundId_level:{roundId:restricted.id,level:3}}})).status==="PENDING","a recipient already restricted at entry retains the earned commission for later credit");
 await prisma.userTradingProfile.update({where:{userId:ancestors[2]},data:{accountState:"ACTIVE"}});await settleExpiredFlights();
 check((await prisma.flightReferralReward.findUniqueOrThrow({where:{roundId_level:{roundId:restricted.id,level:3}}})).status==="PAID","restoring a restricted ancestor recovers its frozen commission exactly once");
 await prisma.user.update({where:{id:ancestors[2]},data:{referredById:player}});
 check((await atomic(async tx=>qualifiedReferrals(tx,player,10000,300,await controls(tx),new Date()))).length===0,"cycles beyond the immediate parent cannot create a multi-level reward");
 await prisma.user.update({where:{id:ancestors[2]},data:{referredById:ancestors[3]}});
 const original=(await prisma.user.findUniqueOrThrow({where:{id:player}})).email;
 await prisma.user.update({where:{id:player},data:{email:"network.pilot+source@gmail.com"}});await prisma.user.update({where:{id:ancestors[1]},data:{email:"networkpilot+ancestor@googlemail.com"}});
 check((await atomic(async tx=>qualifiedReferrals(tx,player,10000,300,await controls(tx),new Date()))).length===0,"Gmail aliases cannot collect self-referrals through an intermediate ancestor");
 await prisma.user.update({where:{id:player},data:{email:original}});await prisma.user.update({where:{id:ancestors[1]},data:{email:"network-2@example.test"}});
 await assert.rejects(()=>prisma.flightControl.update({where:{id:1},data:{referralBps:200,referralLevel2Bps:100,referralLevel3Bps:1}}));check(true,"the database rejects a combined commission above the collected 3% fee");
 const network=await referralNetwork(ancestors[2],null,0),first=network.nodes[0],second=await referralNetwork(ancestors[2],first.reference,0),third=await referralNetwork(ancestors[2],second.nodes[0].reference,0);
 check(network.levels.map(l=>l.count).join(',')==='1,1,2'&&third.level===3,"the private network map follows exactly three levels with correct counts");
 check(first.branchEarnedCents>0&&third.nodes.some(n=>n.earnedCents>0),"branch totals connect each node to the viewing member's real earnings");
 check(!JSON.stringify(network).includes('@')&&!JSON.stringify(network).includes(player)&&!JSON.stringify(network).includes('network-level'),"network responses omit emails, names, raw IDs and other members' balances");
 await assert.rejects(()=>referralNetwork(ancestors[0],first.reference,0));check(true,"a node token cannot expose another member's referral network");
 // Exact pool boundary after the stake joins the pool; no private operating allocation is removed.
 for(const [poolBefore,expected] of [[9500,1000],[9499,0]]){
   await prisma.flightControl.update({where:{id:1},data:{houseBalanceCents:poolBefore,protectedHouseCents:0,reservedCents:0}});
   const total=await capital(),round=await entry(player,500,true),receipt=await finish(round.id,player),stored=await prisma.flightRound.findUniqueOrThrow({where:{id:round.id}});
   check(receipt.payoutCents===expected&&stored.poolCentsAtSettlement===poolBefore+500,"pool eligibility uses the exact settlement pool and 10% boundary");
   check((await controls()).houseBalanceCents===poolBefore+500-expected&&(await controls()).protectedHouseCents===0&&await capital()===total,"a loss leaves the complete stake in the pool, and all money remains conserved");
   check(receipt.draw?.prizeCents===1000&&!('resultReason' in receipt)&&!('poolCentsAtSettlement' in receipt),"entry and receipt keep the standard 2x prize without exposing pool internals");
 }
 await prisma.flightControl.update({where:{id:1},data:{houseBalanceCents:9500,protectedHouseCents:0,reservedCents:0}});
 const x=await entry(player,500,true),y=await entry(extra,500,true);await prisma.flightRound.updateMany({where:{id:{in:[x.id,y.id]}},data:{endsAt:new Date(Date.now()-1000)}});
 await Promise.all([recoverFlight(player,x.id),recoverFlight(extra,y.id)]);
 const concurrent=await prisma.flightRound.findMany({where:{id:{in:[x.id,y.id]}}});
 check(concurrent.filter(r=>r.payoutCents===1000).length===1&&concurrent.every(r=>!r.payoutCents||r.payoutCents*10<=(r.poolCentsAtSettlement??0)),"concurrent winners cannot race past the current 10% pool ceiling");
 await prisma.flightControl.update({where:{id:1},data:{houseBalanceCents:1000000}});
 console.log(`Completed ${checks} pool and three-level referral checks against isolated MariaDB.`);
}
main().finally(()=>prisma.$disconnect());
