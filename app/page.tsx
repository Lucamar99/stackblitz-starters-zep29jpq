'use client';

import { useState, useEffect } from 'react';
import { UserButton, SignInButton, useUser } from '@clerk/nextjs';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BookOpen, UploadCloud, ChevronDown, FileText, Loader2, 
  Sparkles, BrainCircuit, History, ChevronLeft, ChevronRight, X, CheckCircle, XCircle
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { PDFDocument } from 'pdf-lib';
import 'katex/dist/katex.min.css';

export default function Home() {
  const { isSignedIn } = useUser();
  const [apiKey, setApiKey] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [chapters, setChapters] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [expandedChapter, setExpandedChapter] = useState<number | null>(0);
  
  const [activeQA, setActiveQA] = useState<any>(null); // Per gestire il modale Q&A
  const [cardIndex, setCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState<Record<number, boolean>>({});
  const [generatingQA, setGeneratingQA] = useState<number | null>(null);

  useEffect(() => {
    if (isSignedIn) {
      loadHistory();
      const savedKey = localStorage.getItem('study_buddy_api_key');
      if (savedKey) setApiKey(savedKey);
    }
  }, [isSignedIn]);

  const loadHistory = async () => {
    const res = await fetch('/api/study');
    const data = await res.json();
    setHistory(data);
  };

  const startAutoPilot = async () => {
    if (!file || !apiKey) return alert("Configura tutto!");
    setLoading(true);
    setChapters([]);
    localStorage.setItem('study_buddy_api_key', apiKey);

    try {
      setLoadingStatus("Analisi Indice...");
      const form = new FormData();
      form.append('file', file);
      form.append('apiKey', apiKey);
      form.append('action', 'outline');

      const outlineRes = await fetch('/api/study', { method: 'POST', body: form });
      const outline = await outlineRes.json();
      
      const fileBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(fileBuffer);

      let currentChapters = [];
      for (let i = 0; i < outline.capitoli.length; i++) {
        const cap = outline.capitoli[i];
        setLoadingStatus(`Generazione Dispensa: ${cap.titolo}`);

        // Estrazione pagina (semplificata per brevità)
        const newPdf = await PDFDocument.create();
        const [page] = await newPdf.copyPages(pdfDoc, [Math.max(0, cap.paginaInizio - 1)]);
        newPdf.addPage(page);
        const blob = new Blob([await newPdf.save()], {type: 'application/pdf'});

        const formData = new FormData();
        formData.append('file', new File([blob], 'cap.pdf'));
        formData.append('apiKey', apiKey);
        formData.append('action', 'chapter');
        formData.append('focus', cap.titolo);
        formData.append('pdfName', file.name);

        const capRes = await fetch('/api/study', { method: 'POST', body: formData });
        const capData = await capRes.json();
        
        const newCap = { ...cap, testo: capData.riassunto, pdfBlob: blob, flashcards: null, quiz: null };
        currentChapters.push(newCap);
        setChapters([...currentChapters]);
        
        await new Promise(r => setTimeout(r, 3000));
      }
      loadHistory(); // Aggiorna la storia dopo il salvataggio
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const generateQA = async (idx: number) => {
    setGeneratingQA(idx);
    try {
      const cap = chapters[idx];
      const formData = new FormData();
      formData.append('file', new File([cap.pdfBlob], 'qa.pdf'));
      formData.append('apiKey', apiKey);
      formData.append('action', 'generate_qa');
      formData.append('focus', cap.titolo);
      formData.append('pdfName', file?.name || "Doc");

      const res = await fetch('/api/study', { method: 'POST', body: formData });
      const qa = await res.json();
      
      const newChapters = [...chapters];
      newChapters[idx].flashcards = qa.flashcards;
      newChapters[idx].quiz = qa.quiz;
      setChapters(newChapters);
      loadHistory();
    } catch (e) { alert("Errore Q&A"); }
    setGeneratingQA(null);
  };

  const RenderMarkdown = ({ content }: { content: string }) => (
    <div className="prose prose-invert max-w-none text-gray-300">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {content}
      </ReactMarkdown>
    </div>
  );

  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-24 h-24 bg-blue-600 rounded-[2.5rem] mb-8 flex items-center justify-center shadow-2xl shadow-blue-500/40">
          <BookOpen className="w-12 h-12" />
        </motion.div>
        <h1 className="text-6xl font-black tracking-tighter mb-4">studdy<span className="text-blue-500">.</span></h1>
        <SignInButton mode="modal">
          <button className="px-12 py-4 bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/20 rounded-full font-bold transition-all shadow-xl">Entra nel Futuro</button>
        </SignInButton>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-12 relative overflow-x-hidden">
      {/* Sfondo Nebulosa iOS 26 */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[80vw] h-[80vw] bg-blue-600/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] bg-indigo-600/20 blur-[100px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-16">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg"><BookOpen /></div>
            <h1 className="text-4xl font-black tracking-tighter">studdy.</h1>
          </div>
          <UserButton />
        </header>

        {loading && (
          <div className="mb-12 p-10 rounded-[3rem] bg-blue-500/10 border border-blue-500/20 backdrop-blur-3xl text-center">
            <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-500" />
            <h2 className="text-2xl font-bold text-blue-400">{loadingStatus}</h2>
          </div>
        )}

        {!loading && chapters.length === 0 ? (
          <div className="grid md:grid-cols-2 gap-8">
            {/* Box Caricamento */}
            <div className="p-10 rounded-[3rem] bg-white/5 border border-white/10 backdrop-blur-3xl shadow-2xl space-y-6">
              <h3 className="text-2xl font-bold flex items-center gap-3"><Sparkles className="text-blue-500" /> Carica Documento</h3>
              <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} className="w-full p-4 bg-black/40 rounded-2xl border border-white/10 outline-none focus:border-blue-500" placeholder="Gemini API Key" />
              <label className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-white/10 rounded-[2rem] cursor-pointer hover:bg-white/5 transition-all">
                <UploadCloud className="w-12 h-12 opacity-30 mb-4" />
                <span className="text-sm opacity-50">{file ? file.name : "Seleziona PDF"}</span>
                <input type="file" className="hidden" accept=".pdf" onChange={e => setFile(e.target.files?.[0] || null)} />
              </label>
              <button onClick={startAutoPilot} className="w-full py-5 bg-blue-600 hover:bg-blue-500 rounded-2xl font-black text-xl shadow-lg shadow-blue-600/20">Analizza Ora</button>
            </div>

            {/* Box Storia */}
            <div className="p-10 rounded-[3rem] bg-white/5 border border-white/10 backdrop-blur-3xl shadow-2xl flex flex-col">
              <h3 className="text-2xl font-bold flex items-center gap-3 mb-6"><History className="text-indigo-400" /> I Tuoi Studi</h3>
              <div className="space-y-4 overflow-y-auto max-h-[400px] pr-2">
                {history.length === 0 ? <p className="opacity-30 italic">L'archivio è vuoto.</p> : 
                  history.filter(h => h.type === 'summary').map((h, i) => (
                    <div key={i} className="p-5 bg-white/5 rounded-2xl border border-white/5 hover:border-blue-500/30 transition-all cursor-pointer">
                      <div className="font-bold">{h.chapter_title}</div>
                      <div className="text-[10px] opacity-40 uppercase mt-1 tracking-tighter">{h.pdf_name}</div>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6 max-w-4xl mx-auto">
            {chapters.map((cap, idx) => (
              <div key={idx} className="bg-white/5 border border-white/10 rounded-[2.5rem] backdrop-blur-2xl overflow-hidden shadow-xl">
                <button onClick={() => setExpandedChapter(expandedChapter === idx ? null : idx)} className="w-full p-8 flex justify-between items-center text-left hover:bg-white/5 transition-all">
                  <span className="text-2xl font-bold flex items-center gap-4">
                    <span className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 text-sm">{idx + 1}</span>
                    {cap.titolo}
                  </span>
                  <ChevronDown className={`transition-transform duration-500 ${expandedChapter === idx ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {expandedChapter === idx && (
                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="px-8 pb-10">
                      <div className="border-t border-white/10 pt-8">
                        <RenderMarkdown content={cap.testo} />
                        
                        <div className="mt-12 p-8 rounded-[2rem] bg-gradient-to-br from-blue-600/20 to-indigo-600/20 border border-blue-500/30 flex flex-col items-center text-center space-y-6 shadow-inner">
                          <BrainCircuit className="w-12 h-12 text-blue-400" />
                          <h4 className="text-xl font-bold">Verifica la tua preparazione</h4>
                          {!cap.quiz ? (
                            <button disabled={generatingQA === idx} onClick={() => generateQA(idx)} className="px-8 py-4 bg-blue-600 rounded-full font-bold flex items-center gap-2">
                              {generatingQA === idx ? <Loader2 className="animate-spin" /> : <Sparkles />} Genera Test
                            </button>
                          ) : (
                            <div className="flex gap-4">
                              <button onClick={() => { setActiveQA({idx, type: 'flashcards'}); setCardIndex(0); }} className="px-6 py-3 bg-white text-black rounded-full font-bold">Flashcards</button>
                              <button onClick={() => { setActiveQA({idx, type: 'quiz'}); }} className="px-6 py-3 bg-blue-600 text-white rounded-full font-bold">Test</button>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MODALE Q&A - iOS 26 GLASS STYLE */}
      <AnimatePresence>
        {activeQA && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-2xl" onClick={() => setActiveQA(null)} />
            <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }} className="relative w-full max-w-4xl max-h-[85vh] overflow-y-auto bg-zinc-900/80 backdrop-blur-3xl rounded-[3rem] border border-white/10 p-8 shadow-2xl">
              <div className="flex justify-between items-center mb-10">
                <h2 className="text-3xl font-black">{activeQA.type === 'flashcards' ? 'Flashcards' : 'Test Universitario'}</h2>
                <button onClick={() => setActiveQA(null)} className="p-3 bg-white/10 rounded-full"><X /></button>
              </div>

              {activeQA.type === 'flashcards' ? (
                <div className="flex flex-col items-center">
                  <div onClick={() => setIsFlipped(!isFlipped)} className="w-full max-w-lg h-96 relative cursor-pointer group [perspective:2000px]">
                    <motion.div animate={{ rotateY: isFlipped ? 180 : 0 }} transition={{ type: "spring", stiffness: 100 }} className="w-full h-full [transform-style:preserve-3d] duration-500">
                      <div className="absolute inset-0 [backface-visibility:hidden] bg-white/5 border border-white/10 rounded-[3rem] p-12 flex flex-col justify-center items-center text-center">
                        <span className="text-blue-400 font-black text-xs uppercase tracking-widest mb-4">Domanda</span>
                        <div className="text-2xl font-bold"><RenderMarkdown content={chapters[activeQA.idx].flashcards[cardIndex].domanda} /></div>
                      </div>
                      <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] bg-blue-600 rounded-[3rem] p-12 flex flex-col justify-center items-center text-center">
                        <span className="text-white/60 font-black text-xs uppercase tracking-widest mb-4">Risposta</span>
                        <div className="text-xl font-medium text-white"><RenderMarkdown content={chapters[activeQA.idx].flashcards[cardIndex].risposta} /></div>
                      </div>
                    </motion.div>
                  </div>
                  <div className="flex gap-8 mt-10 items-center">
                    <button onClick={() => { setCardIndex(Math.max(0, cardIndex - 1)); setIsFlipped(false); }} className="p-4 bg-white/5 rounded-full"><ChevronLeft /></button>
                    <span className="font-mono text-xl font-bold">{cardIndex + 1} / 10</span>
                    <button onClick={() => { setCardIndex(Math.min(9, cardIndex + 1)); setIsFlipped(false); }} className="p-4 bg-white/5 rounded-full"><ChevronRight /></button>
                  </div>
                </div>
              ) : (
                <div className="space-y-10">
                  {chapters[activeQA.idx].quiz.map((q: any, i: number) => (
                    <div key={i} className="p-8 bg-white/5 border border-white/5 rounded-[2.5rem] space-y-6">
                      <h4 className="text-xl font-bold flex gap-4"><span className="text-blue-500">{i+1}.</span> <RenderMarkdown content={q.domanda} /></h4>
                      <div className="grid gap-3">
                        {q.opzioni.map((opt: string, oi: number) => {
                          const qKey = `${activeQA.idx}-${i}`;
                          const isSelected = quizAnswers[qKey] === oi;
                          const submitted = quizSubmitted[activeQA.idx];
                          let btnStyle = "bg-white/5 border-white/10";
                          if (isSelected) btnStyle = "bg-blue-600/20 border-blue-500";
                          if (submitted) {
                            if (oi === q.corretta) btnStyle = "bg-green-500/20 border-green-500 text-green-300";
                            else if (isSelected) btnStyle = "bg-red-500/20 border-red-500 text-red-300";
                          }
                          return (
                            <button key={oi} onClick={() => !submitted && setQuizAnswers({...quizAnswers, [qKey]: oi})} className={`w-full p-5 rounded-2xl border text-left transition-all ${btnStyle}`}><RenderMarkdown content={opt} /></button>
                          );
                        })}
                      </div>
                      {quizSubmitted[activeQA.idx] && <div className="p-5 bg-blue-500/10 rounded-2xl text-sm italic border border-blue-500/20"><RenderMarkdown content={q.spiegazione} /></div>}
                    </div>
                  ))}
                  {!quizSubmitted[activeQA.idx] && <button onClick={() => setQuizSubmitted({...quizSubmitted, [activeQA.idx]: true})} className="w-full py-5 bg-green-600 rounded-[2rem] font-black text-xl shadow-xl shadow-green-600/20">Verifica Risposte</button>}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
