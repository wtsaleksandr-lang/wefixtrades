import r from './results.json' with { type: 'json' };
for(const t of Object.keys(r)){
  const x=r[t];
  console.log('\n==== '+t+' | bg='+x.panelBgHex+' ====');
  for(const n of (x.panelNodes||[])){
    const flag = n.effOpacity<1 ? '  <<TRANSLUCENT (cssOp '+n.cssOpacity+')' : '';
    console.log('  ['+(n.pass?'ok':'FAIL')+'] r='+n.ratio+' thr='+n.threshold+' effOp='+n.effOpacity+' '+n.fontSize+'px w'+n.fontWeight+' '+n.role+' "'+n.text+'"'+flag);
  }
}
