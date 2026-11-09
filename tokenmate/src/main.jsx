import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Dexie from 'dexie';
import { registerSW } from 'virtual:pwa-register';
import {
  Activity, ArrowDownToLine, ArrowLeftRight, ArrowUpRight, Bell, Check, CheckCheck,
  ChevronDown, ChevronRight, CircleHelp, Clipboard, Clock3, Download, FileText, Filter,
  Home, Info, Menu, MessageCircle, Minus, Plus, QrCode, ReceiptText, Send, Settings, ShieldCheck,
  Smartphone, Sparkles, Trash2, TrendingDown, TrendingUp, Upload, Wallet, X, Zap
} from 'lucide-react';
import tokenMateLogo from './assets/TokenMate.png';
import './style.css';

const db = new Dexie('tokenmate-local-v1');
db.version(1).stores({ payments: 'id, payer, paidAt, acknowledgementStatus, amount', settings: 'key' });
const money = n => new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(Number(n || 0));
const moneyExact = n => new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 2 }).format(Number(n || 0));
const dateLabel = value => new Intl.DateTimeFormat('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
const uid = () => crypto.randomUUID?.() || `tm-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const cleanToken = value => String(value || '').replace(/\D/g, '');
const timeGreeting = (date = new Date()) => {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 21) return 'Good evening';
  return 'Good night';
};

let updateServiceWorker = null;
function setupServiceWorker(onUpdate) {
  if (updateServiceWorker) return;
  updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() { onUpdate(); },
    onOfflineReady() {},
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;
      const check = () => { registration.update().catch(() => {}); };
      window.addEventListener('online', check);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
      window.setInterval(check, 60 * 60 * 1000);
    }
  });
}

function parseKplcSms(text) {
  const raw = text.trim();
  const amountMatch = raw.match(/(?:Kshs?|KES)\.?\s*([\d,]+(?:\.\d{1,2})?)/i) || raw.match(/(?:paid|payment|received).*?([\d,]+(?:\.\d{1,2})?)\s*(?:Kshs?|KES)/i);
  const tokenMatch = raw.match(/(?:token(?:\s*(?:number|no\.?))?\s*[:#-]?\s*)(\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{0,4})/i) || raw.match(/\b\d{20}\b/);
  const dateMatch = raw.match(/\b(\d{1,2}[/-][A-Za-z]{3}[/-]\d{2,4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/);
  const unitsMatch = raw.match(/([\d,.]+)\s*(?:kwh|units?)/i) || raw.match(/units?\s*[:=-]?\s*([\d,.]+)/i);
  const amount = amountMatch ? Number(amountMatch[1].replace(/,/g, '')) : '';
  const token = tokenMatch ? cleanToken(tokenMatch[1] || tokenMatch[0]) : '';
  const units = unitsMatch ? Number(unitsMatch[1].replace(/,/g, '')) : NaN;
  let paidAt = new Date().toISOString();
  if (dateMatch) { const parsed = new Date(dateMatch[1]); if (!Number.isNaN(parsed.getTime())) paidAt = parsed.toISOString(); }
  return { amount: Number.isFinite(amount) ? amount : '', tokenNumber: token, paidAt, units: Number.isFinite(units) ? units : '' };
}

const standaloneModes = ['standalone', 'fullscreen', 'minimal-ui'];
const isStandaloneMode = () => {
  if (typeof window === 'undefined') return false;
  const displayMode = standaloneModes.some(mode => window.matchMedia?.(`(display-mode: ${mode})`).matches);
  const iosStandalone = window.navigator.standalone === true;
  return Boolean(displayMode || iosStandalone);
};
const APK_URL = '/downloads/TokenMate.apk';
const isAndroidDevice = () => typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

function App() {
  const [page, setPage] = useState('dashboard');
  const [payments, setPayments] = useState([]);
  const [settings, setSettings] = useState({ members: ['You', 'Apartment mate'], myName: 'You', smsAccess: true });
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [toast, setToast] = useState('');
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(isStandaloneMode);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [filter, setFilter] = useState('All');
  const [landing, setLanding] = useState(() => !isStandaloneMode() && !sessionStorage.getItem('tokenmate-entered'));
  const [mobileMenu, setMobileMenu] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const menuButtonRef = useRef(null);
  const menuPanelRef = useRef(null);

  useEffect(() => {
    let alive = true;
    Promise.all([db.payments.toArray(), db.settings.toArray()]).then(([rows, saved]) => {
      if (!alive) return;
      setPayments(rows.sort((a,b) => new Date(b.paidAt)-new Date(a.paidAt)));
      const next = { ...settings }; saved.forEach(item => { next[item.key] = item.value; });
      if (!saved.some(item => item.key === 'members' && Array.isArray(item.value))) {
        next.members = [next.personA || next.members?.[0] || 'You', next.personB || next.members?.[1] || 'Apartment mate'];
      }
      next.members = next.members.map(name => String(name || '').trim()).filter(Boolean);
      if (next.members.length < 2) next.members = ['You', 'Apartment mate'];
      if (!next.myName || !next.members.includes(next.myName)) next.myName = next.members[0];
      if (typeof next.smsAccess !== 'boolean') next.smsAccess = true;
      setSettings(next);
      setLoading(false);
    }).catch(() => setLoading(false));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    setupServiceWorker(() => setUpdateReady(true));
  }, []);

  useEffect(() => {
    const onBeforeInstall = e => { e.preventDefault(); setInstallPrompt(e); };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setToast('TokenMate is installed. Open it from your home screen.');
      window.setTimeout(() => setToast(''), 4000);
    };
    const onDisplayChange = () => setInstalled(isStandaloneMode());
    const displayModes = standaloneModes.map(mode => window.matchMedia(`(display-mode: ${mode})`));
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    displayModes.forEach(mql => {
      if (mql.addEventListener) mql.addEventListener('change', onDisplayChange);
      else if (mql.addListener) mql.addListener(onDisplayChange);
    });
    if (navigator.getInstalledRelatedApps) {
      navigator.getInstalledRelatedApps().then(apps => { if (apps.length) setInstalled(true); }).catch(() => {});
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      displayModes.forEach(mql => {
        if (mql.removeEventListener) mql.removeEventListener('change', onDisplayChange);
        else if (mql.removeListener) mql.removeListener(onDisplayChange);
      });
    };
  }, []);

  useEffect(() => {
    if (!mobileMenu) return;
    const onKey = e => { if (e.key === 'Escape') setMobileMenu(false); };
    const onOutside = e => {
      if (menuButtonRef.current?.contains(e.target)) return;
      if (menuPanelRef.current?.contains(e.target)) return;
      setMobileMenu(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onOutside);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onOutside); };
  }, [mobileMenu]);

  const notify = message => { setToast(message); window.setTimeout(() => setToast(''), 3000); };
  const savePayment = async payment => {
    await db.payments.put(payment);
    setPayments(rows => [payment, ...rows.filter(p => p.id !== payment.id)].sort((a,b) => new Date(b.paidAt)-new Date(a.paidAt)));
  };
  const saveSetting = async (key, value) => { await db.settings.put({ key, value }); setSettings(s => ({ ...s, [key]: value })); };
  const totals = useMemo(() => {
    const members = settings.members || ['You', 'Apartment mate'];
    const byMember = members.map(name => ({ name, total: payments.filter(p => p.payer === name).reduce((s,p) => s + Number(p.amount), 0) }));
    const total = payments.reduce((s,p) => s + Number(p.amount), 0);
    const ranked = [...byMember].sort((x,y) => y.total - x.total);
    const top = ranked[0] || { name: members[0], total: 0 };
    const bottom = ranked[ranked.length - 1] || top;
    return { byMember, total, difference: top.total - bottom.total, top, bottom, count: payments.length };
  }, [payments, settings.members]);
  const tokenStats = useMemo(() => {
    const sourced = payments.filter(p => p.originalSms && Number(p.amount) > 0).sort((a,b) => new Date(a.paidAt)-new Date(b.paidAt));
    const amounts = sourced.map(p => Number(p.amount));
    const avgAmount = amounts.length ? amounts.reduce((s,n) => s+n, 0)/amounts.length : 0;
    const withUnits = sourced.filter(p => Number(p.units) > 0);
    const totalUnits = withUnits.reduce((s,p) => s+Number(p.units), 0);
    const totalUnitAmount = withUnits.reduce((s,p) => s+Number(p.amount), 0);
    const avgRate = totalUnits > 0 ? totalUnitAmount/totalUnits : 0;
    const series = withUnits.length >= 2 ? withUnits.map(p => Number(p.amount)/Number(p.units)) : amounts;
    let trend = 'steady'; let change = 0;
    if (series.length >= 2) {
      const mid = Math.floor(series.length/2);
      const older = series.slice(0, mid); const recent = series.slice(mid);
      const olderAvg = older.reduce((s,n) => s+n, 0)/older.length;
      const recentAvg = recent.reduce((s,n) => s+n, 0)/recent.length;
      if (olderAvg > 0) {
        change = ((recentAvg-olderAvg)/olderAvg)*100;
        if (change > 2) trend = 'rising'; else if (change < -2) trend = 'dropping';
      }
    }
    return { count: sourced.length, avgAmount, avgRate, unitsCount: withUnits.length, trend, change: Math.abs(change) };
  }, [payments]);

  const enterApp = () => { sessionStorage.setItem('tokenmate-entered', '1'); setLanding(false); setPage('dashboard'); };
  const applyUpdate = () => { if (updateServiceWorker) updateServiceWorker(true); };
  const runInstallPrompt = async () => {
    if (!installPrompt) return;
    try {
      const promptEvent = installPrompt;
      setInstallPrompt(null);
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === 'accepted') {
        notify('Installing TokenMate…');
      } else {
        notify('Installation dismissed. You can install later from your browser menu.');
      }
    } catch (e) {
      setShowInstallHelp(true);
    }
  };
  const installApp = async () => {
    if (installed && !installPrompt) { enterApp(); return; }
    if (!installPrompt || isAndroidDevice()) { setShowInstallHelp(true); return; }
    await runInstallPrompt();
  };

  if (landing) return <><Landing onEnter={enterApp} onInstall={installApp} installAvailable={!!installPrompt} installed={installed} />{showInstallHelp && <InstallHelpModal installed={installed} installAvailable={!!installPrompt} onNativeInstall={runInstallPrompt} onClose={() => setShowInstallHelp(false)} />}{updateReady && <UpdateBanner onUpdate={applyUpdate} onDismiss={() => setUpdateReady(false)} />}{toast && <div className="toast"><CheckCircleIcon/>{toast}</div>}</>;
  if (loading) return <><div className="loading-screen"><div className="loader-logo"><Zap size={30}/></div><div className="loading-line"/><p>Getting your power records ready</p></div>{updateReady && <UpdateBanner onUpdate={applyUpdate} onDismiss={() => setUpdateReady(false)} />}</>;

  const nav = [
    { id:'dashboard', label:'Overview', icon:Home }, { id:'payments', label:'Payments', icon:ReceiptText },
    { id:'messages', label:'Messages', icon:MessageCircle }, { id:'settings', label:'Settings', icon:Settings }
  ];
  const visiblePayments = payments.filter(p => filter === 'All' || p.payer === filter);

  return <div className={installed ? 'app-shell installed-app' : 'app-shell'}>
    <aside className="sidebar">
      <Brand onClick={() => setPage('dashboard')} />
      <div className="workspace-label">WORKSPACE</div>
      <nav>{nav.map(item => <button key={item.id} className={`nav-item ${page===item.id?'active':''}`} onClick={() => setPage(item.id)}><item.icon size={18}/><span>{item.label}</span>{item.id==='messages' && payments.some(p=>p.acknowledgementStatus==='pending') && <i className="nav-dot"/>}</button>)}</nav>
      <div className="sidebar-bottom"><button className="profile-mini" onClick={() => setPage('settings')}><div className="avatar">{(settings.myName||'Y').slice(0,1).toUpperCase()}</div><span><b>{settings.myName}</b><small>Apartment member</small></span><ChevronDown size={15}/></button></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><button className="mobile-brand" onClick={() => setPage('dashboard')}><BrandMark/><b>TokenMate</b></button><div className="breadcrumb">Workspace <ChevronRight size={14}/> <b>{nav.find(n=>n.id===page)?.label || 'Overview'}</b></div><div className="top-actions"><button className="icon-button" title="Help" onClick={() => setPage('about')}><CircleHelp size={19}/></button><button className="avatar top-avatar" onClick={() => setPage('settings')}>{(settings.myName||'Y').slice(0,1).toUpperCase()}</button><button ref={menuButtonRef} className="mobile-menu" type="button" aria-label={mobileMenu?'Close menu':'Open menu'} aria-controls="app-mobile-nav" aria-expanded={mobileMenu} onClick={() => setMobileMenu(v=>!v)}>{mobileMenu?<X size={20}/>:<Menu size={20}/>}</button></div></header>
      {mobileMenu && <div className="mobile-nav" id="app-mobile-nav" ref={menuPanelRef}>{nav.map(item=><button key={item.id} type="button" className={page===item.id?'active':''} onClick={()=>{setPage(item.id);setMobileMenu(false)}}><item.icon size={18}/>{item.label}</button>)}</div>}
      <div className="page-content">
        {page==='dashboard' && <Dashboard settings={settings} totals={totals} tokenStats={tokenStats} payments={payments} onAdd={()=>setShowAdd(true)} onPage={setPage} onReceive={()=>setShowReceive(true)} />}
        {page==='payments' && <PaymentsPage payments={visiblePayments} filter={filter} setFilter={setFilter} people={settings.members} onAdd={()=>setShowAdd(true)} onDelete={async p=>{if(p.acknowledgementStatus!=='acknowledged'){notify('This payment is locked until it is acknowledged.');return;} if(confirm('Delete this acknowledged payment?')){await db.payments.delete(p.id);setPayments(rows=>rows.filter(x=>x.id!==p.id));notify('Payment deleted.');}}} onShare={p=>sharePayment(p,notify)} />}
        {page==='messages' && <MessagesPage payments={payments} onReceive={()=>setShowReceive(true)} onShare={p=>sharePayment(p,notify)} onImportAck={async ack=>{const original=await db.payments.get(ack.paymentId);if(!original){notify('No matching payment was found.');return;} if(ack.type!=='tokenmate-ack' || ack.paymentId!==original.id){notify('This acknowledgement is not valid for this payment.');return;} const updated={...original, acknowledgementStatus:'acknowledged', acknowledgedAt:ack.acknowledgedAt||new Date().toISOString()};await savePayment(updated);notify('Acknowledgement received. Payment unlocked.');}} />}
        {page==='settings' && <SettingsPage settings={settings} onSave={saveSetting} onExport={async()=>{const data={format:'tokenmate-backup',version:1,exportedAt:new Date().toISOString(),payments,settings};downloadJson(data,'tokenmate-backup.json');notify('Backup downloaded.');}} onImport={async data=>{if(data?.format!=='tokenmate-backup'||!Array.isArray(data.payments)){notify('That backup file is not valid.');return;}for(const p of data.payments) await db.payments.put(p);setPayments(await db.payments.toArray());notify('Backup restored.');}} />}
        {page==='about' && <AboutPage />}
      </div>
    </main>
    <nav className="bottom-nav">{nav.map(item=><button key={item.id} className={page===item.id?'selected':''} onClick={()=>setPage(item.id)}><item.icon size={19}/><span>{item.label}</span></button>)}</nav>
    {showAdd && <AddPaymentModal people={settings.members} defaultPayer={settings.myName} smsAccess={settings.smsAccess} onClose={()=>setShowAdd(false)} onSave={async p=>{await savePayment(p);setShowAdd(false);notify('Payment saved.');}} />}
    {showReceive && <ReceiveModal onClose={()=>setShowReceive(false)} onPayment={async p=>{if(await db.payments.get(p.id)){notify('This payment is already in your records.');return;}await savePayment({...p,receivedAt:new Date().toISOString(),receivedHere:true});setShowReceive(false);notify('Payment imported. Review it and acknowledge when ready.');setPage('messages');}} onAck={async ack=>{const original=await db.payments.get(ack.paymentId);if(!original){notify('No matching payment found.');return;}await savePayment({...original,acknowledgementStatus:'acknowledged',acknowledgedAt:ack.acknowledgedAt||new Date().toISOString()});setShowReceive(false);notify('Acknowledgement imported. Payment unlocked.');}} />}
    {toast && <div className="toast"><CheckCircleIcon/>{toast}</div>}
  </div>;
}

function CheckCircleIcon(){return <span className="toast-check"><Check size={14}/></span>}
function BrandMark(){return <span className="brand-mark"><img src="/icon-192.png" alt="" /></span>}
function Brand({onClick}){return <button className="brand" onClick={onClick}><BrandMark/><span><b>TokenMate</b><small>POWER, ACCOUNTED FOR.</small></span></button>}

function Landing({onEnter,onInstall,installAvailable,installed}){
  const [menuOpen,setMenuOpen]=useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = e => { if (e.key === 'Escape') setMenuOpen(false); };
    const onOutside = e => { if (!e.target.closest('.landing-header')) setMenuOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onOutside);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('click', onOutside); };
  }, [menuOpen]);
  return <div className="landing"><header className="landing-header"><Brand onClick={()=>window.scrollTo({top:0,behavior:'smooth'})}/><nav className={menuOpen?'open':''}><a href="#how" onClick={()=>setMenuOpen(false)}>How it works</a><a href="#faqs" onClick={()=>setMenuOpen(false)}>FAQs</a></nav><div className="landing-header-actions"><button className="landing-menu" type="button" aria-label={menuOpen?'Close menu':'Open menu'} aria-expanded={menuOpen} onClick={()=>setMenuOpen(!menuOpen)}>{menuOpen?<X size={19}/>:<Menu size={19}/>}</button><button className="button button-primary install-top" onClick={onInstall}><Smartphone size={17}/> {installed?'Open app':installAvailable?'Install app':'Get the app'}</button></div></header>
    <section className="hero"><div className="hero-copy"><div className="eyebrow"><span className="eyebrow-dot"/> MADE FOR SHARED HOMES</div><h1>Every token.<br/><em>Every contribution.</em><br/>All accounted for.</h1><p className="hero-desc">A simple, private way for apartment mates to track shared KPLC token payments, keep the original SMS evidence, and stay on the same page.</p><div className="hero-buttons"><button className="button button-primary button-large" onClick={onEnter}>Open TokenMate <ArrowUpRight size={18}/></button><button className="button button-light button-large" onClick={onInstall}><Download size={17}/> {installed?'Open app':installAvailable?'Install app':'Get the app'}</button></div><div className="hero-trust"><span><Zap size={15}/> Works offline</span><span><CheckCheck size={15}/> Shared payment records</span></div></div>
      <div className="hero-visual"><div className="visual-glow"/><div className="receipt-card"><div className="receipt-top"><span className="receipt-icon"><Zap size={18}/></span><span className="receipt-label">TOKEN PAYMENT</span><span className="receipt-status">SAVED</span></div><div className="receipt-amount">KSh 500<span>.00</span></div><div className="receipt-caption">Electricity token purchase</div><div className="receipt-divider"/><div className="receipt-row"><span>Paid by</span><b>Alex M.</b></div><div className="receipt-row"><span>Date & time</span><b>Today, 10:42 AM</b></div><div className="receipt-row"><span>Token number</span><b>•••• •••• •••• 4821</b></div><div className="receipt-divider"/><div className="receipt-confirm"><CheckCheck size={17}/> Shared payment evidence</div></div><div className="float-chip chip-one"><span className="chip-avatar blue">A</span><span><b>Alex paid</b><small>KSh 500</small></span><Check size={17}/></div><div className="float-chip chip-two"><span className="chip-icon"><MessageCircle size={17}/></span><span><b>Payment acknowledged</b><small>Both people are in sync</small></span></div><div className="hero-dots"/></div>
    </section>
    <section className="landing-stats"><div><strong>01</strong><span>One shared record</span></div><div><strong>02</strong><span>Everyone, clear totals</span></div><div><strong>24/7</strong><span>Available offline</span></div></section>
    <section id="how" className="landing-section"><div className="section-heading"><span className="eyebrow">HOW IT WORKS</span><h2>Less back-and-forth.<br/>More peace of mind.</h2><p>Keep a clear record of every electricity token contribution, from the original SMS to the acknowledgement.</p></div><div className="feature-grid"><Feature icon={FileText} number="01" title="Save the payment" desc="Paste the KPLC SMS or enter the payment details. Keep the original message with the token record."/><Feature icon={Send} number="02" title="Share the evidence" desc="Preview the payment, then send its record to your apartment mate through WhatsApp or another sharing app."/><Feature icon={CheckCheck} number="03" title="Acknowledge it" desc="The other person imports the record and confirms they have seen it. The sender imports that acknowledgement."/></div></section>
    <section id="faqs" className="landing-section faq-section"><div className="section-heading"><span className="eyebrow">GOOD TO KNOW</span><h2>Frequently asked questions</h2></div><div className="faq-list"><details><summary>Can TokenMate read all my SMS messages automatically?<ChevronDown size={18}/></summary><p>No. Browsers do not grant ordinary websites unrestricted access to the SMS inbox. You can paste the KPLC message or import a text file, then confirm the extracted details.</p></details><details><summary>Will my apartment mate see my records automatically?<ChevronDown size={18}/></summary><p>They will see a payment once you share it with them. Share a payment package and import the acknowledgement package to exchange records.</p></details><details><summary>Will it work without internet?<ChevronDown size={18}/></summary><p>Yes. After the app has been loaded and installed, it continues to work without an internet connection.</p></details><details><summary>Can a payment be deleted before it is acknowledged?<ChevronDown size={18}/></summary><p>No. A payment stays locked until the other person explicitly acknowledges it and you import their acknowledgement package.</p></details></div></section>
    <footer className="landing-footer"><Brand onClick={()=>window.scrollTo({top:0,behavior:'smooth'})}/><span>Independent apartment tool. Not an official KPLC product.</span><span>© {new Date().getFullYear()} TokenMate</span></footer>
  </div>;
}
function Feature({icon:Icon,number,title,desc}){return <article className="feature-card"><div className="feature-top"><span className="feature-icon"><Icon size={21}/></span><span>{number}</span></div><h3>{title}</h3><p>{desc}</p></article>}

function InstallHelpModal({installed,installAvailable,onNativeInstall,onClose}){
  const ua=navigator.userAgent||'';
  const isIPadOS=navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1;
  const isIOS=/iphone|ipad|ipod/i.test(ua)||isIPadOS;
  const isAndroid=/android/i.test(ua);
  const steps=isIOS?[
    'Open TokenMate in Safari. Installation does not work from in-app browsers.',
    'Tap the Share button in the browser toolbar.',
    'Scroll down and tap “Add to Home Screen”.',
    'Tap “Add” in the top-right corner.'
  ]:isAndroid?[
    'Open TokenMate in Chrome.',
    'Tap the three-dot menu in the top-right corner.',
    'Tap “Install app” or “Add to Home screen”.',
    'Confirm by tapping “Install” or “Add”.'
  ]:[
    'Open TokenMate in Chrome or Edge.',
    'Click the install icon in the address bar, or open the browser menu.',
    'Choose “Install TokenMate” or “Install page as app”.',
    'Confirm the installation.'
  ];
  return <Modal title="Install TokenMate" subtitle="Add TokenMate to your home screen for the full app experience." onClose={onClose}><div className="modal-form">{installed?<div className="install-help-status"><CheckCircleIcon/><p>TokenMate is already installed on this device. Open it from your home screen or app list.</p></div>:<><ol className="install-steps">{steps.map((step,i)=><li key={i}><span>{i+1}</span><p>{step}</p></li>)}</ol>{isAndroid&&<div className="install-apk"><a className="button button-primary full-button" href={APK_URL} download="TokenMate.apk"><Download size={16}/> Download Android app (APK)</a>{installAvailable&&<button className="button button-outline full-button" onClick={onNativeInstall}><Smartphone size={16}/> Install from browser instead</button>}<p>After downloading, open the APK and allow installs from this browser when Android asks.</p></div>}</>}<div className="receive-tip"><ShieldCheck size={18}/><span>Installation requires HTTPS in production. After installing, TokenMate opens without browser bars and keeps working offline.</span></div><button className="button button-primary full-button" onClick={onClose}>Got it</button></div></Modal>;
}

function Dashboard({settings,totals,tokenStats,smsAccess,payments,onAdd,onPage,onReceive}){
  const recent=payments.slice(0,4);const pending=payments.filter(p=>p.acknowledgementStatus==='pending').length;
  const TrendIcon=tokenStats.trend==='rising'?TrendingUp:tokenStats.trend==='dropping'?TrendingDown:Minus;
  const trendLabel=tokenStats.trend==='rising'?'Rising':tokenStats.trend==='dropping'?'Dropping':'Steady';
  return <><div className="page-heading"><div><div className="eyebrow">YOUR APARTMENT</div><h1>{timeGreeting()}, {settings.myName}.</h1><p>Here's how your shared electricity contributions are looking.</p></div><div className="heading-actions"><button className="button button-outline" onClick={onReceive}><ArrowDownToLine size={17}/> Receive payment</button><button className="button button-primary" onClick={onAdd}><Plus size={18}/> Add payment</button></div></div>
    <div className="welcome-banner"><div className="banner-copy"><span className="banner-kicker"><Sparkles size={14}/> APARTMENT POWER SUMMARY</span><h2>Keep the power on.<br/><span>Keep everything clear.</span></h2><p>Every contribution deserves a clear record.</p></div><div className="banner-art"><div className="banner-circle"><img className="banner-logo" src={tokenMateLogo} alt="TokenMate" /></div><div className="banner-spark spark-a">✦</div><div className="banner-spark spark-b">✧</div></div></div>
    <div className="stats-grid"><StatCard label="Total contributions" value={money(totals.total)} note={`${totals.count} recorded payment${totals.count===1?'':'s'}`} icon={Wallet} tone="blue"/>{totals.byMember.map((m,i)=><StatCard key={m.name} label={m.name} value={money(m.total)} note="Total paid so far" icon={Activity} tone={['yellow','purple','green','blue'][i%4]}/>)}<StatCard label="Contribution gap" value={money(totals.difference)} note={totals.difference===0?'Everyone is currently even':`${totals.top.name} has paid more`} icon={Zap} tone="green"/></div>
    {smsAccess && <section className="panel token-insights"><div className="panel-heading"><div><h3>Token insights</h3><p>Calculated from your saved KPLC SMS messages</p></div><span className={`trend-pill ${tokenStats.trend}`}><TrendIcon size={14}/> {trendLabel}{tokenStats.count>1?` ${tokenStats.change.toFixed(1)}%`:''}</span></div><div className="insight-metrics"><div><span>Average per purchase</span><b>{tokenStats.count?money(tokenStats.avgAmount):'—'}</b><small>{tokenStats.count} message{tokenStats.count===1?'':'s'} analysed</small></div><div><span>Average token rate</span><b>{tokenStats.avgRate?`${moneyExact(tokenStats.avgRate)}/kWh`:'—'}</b><small>{tokenStats.avgRate?'From imported SMS units':'Add kWh units to your SMS to see the rate'}</small></div><div><span>Trend</span><b className={`trend-text ${tokenStats.trend}`}>{trendLabel}</b><small>{tokenStats.count>1?(tokenStats.trend==='rising'?'Higher than earlier purchases':tokenStats.trend==='dropping'?'Lower than earlier purchases':'In line with earlier purchases'):'Add more messages to compare'}</small></div></div></section>}
    <div className="content-grid"><section className="panel recent-panel"><div className="panel-heading"><div><h3>Recent payments</h3><p>Your latest token contributions</p></div><button className="text-button" onClick={()=>onPage('payments')}>View all <ChevronRight size={16}/></button></div>{recent.length?<div className="payment-list">{recent.map(p=><PaymentRow key={p.id} payment={p}/>)}</div>:<EmptyState icon={ReceiptText} title="No payments yet" text="Add your first KPLC token payment to start your apartment ledger."/>}</section>
    <section className="panel action-panel"><div className="panel-heading"><div><h3>Quick actions</h3><p>Keep your records moving</p></div><span className="quick-bolt"><Zap size={17}/></span></div><button className="quick-action" onClick={onAdd}><span className="quick-icon yellow-bg"><Plus/></span><span><b>Record a payment</b><small>Add amount, token and SMS evidence</small></span><ChevronRight/></button><button className="quick-action" onClick={onReceive}><span className="quick-icon blue-bg"><ArrowDownToLine/></span><span><b>Receive a payment</b><small>Import a record from a apartment mate</small></span><ChevronRight/></button><button className="quick-action" onClick={()=>onPage('messages')}><span className="quick-icon purple-bg"><MessageCircle/></span><span><b>Review shared messages</b><small>{pending?`${pending} payment${pending===1?'':'s'} awaiting acknowledgement`:'Check acknowledgements and replies'}</small></span><ChevronRight/></button></section></div>
  </>;
}
function StatCard({label,value,note,icon:Icon,tone}){return <article className="stat-card"><div className="stat-top"><span>{label}</span><span className={`stat-icon ${tone}`}><Icon size={18}/></span></div><strong>{value}</strong><small>{note}</small></article>}
function PaymentRow({payment:p}){return <div className="payment-row"><div className="payment-symbol"><Zap size={19}/></div><div className="payment-main"><b>{p.payer} <span>·</span> KPLC token</b><small>{dateLabel(p.paidAt)} {p.tokenNumber?`· Token ending ${p.tokenNumber.slice(-4)}`:''}</small></div><div className="payment-right"><b>{money(p.amount)}</b><span className={`status ${p.acknowledgementStatus}`}>{p.acknowledgementStatus==='acknowledged'?<><CheckCheck size={12}/> Acknowledged</>:<><Clock3 size={12}/> Awaiting</>}</span></div></div>}
function EmptyState({icon:Icon,title,text}){return <div className="empty-state"><span><Icon size={23}/></span><b>{title}</b><p>{text}</p></div>}

function AddPaymentModal({people,defaultPayer,smsAccess,onClose,onSave}){
  const [payer,setPayer]=useState(defaultPayer);const [amount,setAmount]=useState('');const [tokenNumber,setTokenNumber]=useState('');const [units,setUnits]=useState('');const [paidAt,setPaidAt]=useState(new Date().toISOString().slice(0,16));const [sms,setSms]=useState('');const [notes,setNotes]=useState('');const [error,setError]=useState('');
  const applySms=text=>{if(!String(text||'').trim())return;const result=parseKplcSms(text);if(result.amount)setAmount(String(result.amount));if(result.tokenNumber)setTokenNumber(result.tokenNumber);if(result.units)setUnits(String(result.units));if(result.paidAt) setPaidAt(new Date(result.paidAt).toISOString().slice(0,16));};
  const parse=()=>applySms(sms);
  const readSms=text=>{setSms(text);if(smsAccess)applySms(text);};
  const submit=async e=>{e.preventDefault();const n=Number(amount);if(!Number.isFinite(n)||n<25){setError('The contribution must be at least KSh 25.');return;}if(!Number.isInteger(n*100)){setError('Enter a valid amount.');return;}if(tokenNumber && cleanToken(tokenNumber).length!==20){setError('A KPLC token number should contain 20 digits. Check the number or leave it blank.');return;}await onSave({id:uid(),payer,amount:n,tokenNumber:cleanToken(tokenNumber),units:units?Number(units):null,paidAt:new Date(paidAt).toISOString(),originalSms:sms.trim(),notes:notes.trim(),createdAt:new Date().toISOString(),acknowledgementStatus:'pending',acknowledgedAt:null,version:1});};
  return <Modal title="Record a token payment" subtitle="Save the payment details and original KPLC SMS evidence." onClose={onClose}><form onSubmit={submit} className="modal-form"><div className="field"><label>Who made this payment?</label><div className="choice-row">{people.map((p,i)=><button type="button" key={p} className={`choice ${payer===p?'chosen':''}`} onClick={()=>setPayer(p)}><span className={`choice-avatar c${i}`}>{p.slice(0,1).toUpperCase()}</span>{p}</button>)}</div></div><div className="field"><label>Contribution amount <span className="required">*</span></label><div className="amount-input"><span>KSh</span><input type="number" min="25" step="1" placeholder="e.g. 500" value={amount} onChange={e=>setAmount(e.target.value)} required/></div><div className="amount-presets">{[50,100,200,500].map(n=><button type="button" className={Number(amount)===n?'preset active':'preset'} key={n} onClick={()=>setAmount(String(n))}>+{n}</button>)}</div><small className="field-help">Minimum contribution: KSh 25</small></div><div className="field"><label>Payment date & time</label><input type="datetime-local" value={paidAt} onChange={e=>setPaidAt(e.target.value)} required/></div><div className="field"><label>20-digit token number <span className="optional">Optional</span></label><input value={tokenNumber} onChange={e=>setTokenNumber(e.target.value)} placeholder="Enter token number" inputMode="numeric" maxLength={24}/></div><div className="field"><label>Units (kWh) <span className="optional">Optional</span></label><input value={units} onChange={e=>setUnits(e.target.value)} placeholder="e.g. 6.8" inputMode="decimal"/><small className="field-help">Used to calculate your average token rate.</small></div><div className="field"><div className="label-row"><label>Original KPLC SMS <span className="optional">Recommended evidence</span></label></div><textarea rows="4" placeholder="Paste the KPLC payment SMS here…" value={sms} onChange={e=>setSms(e.target.value)} onPaste={e=>{const pasted=e.clipboardData?.getData('text')||'';if(pasted&&smsAccess)applySms(pasted);}}/><div className="sms-tools"><button type="button" className="text-button parse-button" onClick={parse}><Sparkles size={15}/> Extract amount and token from SMS</button><label className="text-button sms-file-label"><Upload size={14}/> Import .txt SMS<input type="file" accept=".txt,text/plain" onChange={async e=>{const f=e.target.files?.[0];if(f){readSms(await f.text());}e.target.value='';}}/></label></div><small className="field-help">Importing or pasting an SMS fills the amount, token number and date automatically. Check the details before saving.</small></div><div className="field"><label>Notes <span className="optional">Optional</span></label><input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="e.g. Bought tokens for the sitting room"/></div>{error&&<div className="form-error">{error}</div>}<div className="modal-foot"><span><Check size={15}/> Review before saving</span><button className="button button-primary" type="submit"><Check size={17}/> Save payment</button></div></form></Modal>;
}

function PaymentsPage({payments,filter,setFilter,people,onAdd,onDelete,onShare}){return <><div className="page-heading"><div><div className="eyebrow">APARTMENT LEDGER</div><h1>Payment history</h1><p>A clear record of every token contribution.</p></div><button className="button button-primary" onClick={onAdd}><Plus size={18}/> Add payment</button></div><section className="panel table-panel"><div className="panel-heading"><div><h3>All transactions</h3><p>{payments.length} payment record{payments.length===1?'':'s'}</p></div><div className="filter-control"><Filter size={15}/><select value={filter} onChange={e=>setFilter(e.target.value)}><option>All</option>{people.map(p=><option key={p}>{p}</option>)}</select></div></div>{payments.length?<div className="table-wrap"><table><thead><tr><th>PAYMENT</th><th>PAID BY</th><th>DATE</th><th>AMOUNT</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>{payments.map(p=><tr key={p.id}><td><div className="table-payment"><span><Zap size={16}/></span><div><b>KPLC token</b><small>{p.tokenNumber?`Token ···· ${p.tokenNumber.slice(-4)}`:'Token not added'}</small></div></div></td><td>{p.payer}</td><td>{dateLabel(p.paidAt)}</td><td><b>{money(p.amount)}</b></td><td><span className={`status ${p.acknowledgementStatus}`}>{p.acknowledgementStatus==='acknowledged'?'Acknowledged':'Awaiting acknowledgement'}</span></td><td><div className="table-actions"><button title="Share payment" onClick={()=>onShare(p)}><Send size={16}/></button><button title={p.acknowledgementStatus==='acknowledged'?'Delete payment':'Locked until acknowledged'} disabled={p.acknowledgementStatus!=='acknowledged'} onClick={()=>onDelete(p)}><Trash2 size={16}/></button></div></td></tr>)}</tbody></table></div>:<EmptyState icon={ReceiptText} title="No matching payments" text="Add a payment or choose a different filter."/>}</section><div className="info-strip"><Info size={17}/><p><b>Why are some payments locked?</b> A payment cannot be deleted until another member has acknowledged it and their acknowledgement has been imported here.</p></div></>}

function MessagesPage({payments,onReceive,onShare,onImportAck}){const [preview,setPreview]=useState(null);const pending=payments.filter(p=>p.acknowledgementStatus==='pending');const received=payments.filter(p=>p.receivedHere);return <><div className="page-heading"><div><div className="eyebrow">SHARED EVIDENCE</div><h1>Messages & acknowledgements</h1><p>Preview payment records before sharing or confirming them.</p></div><button className="button button-primary" onClick={onReceive}><ArrowDownToLine size={17}/> Receive message</button></div><div className="message-columns"><section className="panel"><div className="panel-heading"><div><h3>Awaiting acknowledgement</h3><p>Payments you have recorded and shared</p></div><span className="count-badge">{pending.length}</span></div>{pending.length?pending.map(p=><div className="message-card" key={p.id}><div className="message-card-top"><span className="message-avatar"><ReceiptText size={18}/></span><span className="status pending"><Clock3 size={12}/> Awaiting</span></div><h4>{p.payer} · {money(p.amount)}</h4><p>{dateLabel(p.paidAt)} · {p.tokenNumber?`Token ending ${p.tokenNumber.slice(-4)}`:'No token number'}</p><div className="message-actions"><button className="button button-outline button-small" onClick={()=>setPreview(p)}>Preview</button><button className="button button-primary button-small" onClick={()=>onShare(p)}><Send size={14}/> Share</button></div></div>):<EmptyState icon={CheckCheck} title="All caught up" text="New payments will appear here until the other members acknowledge them."/>}</section><section className="panel"><div className="panel-heading"><div><h3>Received payments</h3><p>Records imported from your apartment mates</p></div><span className="count-badge">{received.length}</span></div>{received.length?received.map(p=><div className="message-card" key={p.id}><div className="message-card-top"><span className="message-avatar received"><ArrowDownToLine size={18}/></span><span className="status received-status">Received</span></div><h4>{p.payer} · {money(p.amount)}</h4><p>{dateLabel(p.paidAt)}</p><div className="message-actions"><button className="button button-outline button-small" onClick={()=>setPreview(p)}>Preview</button><button className="button button-primary button-small" onClick={()=>setPreview(p)}>Review & acknowledge</button></div></div>):<EmptyState icon={MessageCircle} title="Nothing received yet" text="When a apartment mate shares a payment package, import it here to review and acknowledge it."/>}</section></div>{preview&&<PaymentPreview payment={preview} onClose={()=>setPreview(null)} onShare={()=>onShare(preview)} onAcknowledge={preview.receivedHere?()=>shareAcknowledgement(preview):null}/>}<div className="info-strip"><ShieldCheck size={17}/><p>Only acknowledge a payment after checking its amount, date, token details and original SMS. An acknowledgement is an explicit confirmation, not a WhatsApp read receipt.</p></div></>}

function SettingsPage({settings,onSave,onExport,onImport}){const [members,setMembers]=useState(settings.members||['You','Apartment mate']);const [me,setMe]=useState(settings.myName);const [smsAccess,setSmsAccess]=useState(settings.smsAccess!==false);const [backupBusy,setBackupBusy]=useState(false);const updateMember=(i,value)=>setMembers(list=>list.map((m,idx)=>idx===i?value:m));const addMember=()=>setMembers(list=>[...list,'']);const removeMember=i=>setMembers(list=>list.length>2?list.filter((_,idx)=>idx!==i):list);const save=async()=>{const names=members.map(n=>n.trim()).filter(Boolean);if(names.length<2){alert('Add at least two apartment members.');return;}if(new Set(names.map(n=>n.toLowerCase())).size!==names.length){alert('Each apartment member needs a different name.');return;}const owner=names.includes(me)?me:names[0];await onSave('members',names);await onSave('myName',owner);await onSave('personA',names[0]);await onSave('personB',names[1]);alert('Apartment settings saved.');};const importFile=async e=>{const file=e.target.files?.[0];if(!file)return;try{const data=JSON.parse(await file.text());await onImport(data);}catch{alert('Could not read this JSON file.');}e.target.value='';};return <><div className="page-heading"><div><div className="eyebrow">PREFERENCES</div><h1>Settings</h1><p>Set up your apartment and manage your records.</p></div></div><div className="settings-grid"><section className="panel settings-panel"><div className="panel-heading"><div><h3>Apartment members</h3><p>Choose the names used in your payment records.</p></div></div><div className="field"><label>Your name</label><input value={members[0]||''} onChange={e=>updateMember(0,e.target.value)} maxLength={30} placeholder="e.g. Alex"/></div><div className="field"><label>Apartment mate name</label><input value={members[1]||''} onChange={e=>updateMember(1,e.target.value)} maxLength={30} placeholder="e.g. Sam"/></div>{members.slice(2).map((m,idx)=><div className="field" key={idx+2}><div className="label-row"><label>Apartment member {idx+3}</label><button type="button" className="text-button" onClick={()=>removeMember(idx+2)}>Remove</button></div><input value={m} onChange={e=>updateMember(idx+2,e.target.value)} maxLength={30} placeholder="Name"/></div>)}<button type="button" className="button button-outline add-member" onClick={addMember}><Plus size={16}/> Add another mate</button><div className="field"><label>This device belongs to</label><select value={members.includes(me)?me:(members[0]||'')} onChange={e=>setMe(e.target.value)}>{members.map((m,i)=><option key={i} value={m}>{m||`Member ${i+1}`}</option>)}</select></div><button className="button button-primary" onClick={save}>Save apartment settings</button></section><section className="panel settings-panel"><div className="panel-heading"><div><h3>Backup & restore</h3><p>Keep a portable copy of your apartment records.</p></div><span className="settings-icon"><Download size={18}/></span></div><div className="backup-option"><span className="backup-icon"><Download/></span><div><b>Export a backup</b><small>Download all payments and settings as a JSON file.</small></div><button className="button button-outline button-small" onClick={onExport}>Export</button></div><div className="backup-option"><span className="backup-icon"><Upload/></span><div><b>Restore a backup</b><small>Import a previously exported TokenMate backup.</small></div><label className="button button-outline button-small file-label">Import<input type="file" accept="application/json,.json" onChange={importFile}/></label></div><div className="warning-note"><Info size={16}/><span>Export backups regularly so you always have a portable copy of your apartment records.</span></div></section></div><section className="panel about-settings"><div className="about-row"><span className="settings-icon"><ShieldCheck/></span><div><b>Sharing & privacy</b><p>Share payment records with your apartment mates whenever you choose. You stay in control of who receives them.</p></div></div><div className="about-row"><span className="settings-icon"><Smartphone/></span><div><b>Works offline</b><p>After the first successful load, the app keeps working without an internet connection.</p></div></div></section><section className="panel settings-panel message-access"><div className="panel-heading"><div><h3>Message access</h3><p>Let TokenMate read the SMS messages you paste or import.</p></div><span className="settings-icon"><MessageCircle size={18}/></span></div><div className="access-row"><div><b>Allow message access</b><small>Browsers cannot read your SMS inbox directly. When enabled, KPLC SMS text you paste or import automatically fills the amount, token number, units and date, and is used to calculate your token averages in Overview.</small></div><button type="button" role="switch" aria-checked={smsAccess} className={`switch ${smsAccess?'on':''}`} onClick={()=>{const next=!smsAccess;setSmsAccess(next);onSave('smsAccess',next);}}><span/></button></div></section></>}

function AboutPage(){return <><div className="page-heading"><div><div className="eyebrow">ABOUT TOKENMATE</div><h1>Power, accounted for.</h1><p>A simple tool for fair, transparent apartment electricity contributions.</p></div></div><section className="panel about-settings"><h3>Built for shared homes</h3><p>TokenMate helps apartment mates keep a reliable record of prepaid electricity purchases. Save the amount, payment time, token number and original SMS, then share the record with the other members.</p><p><b>Important:</b> TokenMate is an independent apartment tool, not an official KPLC product. It does not verify payments with KPLC. Always check the original payment message and token details.</p></section></>}

function Modal({title,subtitle,onClose,children}){return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="modal"><div className="modal-header"><div><h2>{title}</h2><p>{subtitle}</p></div><button className="icon-button" onClick={onClose}><X/></button></div>{children}</section></div>}
function ReceiveModal({onClose,onPayment,onAck}){const [text,setText]=useState('');const [error,setError]=useState('');const [parsed,setParsed]=useState(null);const [kind,setKind]=useState('payment');const parse=()=>{try{const obj=JSON.parse(text);if(obj.type==='tokenmate-ack'){setKind('ack');setParsed(obj);setError('');return;}if(obj.type==='tokenmate-payment'&&obj.payment?.id&&typeof obj.payment.payer==='string'&&Number.isFinite(Number(obj.payment.amount))&&Number(obj.payment.amount)>=25&&!Number.isNaN(new Date(obj.payment.paidAt).getTime())){setKind('payment');setParsed(obj.payment);setError('');return;}if(obj.format==='tokenmate-backup'){setError('This is a full backup. Use Settings → Restore a backup instead.');return;}setError('This does not look like a TokenMate payment or acknowledgement package.');}catch{setError('Paste the complete JSON package shared by the other person.');}};return <Modal title="Receive a shared message" subtitle="Paste the TokenMate package or choose a JSON file shared by the other person." onClose={onClose}><div className="modal-form"><div className="receive-tip"><MessageCircle size={18}/><span>In WhatsApp, open the shared file and copy its contents, or download the JSON file to this device.</span></div><textarea rows="7" value={text} onChange={e=>{setText(e.target.value);setParsed(null);}} placeholder="Paste the shared TokenMate JSON package here…"/><label className="button button-outline file-label full-file"><Upload size={16}/> Choose JSON file<input type="file" accept="application/json,.json,text/plain" onChange={async e=>{const f=e.target.files?.[0];if(f)setText(await f.text());}}/></label><button className="button button-primary full-button" onClick={parse}>Preview received package</button>{error&&<div className="form-error">{error}</div>}{parsed&&<div className="received-preview"><div className="received-preview-head"><CheckCircleIcon/>{kind==='ack'?'Acknowledgement package found':'Payment package found'}</div>{kind==='payment'?<><h3>{parsed.payer} · {money(parsed.amount)}</h3><p>{dateLabel(parsed.paidAt)}</p><p>{parsed.tokenNumber?`Token number ending ${parsed.tokenNumber.slice(-4)}`:'No token number included'}</p><p className="preview-disclaimer">Review the original SMS and details after importing. Only import records from someone you trust.</p><button className="button button-primary full-button" onClick={()=>onPayment(parsed)}>Import this payment</button></>:<><p>Payment ID: {parsed.paymentId}</p><p>This acknowledgement will unlock the matching payment on the original sender's device.</p><button className="button button-primary full-button" onClick={()=>onAck(parsed)}>Import acknowledgement</button></>}</div>}</div></Modal>}
function PaymentPreview({payment:p,onClose,onShare,onAcknowledge}){return <Modal title="Payment evidence" subtitle="Review the details saved with this payment." onClose={onClose}><div className="evidence-preview"><div className="evidence-amount">{money(p.amount)}</div><span className={`status ${p.acknowledgementStatus}`}>{p.acknowledgementStatus==='acknowledged'?'Acknowledged':'Awaiting acknowledgement'}</span><div className="evidence-details"><div><span>Paid by</span><b>{p.payer}</b></div><div><span>Date & time</span><b>{dateLabel(p.paidAt)}</b></div><div><span>Token number</span><b>{p.tokenNumber||'Not provided'}</b></div><div><span>Units</span><b>{p.units?`${p.units} kWh`:'Not provided'}</b></div><div><span>Record ID</span><b className="id-text">{p.id}</b></div></div><div className="original-sms"><b><FileText size={15}/> Original KPLC SMS</b><p>{p.originalSms||'No original SMS was attached to this payment.'}</p></div>{p.notes&&<div className="original-sms"><b>Notes</b><p>{p.notes}</p></div>}<div className="preview-actions"><button className="button button-outline" onClick={onShare}><Send size={16}/> Share payment</button>{onAcknowledge&&<button className="button button-primary" onClick={onAcknowledge}><CheckCheck size={16}/> Acknowledge & share</button>}</div></div></Modal>}

async function sharePayment(payment,notify){const payload={type:'tokenmate-payment',version:1,sharedAt:new Date().toISOString(),payment};const json=JSON.stringify(payload,null,2);const filename=`tokenmate-payment-${payment.id.slice(0,8)}.json`;const summary=`TokenMate payment record\nPaid by: ${payment.payer}\nAmount: ${money(payment.amount)}\nDate: ${dateLabel(payment.paidAt)}\nToken: ${payment.tokenNumber||'Not provided'}\n\nTo review the original evidence, import the attached TokenMate JSON package in TokenMate. After reviewing, acknowledge the payment and send the acknowledgement package back.`;
  try{const file=new File([json],filename,{type:'application/json'});if(navigator.canShare?.({files:[file]})&&navigator.share){await navigator.share({title:'TokenMate payment evidence',text:summary,files:[file]});return;}if(navigator.share){await navigator.share({title:'TokenMate payment evidence',text:`${summary}\n\nPackage JSON:\n${json}`});return;}}catch(e){if(e.name==='AbortError')return;}
  downloadJson(payload,filename);const wa=`https://wa.me/?text=${encodeURIComponent(summary+'\n\nThe JSON package has been downloaded separately. Please attach that file in this WhatsApp chat.')}`;window.open(wa,'_blank','noopener,noreferrer');notify('Payment file downloaded. Attach it to the WhatsApp message.');}
async function shareAcknowledgement(payment){const ack={type:'tokenmate-ack',version:1,paymentId:payment.id,acknowledgedAt:new Date().toISOString()};const filename=`tokenmate-ack-${payment.id.slice(0,8)}.json`;const json=JSON.stringify(ack,null,2);const message=`I have reviewed and acknowledged the TokenMate payment from ${payment.payer} for ${money(payment.amount)} on ${dateLabel(payment.paidAt)}. Please import the attached acknowledgement JSON in TokenMate to unlock the original record.`;try{const file=new File([json],filename,{type:'application/json'});if(navigator.canShare?.({files:[file]})&&navigator.share){await navigator.share({title:'TokenMate acknowledgement',text:message,files:[file]});return;}}catch(e){if(e.name==='AbortError')return;}downloadJson(ack,filename);window.open(`https://wa.me/?text=${encodeURIComponent(message+'\n\nThe acknowledgement file was downloaded separately. Please attach it to this WhatsApp chat.')}`,'_blank','noopener,noreferrer');}
function downloadJson(data,filename){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);}

createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
