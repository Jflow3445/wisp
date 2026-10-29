'use strict';
(() => {
  const root=document.querySelector('#wallet-withdrawals');if(!root)return;
  const form=root.querySelector('#withdrawal-form'),button=root.querySelector('#withdrawal-submit'),message=root.querySelector('#withdrawal-message');
  const money=c=>'GHS '+(c/100).toFixed(2),key='nister.withdrawal.'+root.dataset.account;
  let busy=false,snapshot,pending;
  const status={pending:'Awaiting approval',approved:'Approved · awaiting MoMo',paid:'Paid',declined:'Declined · refunded'};
  function tell(text,error=false){message.hidden=!text;message.textContent=text;message.dataset.error=String(error);}
  function controls(){
    const active=snapshot?.withdrawals.some(r=>r.status==='pending'||r.status==='approved');
    for(const field of form.querySelectorAll('input,select'))field.disabled=busy||Boolean(pending)||Boolean(active);
    button.disabled=busy||!snapshot||Boolean(active)&&!pending||snapshot?.enabled===false&&!pending;
    button.textContent=pending?'Retry this request':active?'Withdrawal awaiting completion':snapshot?.enabled===false?'Withdrawals temporarily unavailable':'Request withdrawal';
  }
  async function api(payload){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch('/withdrawal-api.php',{credentials:'same-origin',cache:'no-store',signal:controller.signal,...(payload?{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':root.dataset.csrf},body:JSON.stringify(payload)}:{})});
      const data=await response.json();if(!response.ok||!data.ok){const e=new Error(data.message||'Unable to load withdrawals.');e.status=response.status;throw e;}return data;
    }finally{clearTimeout(timer);}
  }
  function element(tag,text,className){const e=document.createElement(tag);if(text)e.textContent=text;if(className)e.className=className;return e;}
  function render(){
    root.querySelector('#withdrawal-minimum').textContent=money(snapshot.minimum_cents);
    root.querySelector('#withdrawal-available').textContent=money(snapshot.wallet.available_cents);
    root.querySelector('#withdrawal-held').textContent=money(snapshot.wallet.held_cents);
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
  async function refresh(){snapshot=(await api()).snapshot;render();}
  async function submit(payload){
    if(busy)return;busy=true;pending=payload;controls();
    try{
      sessionStorage.setItem(key,JSON.stringify(payload));
      const data=await api(payload);sessionStorage.removeItem(key);pending=null;
      tell('Request '+data.withdrawal.id+': '+(status[data.withdrawal.status]||'Recorded')+'.');
      form.reset();window.dispatchEvent(new Event('nister:wallet-updated'));await refresh();
    }catch(e){
      if(e.status&&e.status<500&&e.status!==429){sessionStorage.removeItem(key);pending=null;}
      tell(e.message||'The connection was interrupted. Retry this request to check it safely.',true);
      try{await refresh();}catch(ignored){/* Keep the exact retry payload. */}
    }finally{busy=false;controls();}
  }
  form.addEventListener('submit',e=>{
    e.preventDefault();if(pending){submit(pending);return;}
    const payload=Object.fromEntries(new FormData(form));payload.request_key=crypto.randomUUID();submit(payload);
  });
  root.querySelector('#withdrawal-refresh').addEventListener('click',()=>refresh().catch(e=>tell(e.message,true)));
  async function init(){
    try{pending=JSON.parse(sessionStorage.getItem(key)||'null');await refresh();if(pending)await submit(pending);}
    catch(e){tell(e.message||'Withdrawals could not be loaded.',true);controls();}
  }
  init();
})();
