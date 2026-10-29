import {flyMission} from './flight-mission-fixture';
import {missionRules,weatherForReserve} from '../src/lib/flight-mission-server';
import {missionPrice} from '../src/lib/flight-mission-economy';
import {effectiveStakeLimit} from '../src/lib/flight-economy';
let house=10000,protectedCents=0,wins=0,played=0;
const price=missionPrice(100,64250);
for(let i=0;i<1000;i++){
 if(effectiveStakeLimit({houseBalanceCents:house,protectedHouseCents:protectedCents,reservedCents:0,maxStakeCents:10000})<100)break;
 const weather=weatherForReserve({houseBalanceCents:house,protectedHouseCents:protectedCents,reservedCents:0,launchReserveCents:10000});
 const flight=flyMission('budget-stress-'+i,missionRules(100,64250,weather));
 house+=100;protectedCents+=price.retainedCents;
 if(flight.state.stop==='LANDED'){house-=price.prizes.soloCents;wins++;}
 played++;
 if(house<protectedCents)throw Error('Protected allocation spent');
}
if(played!==1000||house+played*price.charge.feeCents<10000)throw Error('Skilled-play funding regression requires review');
console.log(JSON.stringify({simulatedFlights:played,completedLandings:wins,funded:true,protectedRevenueIntact:house>=protectedCents,operatingResultPositive:true}));
