'use strict';
(() => {
  const root=document.querySelector('#withdrawal-admin');if(!root)return;
  const $=s=>root.querySelector(s),money=c=>'GHS '+(c/100).toFixed(2),dialog=$('#withdrawal-decision'),message=$('#withdrawal-admin-message');
  const statuses={pending:'Awaiting approval',approved:'Approved · awaiting payment',paid:'Paid',declined:'Declined'};
  let page=0,queue,decision,busy=false;
  function tell(text,error=false){message.textContent=text;message.hidden=!text;message.dataset.error=String(error);}
  async function api(payload){
    const query=new URLSearchParams({status:$('#withdrawal-status').value,search:$('#withdrawal-search').value.trim(),page:String(page)});
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch('/admin/withdrawal-api.php'+(payload?'':'?'+query),{credentials:'same-origin',cache:'no-store',signal:controller.signal,...(payload?{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':root.dataset.csrf},body:JSON.stringify(payload)}:{})});
      const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.message||'Withdrawal operation failed.');return data;
    }finally{clearTimeout(timer);}
  }
  function element(tag,text){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;}
  function begin(row,action){
    decision={id:row.id,action};$('#withdrawal-decision-form').reset();$('#withdrawal-decision-error').hidden=true;
    $('#withdrawal-decision-title').textContent=action==='approve'?'Approve withdrawal':action==='decline'?'Decline & refund':'Mark MoMo payment complete';
    $('#withdrawal-decision-details').textContent=[row.id,money(row.amount_cents),row.recipient_name,row.account_number+' · '+row.network].join('\n');
    $('#withdrawal-decision-note').textContent=action==='approve'?'After approval, send MoMo manually to this registered number. Approval does not send money.':action==='decline'?'The held amount will return to the customer’s wallet.':'Confirm only after the MoMo transfer has succeeded. The wallet was already debited when requested.';
    $('#withdrawal-reference-field').hidden=action!=='paid';$('#withdrawal-payout-ref').required=action==='paid';
    $('#withdrawal-reason-field').hidden=action!=='decline';$('#withdrawal-decline-reason').required=action==='decline';dialog.showModal();
  }
  async function refresh(){
    queue=(await api()).queue;
    if(document.activeElement!==$('#withdrawal-admin-minimum'))$('#withdrawal-admin-minimum').value=(queue.minimum_cents/100).toFixed(2);
    $('#withdrawal-admin-held').textContent='Held for pending and approved payouts: '+money(queue.held_cents);
    $('#withdrawal-queue-info').textContent=queue.total+' matching request'+(queue.total===1?'':'s')+'.';
    const table=element('table'),head=element('thead'),hr=element('tr');for(const title of ['Requested (UTC)','Recipient','Amount','Status','Action'])hr.append(element('th',title));head.append(hr);table.append(head);
    const body=element('tbody');
    for(const row of queue.rows){
      const tr=element('tr'),when=element('td',row.created_at.slice(0,19)),recipient=element('td',row.recipient_name),amount=element('td',money(row.amount_cents)),state=element('td',statuses[row.status]||row.status),actions=element('td');
      when.append(element('small',row.id));recipient.append(element('small',row.account_number+' · '+row.network));
      if(row.approved_by)state.append(element('small','Approved by '+row.approved_by));
      if(row.payout_ref)state.append(element('small','MoMo '+row.payout_ref+' · '+row.paid_at+' UTC'));
      if(row.decline_reason)state.append(element('small',row.decline_reason));
      const buttons=element('div');buttons.className='withdrawal-row-actions';
      for(const [action,label]of row.status==='pending'?[['approve','Approve'],['decline','Decline']]:row.status==='approved'?[['paid','Mark paid']]:[]){const button=element('button',label);button.type='button';button.className='btn';button.addEventListener('click',()=>begin(row,action));buttons.append(button);}
      actions.append(buttons);tr.append(when,recipient,amount,state,actions);body.append(tr);
    }
    if(!queue.rows.length){const tr=element('tr'),td=element('td','No matching withdrawal requests.');td.colSpan=5;tr.append(td);body.append(tr);}
    table.append(body);$('#withdrawal-queue').replaceChildren(table);$('#withdrawal-page').textContent='Page '+(page+1);$('#withdrawal-prev').disabled=page===0;$('#withdrawal-next').disabled=(page+1)*50>=queue.total;
  }
  const reload=()=>refresh().catch(e=>tell(e.message,true));
  $('#withdrawal-filters').addEventListener('submit',e=>{e.preventDefault();page=0;reload();});$('#withdrawal-admin-refresh').addEventListener('click',reload);
  $('#withdrawal-prev').addEventListener('click',()=>{page--;reload();});$('#withdrawal-next').addEventListener('click',()=>{page++;reload();});
  $('#withdrawal-config').addEventListener('submit',async e=>{
    e.preventDefault();if(busy)return;busy=true;const button=e.currentTarget.querySelector('button');button.disabled=true;
    try{await api({action:'configure',minimum:$('#withdrawal-admin-minimum').value});tell('Minimum withdrawal saved. Existing requests keep their accepted amount.');await refresh();}catch(error){tell(error.message,true);}finally{busy=false;button.disabled=false;}
  });
  $('#withdrawal-cancel').addEventListener('click',()=>dialog.close());dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  $('#withdrawal-decision-form').addEventListener('submit',async e=>{
    e.preventDefault();if(busy)return;busy=true;$('#withdrawal-apply').disabled=true;$('#withdrawal-cancel').disabled=true;
    try{await api({...decision,payout_ref:$('#withdrawal-payout-ref').value,reason:$('#withdrawal-decline-reason').value});dialog.close();tell('Withdrawal updated.');await refresh();}
    catch(error){$('#withdrawal-decision-error').textContent=error.message;$('#withdrawal-decision-error').hidden=false;}
    finally{busy=false;$('#withdrawal-apply').disabled=false;$('#withdrawal-cancel').disabled=false;}
  });
  reload();
})();
