const $ = id => document.getElementById(id);
const message = text => { $('message').textContent = text; };
let latest = null, socket, stream, context, processor, analyser, timer, animation;
let busy = false, monitoring = false, stopping = false;
let currentSession = null, generation = 0, connectTimeout;
const clock = seconds => `${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
const audioDuration = seconds => seconds < 60 ? `${seconds.toFixed(2)}s` : clock(seconds);
function rowMessage(target, text) { const row=document.createElement('tr'); const td=document.createElement('td'); td.colSpan=4; td.textContent=text; row.append(td); $(target).replaceChildren(row); }
function renderSummary(summary, state = 'Recorded') {
  if (!summary) return;
  $('report-state').textContent = state;
  $('total-events').textContent = summary.total_respiratory_events;
  $('event-rate').textContent = summary.events_per_hour === null ? '—' : summary.events_per_hour.toFixed(1);
  $('most-frequent').textContent = summary.most_frequent_sounds?.join(' / ') || summary.most_frequent_sound || 'None detected';
  $('summary-duration').textContent = audioDuration(summary.monitoring_duration_seconds);
  $('rate-note').textContent = summary.monitoring_duration_seconds < 60 ? 'Short recording: the hourly rate is an extrapolation and can change sharply. Counts describe model spans, not clinical episodes.' : 'Rate uses analyzed audio duration. Counts describe model spans, not clinical episodes.';
  $('distribution').replaceChildren();
  for (const item of summary.distribution) {
    const row=document.createElement('div'); row.className='distribution-row';
    const name=document.createElement('span'); name.textContent=item.category;
    const track=document.createElement('div'); track.className='bar-track';
    const bar=document.createElement('div'); bar.className='bar-fill'; bar.style.width=`${item.fraction*100}%`; track.append(bar);
    const count=document.createElement('b'); count.textContent=item.count;
    row.append(name,track,count); $('distribution').append(row);
  }
  $('activity-chart').replaceChildren(); $('activity-chart').classList.toggle('empty',!summary.total_respiratory_events);
  if (!summary.total_respiratory_events) $('activity-chart').textContent='No respiratory activity above the selection rules.';
  else {
    const max=Math.max(...summary.activity_bins.map(bin=>bin.count),1);
    for (const bin of summary.activity_bins) {
      const bar=document.createElement('div'); bar.className='activity-bin'; bar.style.height=`${bin.count/max*100}%`;
      bar.tabIndex=0; bar.title=`${clock(bin.start_seconds)}–${clock(bin.end_seconds)}: ${bin.count} spans`;
      bar.setAttribute('role','img'); bar.setAttribute('aria-label',bar.title); $('activity-chart').append(bar);
    }
  }
  const peak=summary.highest_activity_period;
  $('highest-period').textContent=peak ? `Highest activity: ${clock(peak.start_seconds)}–${clock(peak.end_seconds)} · ${peak.count} spans` : 'Highest activity: none detected';
  $('clusters').textContent=summary.clusters.length ? `Clusters: ${summary.clusters.map(c=>`${clock(c.start_seconds)}–${clock(c.end_seconds)} (${c.event_count} spans)`).join('; ')}` : 'Clusters: none detected';
  $('timeline').replaceChildren();
  for (const event of summary.timeline.slice(0,500)) {
    const row=document.createElement('tr'); [event.respiratory_category,`${event.start_seconds.toFixed(2)}s`,`${event.end_seconds.toFixed(2)}s`,event.max_score.toFixed(3)].forEach(value=>cell(row,value)); $('timeline').append(row);
  }
  if (!summary.timeline.length) rowMessage('timeline','No respiratory spans selected. This does not rule out a health problem.');
  $('timeline-note').textContent=`${summary.timeline.length > 500 ? 'Showing first 500 spans; export includes all. ' : ''}Approximate model timing across the session. Touching spans of the same sound count once.`;
  $('legacy-note').textContent=summary.methodology.contains_legacy_reports ? 'This session includes older reports with the original selection rules. It has not been reclassified.' : '';
}
async function api(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw Error(data.detail || 'Request failed');
  return data;
}
function cell(row, value) { const td = document.createElement('td'); td.textContent = value; row.append(td); }
function render(report, offset = 0) {
  latest = report; $('export').disabled = false;
  $('result-meta').textContent = `${report.audio.duration_seconds.toFixed(2)} seconds analyzed · YAMNet · Uncalibrated scores`;
  $('scores').replaceChildren();
  for (const item of report.classes.filter(c => c.respiratory_category)) {
    const selected=(report.respiratory_events || []).some(e=>e.class_index===item.class_index);
    const box = document.createElement('div'); box.className = `score${selected ? ' detected' : ''}`; box.textContent = item.respiratory_category;
    const score = document.createElement('strong'); score.textContent = item.max_score.toFixed(3);
    const floor=report.detection_policy?.thresholds[item.model_label] ?? item.threshold;
    const note=document.createElement('span'); note.className='small'; note.textContent=`Entry ≥ ${floor.toFixed(2)}`;
    const track=document.createElement('div'); track.className='bar-track'; const bar=document.createElement('div'); bar.className='bar-fill'; bar.style.width=`${item.max_score*100}%`; track.append(bar);
    box.append(score,note,track); $('scores').append(box);
  }
  $('events').replaceChildren();
  for (const event of report.events.slice(0, 200)) {
    const row = document.createElement('tr');
    [event.respiratory_category || event.model_label, (offset + event.start_seconds).toFixed(2) + 's',
      (offset + event.end_seconds).toFixed(2) + 's', event.max_score.toFixed(3)].forEach(value => cell(row, value));
    $('events').append(row);
  }
  if (!report.events.length) { const row = document.createElement('tr'); cell(row, 'No scores above the selected threshold.'); $('events').append(row); }
  $('signal-quality').textContent=report.signal ? `${report.signal.quiet ? 'Quiet input' : 'Audio present'} · ${report.signal.dbfs === null ? 'digital silence' : report.signal.dbfs.toFixed(1)+' dBFS RMS'} · ${(report.signal.quiet_window_fraction*100).toFixed(0)}% quiet windows. Original scores remain visible even when an observation is excluded.` : 'Legacy report: input-level measurements unavailable.';
  renderSummary(report.summary);
}
async function history() {
  try {
    const sessions = await api('/api/sessions'); $('sessions').replaceChildren();
    if (!sessions.length) $('sessions').textContent = 'Your analyzed sessions will appear here.';
    for (const session of sessions) {
      const row = document.createElement('div'); row.className = 'session';
      const text = document.createElement('span'); text.textContent = `${new Date(session.created_at).toLocaleString()} · ${session.source} · ${session.duration.toFixed(1)}s · ${session.status}`;
      const view = document.createElement('button'); view.className = 'secondary'; view.textContent = 'View / export';
      view.disabled = monitoring;
      view.onclick = async () => { if(monitoring) { message('Stop monitoring before opening another session.'); return; } try { const data = await api(`/api/sessions/${session.id}`); if (data.reports.length) render(data.reports.at(-1).report, data.reports.at(-1).offset_seconds); renderSummary(data.summary,'Session report'); currentSession=session.id; latest = data; $('export').disabled = false; message('Full session summary and timeline. Model evidence shows the most recent segment.'); document.querySelector('.report').scrollIntoView({behavior:'smooth',block:'start'}); } catch (e) { message(e.message); } };
      const remove = document.createElement('button'); remove.className = 'secondary'; remove.textContent = 'Delete'; remove.disabled = session.status === 'active';
      remove.onclick = async () => { if (!confirm('Permanently delete this session report?')) return; try { await api(`/api/sessions/${session.id}`, {method:'DELETE'}); if(currentSession===session.id) { clearResults(); currentSession=null; } await history(); message('Session and associated database records deleted. Exported files are separate.'); } catch (e) { message(e.message); } };
      row.append(text, view, remove); $('sessions').append(row);
    }
  } catch (e) { message(e.message); }
}
$('threshold').oninput = () => { $('threshold-value').textContent = Number($('threshold').value).toFixed(2); };
$('upload').onsubmit = async event => {
  event.preventDefault(); const file = $('file').files[0]; if (!file) return;
  if (file.size > 25 * 1024 * 1024) { message('Maximum upload size is 25 MiB.'); return; }
  $('analyze').disabled = true; $('start').disabled=true; $('analyze').setAttribute('aria-busy','true'); $('analyze').textContent='Analyzing locally…'; message('Analyzing recording…');
  try { const data = await api(`/api/analyze?threshold=${$('threshold').value}`, {method:'POST', body:file}); render(data.report); currentSession=data.session_id; message('Analysis complete.'); await history(); }
  catch (e) { message(e.message); } finally { $('analyze').disabled = monitoring; $('start').disabled=monitoring; $('analyze').removeAttribute('aria-busy'); $('analyze').textContent='Analyze recording'; }
};
function clearResults() {
  latest=null; $('export').disabled=true; $('scores').replaceChildren();
  for(const id of ['total-events','event-rate','most-frequent','summary-duration']) $(id).textContent='—';
  $('distribution').replaceChildren(); $('activity-chart').replaceChildren();
  $('report-state').textContent='Awaiting audio'; $('highest-period').textContent='Highest activity: no analyzed audio'; $('clusters').textContent='Clusters: no analyzed audio';
  $('result-meta').textContent='Start monitoring or analyze a recording to see results.'; $('signal-quality').textContent='';
  rowMessage('timeline','No session selected.'); rowMessage('events','No recording analyzed.');
  $('legacy-note').textContent='';
}
async function release() {
  monitoring = false; clearInterval(timer); cancelAnimationFrame(animation);
  clearTimeout(connectTimeout); document.body.classList.remove('listening');
  if (processor) { processor.port.onmessage = null; processor.disconnect(); processor = null; }
  stream?.getTracks().forEach(track => track.stop()); stream = null;
  if (context && context.state !== 'closed') await context.close(); context = null;
  $('start').disabled = socket && socket.readyState < WebSocket.CLOSED; $('stop').disabled = true; $('live-status').textContent = 'Idle';
  $('mic-status').textContent='Microphone off'; $('input-level').textContent='No input'; $('input-meter').style.setProperty('--level','0%'); $('input-meter').setAttribute('aria-valuenow','-80');
  const painter=$('meter').getContext('2d'); painter.clearRect(0,0,$('meter').width,$('meter').height);
  $('analyze').disabled=false; $('threshold').disabled=false;
}
function draw() {
  if (!analyser || !monitoring) return;
  const canvas = $('meter'), painter = canvas.getContext('2d'), values = new Float32Array(analyser.fftSize);
  canvas.width = canvas.clientWidth; analyser.getFloatTimeDomainData(values);
  painter.clearRect(0, 0, canvas.width, 100); painter.strokeStyle = '#bedda3'; painter.lineWidth = 2; painter.beginPath();
  let energy=0; values.forEach((v, i) => { energy+=v*v; const x = i * canvas.width / values.length, y = 50+v*48; i ? painter.lineTo(x,y) : painter.moveTo(x,y); }); painter.stroke();
  const rms=Math.sqrt(energy/values.length), db=rms ? Math.max(-80,20*Math.log10(rms)) : -80;
  $('input-level').textContent=rms ? `${db.toFixed(0)} dBFS` : 'Digital silence';
  $('mic-status').textContent=rms>=.003 ? 'Microphone active · audio present' : 'Microphone active · quiet input';
  $('input-meter').style.setProperty('--level',`${(db+80)/80*100}%`); $('input-meter').setAttribute('aria-valuenow',db.toFixed(0));
  animation = requestAnimationFrame(draw);
}
$('start').onclick = async () => {
  const token=++generation;
  $('start').disabled = true; $('stop').disabled=false; stopping = false; busy = false;
  $('live-status').textContent='Requesting access'; $('mic-status').textContent='Waiting for permission';
  try {
    if (!navigator.mediaDevices || !window.AudioWorkletNode) throw Error('Microphone monitoring needs a modern browser on localhost or HTTPS.');
    const capture = await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
    if(token!==generation) { capture.getTracks().forEach(track=>track.stop()); return; }
    stream=capture; stream.getAudioTracks().forEach(track=>{track.onended=()=>{message('Microphone disconnected. Monitoring ended.'); $('stop').click();};});
    $('mic-status').textContent='Microphone connected'; $('live-status').textContent='Connecting AI';
    // Let the browser's audio converter apply anti-alias filtering before the worklet.
    context = new AudioContext({sampleRate:16000}); await context.resume(); await context.audioWorklet.addModule('/static/pcm-worklet.js');
    if(token!==generation) return;
    socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/monitor`);
    const connection=socket;
    connectTimeout=setTimeout(()=>{if(!monitoring && socket===connection) {message('AI connection timed out.'); connection.close(); release();}},15000);
    socket.onopen = () => socket.send(JSON.stringify({threshold:Number($('threshold').value)}));
    socket.onmessage = async event => {
      const data = JSON.parse(event.data);
      if(socket!==connection) return;
      if (data.type === 'ready') {
        if(stopping) {connection.send('stop'); return;}
        clearTimeout(connectTimeout); clearResults(); currentSession=data.session_id;
        $('live-count').textContent='0'; $('analyzed-time').textContent='0:00'; $('elapsed').textContent='0:00'; $('recent-sound').textContent='None yet';
        $('analyze').disabled=true; $('threshold').disabled=true; document.body.classList.add('listening');
        monitoring = true; $('stop').disabled = false; $('live-status').textContent = 'Listening'; message('Microphone active. Analyzing 1.95-second segments.');
        context.onstatechange=()=>{if(monitoring && context?.state==='suspended') { $('stop').click(); message('Audio capture suspended by the browser. Monitoring ended.'); }};
        const source = context.createMediaStreamSource(stream); analyser = context.createAnalyser(); source.connect(analyser);
        processor = new AudioWorkletNode(context,'pcm-processor'); source.connect(processor);
        const mute = context.createGain(); mute.gain.value = 0; processor.connect(mute).connect(context.destination);
        processor.port.onmessage = e => {
          if (stopping || socket.readyState !== WebSocket.OPEN) return;
          if (busy) { message('Inference is slower than capture. Monitoring stopped to avoid silently dropping audio.'); $('stop').click(); return; }
          busy = true; socket.send(e.data);
        };
        const start = Date.now(); timer = setInterval(() => { const s = Math.floor((Date.now()-start)/1000); $('elapsed').textContent = `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; },1000); draw();
      } else if (data.type === 'result') {
        busy = false; render(data.report, data.offset_seconds); renderSummary(data.summary,'Live session');
        $('live-count').textContent=data.summary.total_respiratory_events; $('analyzed-time').textContent=audioDuration(data.summary.monitoring_duration_seconds);
        const recent=data.report.respiratory_events?.at(-1);
        $('recent-sound').textContent=recent ? `${recent.respiratory_category} · ${(data.offset_seconds+recent.start_seconds).toFixed(1)}s` : 'No new respiratory span';
      }
      else if (data.type === 'error') { message(data.detail); await release(); }
    };
    socket.onerror = () => message('Microphone connection failed. Check the backend.');
    socket.onclose = async () => { if(socket!==connection) return; const wasListening=monitoring, closingGeneration=generation; await release(); if(wasListening && !stopping) message('Connection lost. Monitoring ended; saved observations remain in history.'); await history(); if(closingGeneration!==generation) return; if(currentSession) { try { const data=await api(`/api/sessions/${currentSession}`); if(closingGeneration===generation && data.reports.length) { latest=data; $('export').disabled=false; renderSummary(data.summary,'Session report'); } } catch(e) {message(e.message);} } };
  } catch (e) { if(token!==generation) return; message(e.message); socket?.close(); await release(); }
};
$('stop').onclick = async () => { ++generation; stopping = true; if (socket?.readyState === WebSocket.OPEN) socket.send('stop'); else socket?.close(); await release(); message('Monitoring stopped. Microphone released. The final incomplete capture segment is discarded.'); };
$('export').onclick = async () => { try { const report=currentSession ? await api(`/api/sessions/${currentSession}`) : latest; const url = URL.createObjectURL(new Blob([JSON.stringify(report,null,2)], {type:'application/json'})); const a = document.createElement('a'); a.href = url; a.download = 'echohealth-report.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000); } catch(e) {message(e.message);} };
$('refresh').onclick = history;
window.addEventListener('pagehide', () => { stream?.getTracks().forEach(track => track.stop()); socket?.close(); });
try { const health = await api('/api/health'); $('health').textContent = health.status === 'ready' ? '● Model ready · local' : '○ Model unavailable'; $('thresholds').textContent=Object.entries(health.respiratory_thresholds || {}).map(([label,score])=>`${label}: ${score.toFixed(2)}`).join(' · '); if (health.detail) message(health.detail); } catch (e) { $('health').textContent = 'Backend unavailable'; message(e.message); }
await history();
