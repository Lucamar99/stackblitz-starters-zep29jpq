'use client';

import { useState, useEffect } from 'react';
import { UserButton, SignInButton, useUser } from '@clerk/nextjs';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, UploadCloud, ChevronDown, FileText, Loader2, Sparkles, BrainCircuit, History } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { PDFDocument } from 'pdf-lib';
import 'katex/dist/katex.min.css';

export default function Home() {
  const { isSignedIn, user } = useUser();
  const [apiKey, setApiKey] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [expandedChapter, setExpandedChapter] = useState<number | null>(0);

  // Caricamento Storia dal Database
  useEffect(() => {
    if (isSignedIn) {
      fetch('/api/study').then(res => res.json()).then(dbData => {
        // Logica per raggruppare i dati per PDF
        setHistory(dbData);
      });
      const savedKey = localStorage.getItem('study_buddy_api_key');
      if (savedKey) setApiKey(savedKey);
    }
  }, [isSignedIn]);

  const startAutoPilot = async () => {
    if (!file || !apiKey) return alert("Manca file o API Key!");
    setLoading(true);
    localStorage.setItem('study_buddy_api_key', apiKey);

    try {
      const formOutline = new FormData();
      formOutline.append('file', file);
      formOutline.append('apiKey', apiKey);
      formOutline.append('action', 'outline');

      const outlineRes = await fetch('/api/study', { method: 'POST', body: formOutline });
      const outlineData = await outlineRes.json();
      
      const fileBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(fileBuffer);
      const totalPages = pdfDoc.getPageCount();

      let chapters = [];
      for (let i = 0; i < outlineData.capitoli.length; i++) {
        const cap = outlineData.capitoli[i];
        const next = outlineData.capitoli[i+1];
        let s = Math.max(0, parseInt(cap.paginaInizio) - 1);
        let e = next ? parseInt(next.paginaInizio) - 2 : totalPages - 1;

        const newPdf = await PDFDocument.create();
        const pages = await newPdf.copyPages(pdfDoc, Array.from({length: e - s + 1}, (_, k) => s + k));
        pages.forEach(p => newPdf.addPage(p));
        const blob = new Blob([await newPdf.save()], {type: 'application/pdf'});

        const formData = new FormData();
        formData.append('file', new File([blob], 'cap.pdf'));
        formData.append('apiKey', apiKey);
        formData.append('action', 'chapter');
        formData.append('focus', cap.titolo);
        formData.append('pdfName', file.name);

        const capRes = await fetch('/api/study', { method: 'POST', body: formData });
        const capData = await capRes.json();
        chapters.push({ titolo: cap.titolo, testo: capData.riassunto });
        setData({ chapters: [...chapters] });
        
        await new Promise(r => setTimeout(r, 4000));
      }
    } catch (e) { alert("Errore"); }
    setLoading(false);
  };

  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-blue-600 rounded-3xl mb-8 flex items-center justify-center shadow-2xl shadow-blue-500/20">
          <BookOpen className="text-white w-10 h-10" />
        </div>
        <h1 className="text-5xl font-black mb-4 tracking-tighter">studdy<span className="text-blue-600">.</span></h1>
        <p className="text-gray-400 mb-10 max-w-sm text-lg">Il tuo archivio di studio intelligente, sincronizzato su ogni dispositivo.</p>
        <SignInButton mode="modal">
          <button className="px-10 py-4 bg-white text-black font-bold rounded-2xl hover:bg-gray-200 transition-all text-lg">Accedi per iniziare</button>
        </SignInButton>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-6 md:p-12">
      <header className="max-w-5xl mx-auto flex justify-between items-center mb-16">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center"><BookOpen className="w-5 h-5" /></div>
          <h2 className="text-2xl font-bold lowercase tracking-tighter">studdy.</h2>
        </div>
        <UserButton afterSignOutUrl="/" />
      </header>

      <main className="max-w-4xl mx-auto">
        {!data && !loading ? (
          <div className="grid md:grid-cols-2 gap-8">
            <div className="p-8 rounded-[2.5rem] bg-white/5 border border-white/10 space-y-6">
              <h3 className="text-xl font-bold flex items-center gap-2"><Sparkles className="text-blue-500" /> Nuova Analisi</h3>
              <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} className="w-full p-4 bg-black/40 rounded-xl border border-white/10" placeholder="Gemini API Key" />
              <label className="flex flex-col items-center justify-center h-40 border-2 border-dashed border-white/10 rounded-2xl cursor-pointer hover:bg-white/5">
                <UploadCloud className="opacity-20 mb-2" />
                <span className="text-sm opacity-50">{file ? file.name : "Trascina il PDF"}</span>
                <input type="file" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
              </label>
              <button onClick={startAutoPilot} className="w-full py-4 bg-blue-600 rounded-xl font-bold">Analizza</button>
            </div>

            <div className="p-8 rounded-[2.5rem] bg-white/5 border border-white/10">
              <h3 className="text-xl font-bold flex items-center gap-2 mb-6"><History className="text-purple-500" /> Storia Recente</h3>
              <div className="space-y-4 max-h-80 overflow-y-auto pr-2">
                {history.length === 0 ? <p className="opacity-30 italic">Ancora nulla salvato...</p> : 
                  history.filter(h => h.type === 'summary').map((h, i) => (
                    <div key={i} className="p-4 rounded-xl bg-white/5 border border-white/5 hover:border-blue-500/50 cursor-pointer transition-all">
                      <div className="font-bold text-sm truncate">{h.chapter_title}</div>
                      <div className="text-[10px] opacity-40 uppercase tracking-widest mt-1">{h.pdf_name}</div>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {data?.chapters.map((cap: any, idx: number) => (
              <div key={idx} className="bg-white/5 rounded-3xl border border-white/10 overflow-hidden">
                <button onClick={() => setExpandedChapter(expandedChapter === idx ? null : idx)} className="w-full p-6 flex justify-between items-center">
                  <span className="font-bold">{cap.titolo}</span>
                  <ChevronDown className={expandedChapter === idx ? 'rotate-180' : ''} />
                </button>
                {expandedChapter === idx && (
                  <div className="p-8 pt-0 border-t border-white/10 prose prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{cap.testo}</ReactMarkdown>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
