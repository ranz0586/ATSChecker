import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, Check, CheckCheck, ChevronRight, CircleHelp, FileCheck2, FileText, Fingerprint, Layers3, LoaderCircle, Plus, RotateCcw, ScanLine, ShieldCheck, Sparkles, Upload, X } from 'lucide-react';
import { analyze, MAX_TEXT } from '../shared/analysis.js';
import './styles.css';

const sampleJob = `Frontend Engineer
We are looking for a frontend engineer to build accessible web applications with React, TypeScript, HTML and CSS. You will work with designers in Figma, integrate REST APIs and improve application performance.

Requirements
- Experience building production React applications
- Strong JavaScript and TypeScript skills
- Familiarity with Git, testing and CI/CD
- Experience with accessibility and responsive design
- Clear communication and collaboration

Preferred: Next.js, Playwright and AWS.`;
const sampleResume = `ALEX MORGAN
alex.morgan@example.com | +1 415 555 0138 | San Francisco, CA

Professional Summary
Frontend engineer with 3 years of experience building web applications with React and JavaScript. Collaborates with product designers and backend engineers to deliver useful, responsive interfaces.

Work Experience
Frontend Engineer | Northstar Studio | June 2023 – Present
• Built React interfaces for a customer dashboard used by 12,000 users.
• Reduced page load time by 35% by optimizing images and splitting JavaScript bundles.
• Integrated REST APIs and implemented accessible HTML and CSS components.
• Collaborated with designers in Figma to deliver responsive layouts.
• Used Git for code review and Jest for component testing.

Web Developer | Oak Digital | July 2021 – May 2023
• Developed landing pages and reusable UI components for 8 client projects.
• Resolved browser compatibility issues and improved mobile navigation.
• Worked with product teams to clarify requirements and communicate progress.

Technical Skills
React, JavaScript, HTML, CSS, REST, Git, Jest, Figma, responsive design, accessibility

Education
Bachelor of Science in Computer Science | Pacific University | 2021`;

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}
const jsonOptions = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Score({ value, small = false }) {
  return <div className={`score-ring ${small ? 'small' : ''}`} style={{ '--score': `${value}%` }}><div><strong>{value}</strong><span>/ 100</span></div></div>;
}
function Metric({ label, value, note }) {
  return <div className="metric"><div><span>{label}</span><strong>{value}<small>%</small></strong></div><div className="meter"><i style={{ width: `${value}%` }} /></div><p>{note}</p></div>;
}
function EmptyReport() {
  return <div className="empty-report">
    <div className="document-art" aria-hidden="true"><div className="art-page"><div className="art-avatar" /><i /><i /><hr /><i /><i /><i /><hr /><i /><i /></div><span className="art-check"><CheckCheck size={24} /></span><span className="art-spark"><Sparkles size={19} /></span></div>
    <span className="eyebrow">A LITTLE CLARITY. A BETTER APPLICATION.</span>
    <h2>Make your experience<br />speak their language.</h2>
    <p>Add the job description and your resume.<br />We’ll help you see what fits, what’s missing,<br />and where you can make a stronger impression.</p>
    <div className="empty-features"><span><ScanLine size={16} /> ATS compatibility</span><span><Fingerprint size={16} /> Job-specific insights</span><span><Sparkles size={16} /> Thoughtful rewrites</span></div>
  </div>;
}

