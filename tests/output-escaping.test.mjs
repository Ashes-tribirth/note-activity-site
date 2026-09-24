import assert from 'node:assert/strict';
import {run,fixture} from './harness.mjs';
const data=structuredClone(fixture);data.articles[0].title='<img src=x onerror=alert(1)> & "test"';data.articles[0].url='javascript:alert(1)';data.campaignData={campaigns:[{status:'open',title:'<script>bad</script>',launchUrl:'javascript:alert(1)'}]};
const ui=await run(data);assert(ui.context.notePulseData);
assert(ui.elements.get('#ledger').innerHTML.includes('&lt;img'));assert(!ui.elements.get('#ledger').innerHTML.includes('<img'));
ui.eval('drawDetail("test")');assert(!ui.elements.get('#articleDetail').innerHTML.includes('javascript:'));
assert(!ui.elements.get('#openCampaignList').innerHTML.includes('<script>'));assert(!ui.elements.get('#openCampaignList').innerHTML.includes('javascript:'));
console.log('Output and URL escaping passed.');
