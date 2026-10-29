'use strict';
(() => {
  const root=document.querySelector('#wallet-withdrawals');if(!root)return;
  const form=root.querySelector('#withdrawal-form'),button=root.querySelector('#withdrawal-submit'),message=root.querySelector('#withdrawal-message');
  const money=c=>'GHS '+(c/100).toFixed(2),key='nister.withdrawal.'+root.dataset.account;
  let busy=false,snapshot,pending,lastReceipt,fresh=false,refreshId=0;
  const status={pending:'Awaiting approval',approved:'Approved · awaiting MoMo',paid:'Paid',declined:'Declined · refunded'};
  function tell(text,error=false){message.hidden=!text;message.textContent=text;message.dataset.error=String(error);}
  function receiptMessage(row){return 'Request '+row.id+': '+(status[row.status]||'Recorded')+'.';}
  function readFailure(error){
    tell(lastReceipt?'Request '+lastReceipt.id+' was recorded ('+(status[lastReceipt.status]||lastReceipt.status)+'). Balances could not be refreshed; use Refresh requests.':error.message,true);
  }
  function store(value){
    try{if(value)sessionStorage.setItem(key,JSON.stringify(value));else sessionStorage.removeItem(key);}catch(ignored){/* Retain the exact request in memory when browser storage is unavailable. */}
  }
  function restore(){
    try{
      const value=JSON.parse(sessionStorage.getItem(key)||'null');
      if(!value)return null;
      if(typeof value!=='object'||Array.isArray(value)||!['account_number','name','network','amount','request_key'].every(k=>typeof value[k]==='string')
        ||!/^[A-Za-z0-9_-]{16,64}$/.test(value.request_key)||!/^\d{1,8}(?:\.\d{1,2})?$/.test(value.amount)
        ||!['MTN','TELECEL','AT'].includes(value.network)||value.name.trim().length<2){store(null);return null;}
      return value;
    }catch(ignored){store(null);return null;}
  }
  function controls(){
    const active=snapshot?.withdrawals.some(r=>r.status==='pending'||r.status==='approved');
    for(const field of form.querySelectorAll('input,select'))field.disabled=busy||Boolean(pending)||Boolean(active)||!fresh;
    button.disabled=busy||(!pending&&(!snapshot||!fresh||Boolean(active)||snapshot.enabled===false));
    button.textContent=pending?'Retry this request':active?'Withdrawal awaiting completion':!fresh?'Refresh requests to continue':snapshot.enabled===false?'Withdrawals temporarily unavailable':'Request withdrawal';
  }
  async function api(payload){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch('/withdrawal-api.php',{credentials:'same-origin',cache:'no-store',signal:controller.signal,...(payload?{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':root.dataset.csrf},body:JSON.stringify(payload)}:{})});
      const data=await response.json();if(!response.ok||!data.ok){const e=new Error(data.message||'Unable to load withdrawals.');e.status=response.status;e.errorCode=data.error;throw e;}return data;
    }finally{clearTimeout(timer);}
  }
  function element(tag,text,className){const e=document.createElement(tag);if(text)e.textContent=text;if(className)e.className=className;return e;}
  function render(){
    if(!snapshot){controls();return;}
    root.querySelector('#withdrawal-minimum').textContent=snapshot.minimum_cents?money(snapshot.minimum_cents):'Loading…';
    root.querySelector('#withdrawal-available').textContent=fresh?money(snapshot.wallet.available_cents):'Updating…';
    root.querySelector('#withdrawal-held').textContent=fresh?money(snapshot.wallet.held_cents):'Updating…';
    root.querySelector('#withdrawal-phone').value=snapshot.account_number;
    const history=root.querySelector('#withdrawal-history');history.replaceChildren();
    if(!snapshot.withdrawals.length)history.append(element('p','No withdrawal requests yet.','sub'));
    for(const row of snapshot.withdrawals){
      const article=element('article',null,'withdrawal-record'),head=element('div',null,'withdrawal-record-head'),badge=element('span',status[row.status]||row.status,'withdrawal-status');badge.dataset.status=row.status;
      head.append(element('strong',money(row.amount_cents)),badge);article.append(head,element('p',row.account_number+' · '+row.recipient_name),element('p',row.created_at.slice(0,19)+' UTC'),element('p',row.id,'withdrawal-ref'));
      if(row.payout_ref)article.append(element('p','MoMo reference: '+row.payout_ref));
      if(row.decline_reason)article.append(element('p','Reason: '+row.decline_reason));history.append(article);
    }
    controls();
  }
  function confirmed(row){
    lastReceipt=row;pending=null;store(null);fresh=false;
    if(!snapshot)snapshot={withdrawals:[],wallet:{},account_number:form.elements.account_number.value};
    snapshot.withdrawals=[row,...snapshot.withdrawals.filter(r=>r.id!==row.id)];
    tell(receiptMessage(row));render();
  }
  async function refresh(){
    const id=++refreshId;
    try{
      const data=await api();if(id!==refreshId)return false;
      snapshot=data.snapshot;fresh=true;
      const receipt=pending&&snapshot.withdrawals.find(r=>r.request_key===pending.request_key);
      if(receipt){lastReceipt=receipt;pending=null;store(null);tell(receiptMessage(receipt));}
      else if(lastReceipt)lastReceipt=snapshot.withdrawals.find(r=>r.id===lastReceipt.id)||lastReceipt;
      render();return true;
    }catch(error){if(id!==refreshId)return false;fresh=false;render();throw error;}
  }
  async function submit(payload){
    if(busy)return;busy=true;pending=payload;lastReceipt=null;++refreshId;store(payload);controls();
    let receipt;
    try{
      receipt=(await api(payload)).withdrawal;confirmed(receipt);
      form.reset();window.dispatchEvent(new Event('nister:wallet-updated'));
    }catch(error){
      if((error.status&&error.status<500&&error.status!==429)||['withdrawals_paused','settings_unavailable'].includes(error.errorCode)){store(null);pending=null;}
      tell(error.message||'The connection was interrupted. Retry this request to check it safely.',true);
    }
    try{await refresh();}catch(error){
      if(receipt)readFailure(error);
      else if(!pending)tell(error.message,true);
    }finally{busy=false;controls();}
  }
  form.addEventListener('submit',e=>{
    e.preventDefault();if(pending){submit(pending);return;}
    if(busy||!fresh||button.disabled)return;
    const payload=Object.fromEntries(new FormData(form));payload.request_key=crypto.randomUUID();submit(payload);
  });
  function reload(){
    if(busy)return;
    refresh().then(applied=>{if(applied&&message.dataset.error==='true')tell(lastReceipt?receiptMessage(lastReceipt):'Requests refreshed.');}).catch(readFailure);
  }
  root.querySelector('#withdrawal-refresh').addEventListener('click',reload);
  root.addEventListener('toggle',()=>{if(root.open)reload();});
  window.addEventListener('nister:wallet-refreshed',()=>{if(root.open)reload();});
  window.addEventListener('focus',()=>{if(root.open)reload();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&root.open)reload();});
  async function init(){
    pending=restore();controls();
    try{const applied=await refresh();if(applied&&pending)await submit(pending);}
    catch(error){tell(error.message||'Withdrawals could not be loaded.',true);controls();}
  }
  init();
})();