function App() {
  const [job, setJob] = useState('');
  const [requirements, setRequirements] = useState('');
  const [resume, setResume] = useState('');
  const [filename, setFilename] = useState('');
  const [pages, setPages] = useState(null);
  const [result, setResult] = useState(null);
  const [revised, setRevised] = useState('');
  const [context, setContext] = useState(null);
  const [tab, setTab] = useState('overview');
  const [useAI, setUseAI] = useState(false);
  const [aiConfig, setAIConfig] = useState({ aiAvailable: false, aiProvider: null, aiProviderLabel: 'the configured AI provider', aiConfigError: null });
  const { aiAvailable } = aiConfig;
  const [configError, setConfigError] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dragging, setDragging] = useState(false);
  const [help, setHelp] = useState(false);
  const [showResume, setShowResume] = useState(false);
  const fileRef = useRef(null);
  const reportRef = useRef(null);
  const helpRef = useRef(null);

  useEffect(() => { request('/api/config').then(setAIConfig).catch(() => setConfigError(true)); }, []);
  useEffect(() => { if (help) helpRef.current?.showModal(); else helpRef.current?.close(); }, [help]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 6000); return () => clearTimeout(timer); }, [notice]);
  function invalidate() { setResult(null); setContext(null); setRevised(''); setError(''); setNotice(''); }
  function loadExample() { invalidate(); setJob(sampleJob); setRequirements('React\nTypeScript\nAccessibility'); setResume(sampleResume); setFilename('Example resume'); setPages(null); setShowResume(false); }
  function reset() { invalidate(); setJob(''); setRequirements(''); setResume(''); setFilename(''); setPages(null); setShowResume(false); setUseAI(false); setTab('overview'); if (fileRef.current) fileRef.current.value = ''; }
  async function upload(file) {
    if (!file || busy) return;
    setError(''); setNotice('');
    if (!/\.(pdf|docx|txt)$/i.test(file.name)) return setError('Choose a PDF, DOCX, or TXT resume.');
    if (file.size > 5 * 1024 * 1024) return setError('Choose a file smaller than 5 MB.');
    setBusy('upload');
    try {
      const data = await request('/api/extract', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) }, body: file });
      invalidate(); setResume(data.text); setFilename(file.name); setPages(data.pages); setShowResume(true);
    } catch (err) { setError(err.message); }
    finally { setBusy(''); if (fileRef.current) fileRef.current.value = ''; }
  }
  async function runAnalysis(event) {
    event.preventDefault(); setError(''); setNotice(''); setBusy('analyze');
    try {
      const data = await request('/api/analyze', jsonOptions({ resume, jobDescription: job, requirements, useAI, aiConsent: useAI, aiProvider: aiConfig.aiProvider }));
      setResult(data); setRevised(data.revisedResume); setContext({ job, requirements }); setTab('overview');
      setTimeout(() => reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (err) { setError(err.message); }
    finally { setBusy(''); }
  }
  function rescore() {
    try {
      const updated = analyze(revised, context.job, context.requirements);
      setResult(previous => ({ ...previous, revised: updated, revisedResume: revised }));
      setNotice('Updated text was checked against the same job description.'); setError('');
    } catch (err) { setError(err.message); }
  }
  async function exportDocx() {
    setBusy('export'); setError('');
    try {
      const response = await fetch('/api/export', jsonOptions({ text: revised }));
      if (!response.ok) throw new Error((await response.json()).error || 'Export failed.');
      download(await response.blob(), 'aligned-resume.docx'); setNotice('Your revised resume was downloaded. Review it before applying.');
    } catch (err) { setError(err.message); }
    finally { setBusy(''); }
  }
  const ready = job.trim().length >= 80 && resume.trim().length >= 80;
  const report = result?.original;
  const edited = result && revised !== result.revisedResume;

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="Align home"><span className="brand-mark"><Layers3 size={23} /></span>align<span className="brand-dot">.</span></a>
      <div className="workspace-label">YOUR WORKSPACE</div>
      <nav aria-label="Workspace"><button className="nav-item active" onClick={() => document.getElementById('job-description').focus()}><FileCheck2 size={19} /> Resume checker <span className="nav-dot" /></button></nav>
      <div className="sidebar-note"><div className="note-icon"><Sparkles size={20} /></div><h3>Your next chapter<br />starts with a better fit.</h3><p>Bring your experience.<br />We’ll help it shine.</p><button onClick={() => setHelp(true)}>How it works <ArrowUpRight size={15} /></button></div>
      <div className="sidebar-bottom"><span className="privacy-icon"><ShieldCheck size={18} /></span><div><strong>Private by design</strong><span>No saved resumes</span></div></div>
      <div className="sidebar-foot">Made for your next move.</div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div><span>Workspace</span><ChevronRight size={14} /><strong>Resume checker</strong></div><button className="help-button" onClick={() => setHelp(true)}><CircleHelp size={17} /> How it works</button></header>
      <main>
        <div className="page-heading"><div><span className="eyebrow"><span className="tiny-line" /> RESUME INTELLIGENCE</span><h1>A better fit. A stronger resume.</h1><p>Understand the match. Refine your story. Apply with confidence.</p></div><button className="button secondary sample-button" onClick={loadExample} disabled={!!busy}><Sparkles size={16} /> Try an example <ArrowUpRight size={15} /></button></div>
        <div className="step-strip"><span className="current"><b>1</b> Add your details</span><i /><span className={result ? 'current' : ''}><b>2</b> Understand your match</span><i /><span className={tab === 'resume' && result ? 'current' : ''}><b>3</b> Refine & download</span><div className="step-time">A few minutes. A clearer next step.</div></div>
        <div className="workbench">
          <form className="input-panel" onSubmit={runAnalysis}>
            <section className="input-section"><div className="section-title"><span className="section-icon"><FileText size={19} /></span><div><h2>The opportunity</h2><p>What does your next role look like?</p></div><span className="section-number">01</span></div>
              <label htmlFor="job-description">Job description <span className="required">*</span></label>
              <textarea id="job-description" className="job-input" placeholder={'Paste the job description here…\n\nInclude responsibilities, qualifications, and the skills the company is looking for.'} value={job} onChange={e => { invalidate(); setJob(e.target.value); }} maxLength={MAX_TEXT} disabled={!!busy} required minLength={80} />
              <div className="field-foot"><span>More detail makes a better comparison.</span><span>{job.length.toLocaleString()} / 30,000</span></div>
              <label htmlFor="requirements" className="requirements-label">Must-have requirements <span className="optional">Optional</span></label>
              <textarea id="requirements" className="requirements-input" placeholder="e.g. React, project management, SQL — one per line" value={requirements} maxLength={5000} onChange={e => { invalidate(); setRequirements(e.target.value); }} disabled={!!busy} />
              <p className="field-hint">These receive extra weight in the keyword check.</p>
            </section>
            <section className="input-section resume-section"><div className="section-title"><span className="section-icon"><Upload size={19} /></span><div><h2>Your experience</h2><p>Let’s see what you bring to the table.</p></div><span className="section-number">02</span></div>
              <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" aria-label="Upload resume" className="file-input" onChange={e => upload(e.target.files[0])} disabled={!!busy} />
              <button type="button" disabled={!!busy} className={`dropzone ${dragging ? 'dragging' : ''} ${filename ? 'has-file' : ''}`} onClick={() => fileRef.current.click()} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files[0]); }}>
                <span className="upload-icon">{busy === 'upload' ? <LoaderCircle className="spin" size={23} /> : filename ? <FileCheck2 size={23} /> : <Upload size={23} />}</span>
                <strong>{busy === 'upload' ? 'Reading your resume…' : filename || 'Drop your resume here'}</strong><span>{filename ? `${pages ? `${pages} page${pages > 1 ? 's' : ''} · ` : ''}${resume.trim().split(/\s+/).length} words · Click to replace` : <>or <em>browse files</em> to upload</>}</span><small>PDF, DOCX, or TXT · Up to 5 MB</small>
              </button>
              <div className="paste-divider"><i /><button type="button" onClick={() => setShowResume(!showResume)} disabled={!!busy}>{showResume ? 'Hide resume text' : resume ? 'Review extracted text' : 'or paste your resume'} <Plus size={13} /></button><i /></div>
              {(showResume || (resume && !filename)) && <><label htmlFor="resume-text">Resume text <span className="required">*</span></label><textarea id="resume-text" className="resume-input" placeholder="Paste your full resume, including contact details, experience, skills, and education…" value={resume} onChange={e => { invalidate(); setResume(e.target.value); setFilename(''); setPages(null); }} maxLength={MAX_TEXT} disabled={!!busy} /><div className="field-foot"><span>Review the text before analyzing.</span><span>{resume.length.toLocaleString()} / 30,000</span></div></>}
            </section>
            <div className="analysis-action"><div className="ai-toggle"><span className="ai-symbol"><Sparkles size={19} /></span><div><label htmlFor="use-ai">Include AI review <span className="ai-badge">DEEPER INSIGHTS</span></label><p>{aiAvailable ? 'Review with ' + aiConfig.aiProviderLabel : configError ? 'Server unavailable. Try restarting the app.' : aiConfig.aiConfigError || 'Enable with a server API key.'}</p></div><input id="use-ai" type="checkbox" role="switch" checked={useAI} onChange={e => setUseAI(e.target.checked)} disabled={!aiAvailable || !!busy} /></div>
              {useAI && <p className="consent-note">By enabling AI review, you agree to send your resume, job description, and requirements to {aiConfig.aiProviderLabel}. Review personal details before continuing.</p>}
              <button className="button primary analyze-button" type="submit" disabled={!ready || !!busy}>{busy === 'analyze' ? <><LoaderCircle size={18} className="spin" /> {useAI ? 'Reviewing & refining…' : 'Checking your match…'}</> : <><ScanLine size={18} /> Analyze my resume <ArrowRight size={18} /></>}</button>
              <p className="privacy-caption"><ShieldCheck size={13} /> Processed in memory. Never saved by this app.</p>
            </div>
          </form>
          <section className="results-panel" ref={reportRef} aria-label="Resume evaluation" aria-busy={busy === 'analyze'}>
            <div className="results-header"><span><span className="live-dot" /> YOUR MATCH REPORT</span><span className="report-status">{result ? 'Analysis complete' : 'Ready when you are'}</span></div>
            {busy === 'analyze' ? <div className="loading-report" role="status"><span className="loading-icon"><ScanLine size={32} /></span><h2>A closer look at your experience.</h2><p>{useAI ? 'Checking compatibility and preparing your AI review. This can take up to 90 seconds.' : 'Comparing your resume with this opportunity…'}</p><LoaderCircle size={22} className="spin" /></div> : !result ? <EmptyReport /> : <>
              <div className="report-tabs" role="tablist" aria-label="Report views">{[['overview', 'Overview'], ['keywords', 'Keywords'], ['resume', 'Refined resume']].map(([id, label]) => <button key={id} id={`tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls={`panel-${id}`} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)} onKeyDown={e => { const ids = ['overview', 'keywords', 'resume']; if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); const next = e.key === 'Home' ? 0 : e.key === 'End' ? 2 : (ids.indexOf(id) + (e.key === 'ArrowRight' ? 1 : 2)) % 3; setTab(ids[next]); document.getElementById(`tab-${ids[next]}`).focus(); } }}>{label}{id === 'resume' && <Sparkles size={13} />}</button>)}</div>
              <div className="report-content" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
                {tab === 'overview' && <>
                  <div className="score-summary"><Score value={report.score} /><div><span className="eyebrow">COMPATIBILITY ESTIMATE</span><h2>{report.score >= 80 ? 'A strong starting point.' : report.score >= 55 ? 'Potential, with room to grow.' : 'Let’s close the gaps.'}</h2><p>{report.matchedCount} of {report.keywords.length} target terms found.<br />A useful guide for your next revision.</p></div></div>
                  <div className="estimate-note"><CircleHelp size={15} /><p>This is a heuristic score, not a pass probability. We cannot verify a company’s private ATS rules or inspect the original document’s visual layout.</p></div>
                  <div className="metrics"><Metric label="Keyword alignment" value={report.keywordScore} note="65% of overall score" /><Metric label="Text structure" value={report.structureScore} note="25% of overall score" /><Metric label="Impact signals" value={report.evidenceScore} note="10% of overall score" /></div>
                  <div className="report-section-title"><h3>Small changes. Meaningful impact.</h3><span>{report.suggestions.length} suggestions</span></div>
                  <div className="suggestions">{report.suggestions.length ? report.suggestions.map((suggestion, index) => <div key={suggestion}><span>{String(index + 1).padStart(2, '0')}</span><p>{suggestion}</p></div>) : <p className="success-note"><Check size={18} /> All local checks passed. Review the role’s substantive requirements before applying.</p>}</div>
                  <div className="report-section-title"><h3>Resume text checks</h3><span>{report.wordCount} words</span></div><div className="checks">{report.checks.map(check => <div key={check.name} title={check.detail}><span className={check.pass ? 'check-pass' : 'check-fail'}>{check.pass ? <Check size={14} /> : <span>!</span>}</span>{check.name}</div>)}</div>
                  {result.aiError && <div className="inline-error" role="alert">{result.aiError} The report and cleanup below use local checks.</div>}
                  {result.ai ? <div className="ai-review"><div className="ai-review-heading"><Sparkles size={19} /><h3>{result.aiProviderLabel || 'AI'} perspective</h3><span>{result.ai.fitScore}/100 fit estimate</span></div><p>{result.ai.summary}</p>{[['Evidence-backed strengths', result.ai.strengths], ['Requirements to address', result.ai.gaps], ['Recommended next steps', result.ai.recommendations], ['Review before applying', result.ai.cautions]].map(([title, items]) => items.length > 0 && <div key={title}><h4>{title}</h4><ul>{items.map((item, i) => <li key={i}>{item}</li>)}</ul></div>)}</div> : !result.aiError && <div className="local-note"><Sparkles size={17} /><p><strong>Local review completed.</strong> Enable AI review for semantic fit and a tailored rewrite. Local cleanup standardizes text formatting.</p></div>}
                  <button className="button primary refine-button" onClick={() => setTab('resume')}>Review refined resume <ArrowRight size={16} /></button>
                </>}
                {tab === 'keywords' && <><div className="tab-intro"><span className="eyebrow">THE LANGUAGE OF THE ROLE</span><h2>See where you align.</h2><p>Literal terms extracted from the job description. Must-haves carry double weight. A missing term can still be supported by related experience—AI review helps assess that.</p></div><div className="keyword-legend"><span><i className="legend-match" /> Found in resume</span><span><i className="legend-missing" /> Not found</span></div>{[[true, 'Already in your story'], [false, 'Worth a closer look']].map(([matched, title]) => <div className="keyword-group" key={title}><h3>{title} <span>{report.keywords.filter(k => k.matched === matched).length}</span></h3><div className="keyword-chips">{report.keywords.filter(k => k.matched === matched).map(keyword => <span className={matched ? 'matched' : 'missing'} key={keyword.term}>{matched ? <Check size={13} /> : <Plus size={13} />}{keyword.term}{keyword.required && <small>must-have</small>}</span>)}</div></div>)}<div className="estimate-note"><ShieldCheck size={16} /><p>Add a skill only if you have it. Keyword stuffing can make your resume less credible and won’t solve a real qualification gap.</p></div></>}
                {tab === 'resume' && <><div className="tab-intro"><span className="eyebrow">YOUR EXPERIENCE, MORE CLEARLY</span><h2>{result.ai ? 'A more focused resume.' : 'A cleaner foundation.'}</h2><p>{result.ai ? 'AI has tailored the wording to this role. Verify every fact, date, skill, and achievement before downloading.' : 'Headings, bullets, and whitespace have been standardized. Enable AI review for a role-specific rewrite.'}</p></div><div className="before-after"><div><span>Original</span><strong>{report.score}<small>/100</small></strong></div><ArrowRight size={20} /><div><span>{edited ? 'Last checked revision' : 'Revised text'}</span><strong>{result.revised.score}<small>/100</small></strong></div><span className="score-delta">{result.revised.score - report.score > 0 ? '+' : ''}{result.revised.score - report.score} points</span></div><label htmlFor="revised-resume" className="editor-label">Review & edit <span>{edited ? 'Unsaved score changes' : 'Editable resume text'}</span></label><textarea id="revised-resume" className="revised-editor" value={revised} onChange={e => { setRevised(e.target.value); setNotice(''); }} maxLength={MAX_TEXT} disabled={!!busy} spellCheck /><div className="editor-actions"><button className="text-button" onClick={rescore} disabled={!!busy}><RotateCcw size={14} /> Recheck edited text</button><span>{revised.length.toLocaleString()} characters</span></div><div className="changes"><h3>What changed</h3><ul>{result.changes.map((change, i) => <li key={i}>{change}</li>)}</ul></div><div className="download-actions"><button className="button primary" onClick={exportDocx} disabled={!!busy || revised.trim().length < 80}>{busy === 'export' ? <LoaderCircle size={16} className="spin" /> : <ArrowDownToLine size={16} />} Download DOCX</button><button className="button secondary" onClick={() => download(new Blob([revised], { type: 'text/plain;charset=utf-8' }), 'aligned-resume.txt')} disabled={!!busy || revised.trim().length < 80}>Download TXT</button></div><p className="download-note">Single-column, selectable text. Check the exported document before sending.</p></>}
              </div>
            </>}
            <div className="results-footer"><ShieldCheck size={14} /><span>Your experience stays yours. Review every claim before applying.</span></div>
          </section>
        </div>
        <div className="messages" aria-live="polite">{error && <div className="error-banner" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}><X size={17} /></button></div>}{notice && <div className="notice-banner"><Check size={17} />{notice}</div>}</div>
        <footer className="page-footer"><span><ShieldCheck size={14} /> Built around your privacy, and your potential.</span><button onClick={reset} disabled={!!busy}><RotateCcw size={14} /> Start fresh</button></footer>
      </main>
    </div>
    <dialog ref={helpRef} onCancel={() => setHelp(false)} onClick={e => { if (e.target === helpRef.current) setHelp(false); }} className="help-dialog"><button className="dialog-close" aria-label="Close help" onClick={() => setHelp(false)}><X size={20} /></button><span className="eyebrow">A CLEARER WAY TO APPLY</span><h2>One role. Your real experience.</h2><ol><li><strong>Add the opportunity.</strong> Paste the job description and list must-have requirements separately.</li><li><strong>Bring your resume.</strong> Upload a text-based PDF, DOCX, or UTF-8 TXT file, or paste the text. Review extraction for mistakes.</li><li><strong>Understand the match.</strong> Local checks compare literal terms, standard headings, and impact signals. They do not simulate any company’s ATS or evaluate visual formatting.</li><li><strong>Refine thoughtfully.</strong> Local cleanup preserves your content. Optional AI review evaluates semantic fit and rewrites using only supported facts.</li><li><strong>Review and download.</strong> Edit the revision, recheck its score, and export a clean DOCX or TXT resume.</li></ol><p>This app does not store your documents. Local checks run on this server. With AI enabled, documents are sent to {aiConfig.aiProviderLabel || 'the configured AI provider'}; provider data policies apply. No tool can guarantee an interview or an ATS pass.</p><button className="button primary" onClick={() => setHelp(false)}>Let’s get started <ArrowRight size={16} /></button></dialog>
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
