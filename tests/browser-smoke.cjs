// Runs against scripts/smoke_server.py's loopback server with real YAMNet.
const {spawn} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  fs.mkdirSync('.tmp', {recursive:true});
  const profile = fs.mkdtempSync(path.resolve('.tmp/browser-'));
  const browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',
      `--user-data-dir=${profile}`, '--use-fake-device-for-media-stream', 'about:blank'],
    {windowsHide:true, stdio:'ignore'});
  let ws, id = 0;
  const pending = new Map();
  const nonlocalRequests = [], pageErrors = [];
  function command(method, params = {}) {
    return new Promise((resolve,reject) => {
      const requestId = ++id;
      const timer = setTimeout(() => { pending.delete(requestId); reject(Error(`Timed out: ${method}`)); },45000);
      pending.set(requestId, {resolve:result=>{clearTimeout(timer);resolve(result)},reject:error=>{clearTimeout(timer);reject(error)}});
      ws.send(JSON.stringify({id:requestId,method,params}));
    });
  }
  try {
    const portFile = path.join(profile,'DevToolsActivePort');
    for (let i=0; i<100 && !fs.existsSync(portFile); i++) await delay(100);
    const port = fs.readFileSync(portFile,'utf8').split('\n')[0];
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    ws = new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
    await new Promise((resolve,reject) => { ws.onopen=resolve; ws.onerror=reject; });
    ws.onmessage = event => {
      const data=JSON.parse(event.data); const entry=pending.get(data.id);
      if(entry) {pending.delete(data.id);data.error ? entry.reject(Error(data.error.message)) : entry.resolve(data.result);}
      if(data.method==='Runtime.exceptionThrown') pageErrors.push(data.params.exceptionDetails);
      if(data.method==='Fetch.requestPaused') {
        const local=new URL(data.params.request.url).hostname==='127.0.0.1';
        if(!local) nonlocalRequests.push(data.params.request.url);
        command(local?'Fetch.continueRequest':'Fetch.failRequest', local ? {requestId:data.params.requestId} : {requestId:data.params.requestId,errorReason:'InternetDisconnected'}).catch(e=>pageErrors.push(e.message));
      }
    };
    ws.onclose=()=>{ for(const entry of pending.values()) entry.reject(Error('Browser connection closed')); pending.clear(); };
    const evaluate = async expression => {
      const data = await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
      if (data.exceptionDetails) throw Error(JSON.stringify(data.exceptionDetails));
      return data.result.value;
    };
    const until = async expression => { for(let i=0;i<160;i++) { if(await evaluate(expression)) return; await delay(250); } throw Error(`UI condition failed: ${expression}; ${await evaluate("document.getElementById('message').textContent")}`); };
    await command('Page.enable');
    await command('Runtime.enable');
    await command('Fetch.enable',{patterns:[{urlPattern:'http*',requestStage:'Request'}]});
    await command('Page.addScriptToEvaluateOnNewDocument',{source:`
      window.__captureTracks=[];
      const originalCapture=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia=async (...args)=>{ const stream=await originalCapture(...args); window.__captureTracks.push(...stream.getTracks()); return stream; };
    `});
    await command('Page.navigate',{url:'http://127.0.0.1:8765'});
    await until("document.getElementById('health')?.textContent.includes('Model ready')");
    await command('Browser.setPermission',{permission:{name:'microphone'},setting:'denied',origin:'http://127.0.0.1:8765'});
    await evaluate("document.getElementById('start').click()");
    await until("!document.getElementById('start').disabled && document.getElementById('message').textContent.length > 0");
    assert.equal(await evaluate('window.__captureTracks.length'),0);
    await command('Browser.setPermission',{permission:{name:'microphone'},setting:'granted',origin:'http://127.0.0.1:8765'});
    await evaluate("document.getElementById('start').click()");
    await until("document.getElementById('scores').children.length === 7");
    assert.equal(await evaluate("document.getElementById('live-status').textContent"),'Listening');
    assert.ok(Number.isInteger(Number(await evaluate("document.getElementById('total-events').textContent"))));
    assert.ok(await evaluate("document.getElementById('mic-status').textContent.includes('Microphone active')"));
    await evaluate("document.getElementById('stop').click()");
    await until("document.querySelectorAll('.session').length > 0 && !document.querySelector('.session button:last-child').disabled");
    assert.ok(await evaluate("window.__captureTracks.every(track=>track.readyState==='ended')"),'Microphone tracks must stop');
    await evaluate("document.getElementById('start').click()");
    await until("document.getElementById('live-status').textContent === 'Listening' && document.getElementById('analyzed-time').textContent !== '0:00'");
    await evaluate("document.getElementById('stop').click()");
    await until("!document.getElementById('start').disabled && window.__captureTracks.every(track=>track.readyState==='ended')");
    assert.equal(await evaluate('window.__captureTracks.length'),2,'Restart must use a fresh capture and release both tracks');
    const root = await command('DOM.getDocument');
    const input = await command('DOM.querySelector',{nodeId:root.root.nodeId,selector:'#file'});
    await command('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[path.resolve('samples/speech_whistling2.wav')]});
    await evaluate("document.getElementById('upload').requestSubmit()");
    await until("document.getElementById('message').textContent === 'Analysis complete.'");
    assert.ok(await evaluate("document.querySelectorAll('#events tr').length > 0"));
    assert.equal(await evaluate("document.getElementById('total-events').textContent"),'0');
    assert.ok(await evaluate("document.getElementById('activity-chart').textContent.includes('No respiratory activity')"));
    await evaluate("document.querySelector('.session button').click()");
    await until("document.getElementById('report-state').textContent === 'Session report'");
    // Verify real JSON download, including the whole-session summary.
    fs.mkdirSync('reports/browser-downloads',{recursive:true});
    const downloads=fs.mkdtempSync(path.resolve('reports/browser-downloads/run-'));
    await command('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});
    await evaluate("document.getElementById('export').click()");
    for(let i=0;i<80 && !fs.existsSync(path.join(downloads,'echohealth-report.json'));i++) await delay(100);
    const exported=JSON.parse(fs.readFileSync(path.join(downloads,'echohealth-report.json'),'utf8'));
    assert.ok(exported.summary && exported.reports);
    await command('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});
    await delay(300);
    const desktop = await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
    fs.writeFileSync('reports/desktop-polished.png',Buffer.from(desktop.data,'base64'));
    await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await delay(300);
    assert.ok(await evaluate('document.documentElement.scrollWidth <= 390'));
    const mobile = await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
    fs.writeFileSync('reports/mobile-polished.png',Buffer.from(mobile.data,'base64'));
    const countBefore=await evaluate("document.querySelectorAll('.session').length");
    // Auto-accept only the deletion confirmation triggered in this test.
    await evaluate("window.confirm=()=>true; document.querySelector('.session button:last-child').click()");
    await until(`document.querySelectorAll('.session').length === ${countBefore-1}`);
    assert.equal(await evaluate("document.getElementById('export').disabled"),true);
    assert.equal(await evaluate("document.getElementById('total-events').textContent"),'—');
    assert.deepEqual(nonlocalRequests,[],'The app must not request external resources');
    assert.deepEqual(pageErrors,[],'No browser runtime errors');
    console.log('PASS: Chrome permissions, real AI capture, track release, summaries/history, JSON export/deletion, desktop/mobile, nonlocal requests blocked');
    await command('Browser.close');
  } finally {
    if(ws?.readyState===WebSocket.OPEN) await command('Browser.close').catch(()=>{});
    ws?.close();
    browser.kill();
  }
}
main().catch(error=>{console.error(error); process.exitCode=1});
