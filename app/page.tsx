'use client';

import { useState, useEffect } from 'react';
import { UserButton, SignInButton, useUser } from '@clerk/nextjs';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BookOpen, UploadCloud, ChevronDown, FileText, Loader2, 
  Sparkles, BrainCircuit, History, ChevronLeft, ChevronRight, X 
} from 'lucide-react';
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
  const [loadingStatus, setLoadingStatus] = useState('');
  const [data, setData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [expandedChapter, setExpandedChapter] = useState<number | null>(0);
  
  const [activeTab, setActiveTab] = useState('riassunto');
  const [cardIndex, setCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState<Record<number, boolean>>({});
  const [generatingQA, setGeneratingQA] = useState<number | null>(null);

  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  useEffect(() => {
    if (isSignedIn) {
      fetch('/api/study').then(res => res.json()).then(dbData => setHistory(dbData));
      const savedKey = localStorage.getItem('study_buddy_api_key');
      if (savedKey) setApiKey(savedKey);
    }
  }, [isSignedIn]);

  const startAutoPilot = async () => {
    if (!file || !apiKey) return alert("Manca file o API Key!");
    setLoading(true);
    localStorage.setItem('study_buddy_api_key', apiKey);

    try {
      setLoadingStatus("Fase 1: Analisi dell'indice...");
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

        setLoadingStatus(`Analisi Dispensa: ${cap.titolo}`);

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
        
        chapters.push({ 
            titolo: cap.titolo, 
            testo: capData.riassunto, 
            pdfBlob: blob,
            flashcards: null,
            quiz: null 
        });
        
        setData({ chapters: [...chapters] });
        await new Promise(r => setTimeout(r, 4000));
      }
      setLoadingStatus("Finito!");
    } catch (e) { alert("Errore"); }
    setLoading(false);
  };

  const generateQAForChapter = async (index: number) => {
    const chapter = data.chapters[index];
    setGeneratingQA(index);

    try {
        const formData = new FormData();
        const chunkFile = new File([chapter.pdfBlob], `qa_${index}.pdf`, { type: 'application/pdf' });
        formData.append('file', chunkFile);
        formData.append('apiKey', apiKey);
        formData.append('action', 'generate_qa');
        formData.append('focus', chapter.titolo);
        formData.append('pdfName', file?.name || "Documento");

        const res = await fetch('/api/study', { method: 'POST', body: formData });
        const qaData = await res.json();

        const updatedChapters = [...data.chapters];
        updatedChapters[index].flashcards = qaData.flashcards;
        updatedChapters[index].quiz = qaData.quiz;
        
        setData({ ...data, chapters: updatedChapters });
    } catch (e) {
        alert("Errore nella generazione dei test.");
    }
    setGeneratingQA(null);
  };

  const RenderMarkdown = ({ content }: { content: string }) => (
    <div className="w-full text-left prose prose-invert max-w-none">
      <ReactMarkdown 
        remarkPlugins={[remarkGfm, remarkMath]} 
        rehypePlugins={[rehypeKatex]}
        components={{
          h2: ({node, ...props}) => <h2 className="text-2xl font-bold text-blue-400 mt-12 mb-6 border-l-4 border-blue-500 pl-4" {...props} />,
          h3: ({node, ...props}) => <h3 className="text-xl font-bold text-white mt-8 mb-4" {...props} />,
          p: ({node, ...props}) => <p className="text-lg leading-relaxed mb-6 text-gray-300 text-justify" {...props} />,
          strong: ({node, ...props}) => <strong className="font-bold text-white" {...props} />,
          blockquote: ({node, ...props}) => <blockquote className="border-l-2 border-gray-600 pl-6 my-8 text-gray-400 italic" {...props} />,
          ul: ({node, ...props}) => <ul className="space-y-2 mb-6 ml-4 list-disc text-lg text-gray-300" {...props} />,
          ol: ({node, ...props}) => <ol className="space-y-2 mb-6 ml-4 list-decimal text-lg text-gray-300" {...props} />,
          div: ({node, ...props}) => <div className="my-4 overflow-x-auto" {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );

  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-[#000000] text-white flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] rounded-full blur-[120px] opacity-30 bg-blue-600/40 pointer-events-none" />
        <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-[2rem] mb-8 flex items-center justify-center shadow-2xl shadow-blue-500/30 backdrop-blur-xl">
          <BookOpen className="text-white w-10 h-10" />
        </div>
        <h1 className="text-5xl font-extrabold mb-4 tracking-tighter lowercase">studdy<span className="text-blue-500">.</span></h1>
        <p className="text-gray-400 mb-10 max-w-sm text-lg font-medium">Il tuo archivio di studio intelligente, sincronizzato su ogni dispositivo.</p>
        <SignInButton mode="modal">
          <button className="px-10 py-4 bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/20 text-white font-bold rounded-[2rem] transition-all text-lg shadow-xl">Accedi per iniziare</button>
        </SignInButton>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000000] text-white font-sans pb-20 relative">
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] rounded-full blur-[120px] opacity-20 bg-indigo-600" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] rounded-full blur-[100px] opacity-20 bg-blue-500" />
      </div>

      <div className="relative z-10 w-full max-w-5xl mx-auto px-4 py-8 md:py-12">
        <header className="flex justify-between items-center mb-16">
          <div className="flex items-center gap-4">
            <motion.div whileHover={{ rotate: 10, scale: 1.05 }} className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
              <BookOpen className="text-white w-6 h-6" />
            </motion.div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tighter lowercase">studdy<span className="text-blue-500">.</span></h1>
          </div>
          <div className="flex items-center gap-4">
            <UserButton afterSignOutUrl="/" appearance={{ elements: { avatarBox: "w-10 h-10 rounded-full border-2 border-white/10" } }} />
          </div>
        </header>

        {loading && (
           <div className="mb-8 p-8 rounded-[2.5rem] bg-blue-600/10 border border-blue-500/20 flex flex-col items-center justify-center text-center space-y-4 backdrop-blur-xl">
              <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
              <p className="font-bold text-xl text-blue-500">{loadingStatus}</p>
           </div>
        )}

        {!data && !loading ? (
          <div className="grid md:grid-cols-2 gap-8">
            <div className="p-8 rounded-[2.5rem] bg-white/5 border border-white/10 backdrop-blur-2xl shadow-2xl space-y-6">
              <h3 className="text-2xl font-bold flex items-center gap-2 mb-2"><Sparkles className="text-blue-500" /> Nuova Analisi</h3>
              <input type="password" value={apiKey} onChange={e => {setApiKey(e.target.value); localStorage.setItem('study_buddy_api_key', e.target.value);}} className="w-full p-4 bg-black/40 rounded-2xl border border-white/10 outline-none focus:border-blue-500 transition-all text-white placeholder-gray-500" placeholder="Google Gemini API Key" />
              <label className="flex flex-col items-center justify-center h-40 border-2 border-dashed border-white/10 rounded-3xl cursor-pointer hover:bg-white/10 transition-colors bg-black/20">
                <UploadCloud className="w-10 h-10 opacity-40 mb-3 text-white" />
                <span className="text-sm font-medium text-gray-300">{file ? file.name : "Trascina o clicca per caricare il PDF"}</span>
                <input type="file" className="hidden" accept=".pdf" onChange={e => setFile(e.target.files?.[0] || null)} />
              </label>
              <button onClick={startAutoPilot} className="w-full py-4 bg-blue-600 hover:bg-blue-500 transition-colors rounded-2xl font-bold text-lg shadow-lg shadow-blue-600/20">Analizza Documento</button>
            </div>

            <div className="p-8 rounded-[2.5rem] bg-white/5 border border-white/10 backdrop-blur-2xl shadow-2xl flex flex-col">
              <h3 className="text-2xl font-bold flex items-center gap-2 mb-6"><History className="text-indigo-400" /> Archivio Studi</h3>
              <div className="space-y-3 overflow-y-auto flex-1 pr-2 custom-scrollbar">
                {history.length === 0 ? <div className="flex items-center justify-center h-full opacity-40 italic">Nessun documento salvato.</div> : 
                  history.filter(h => h.type === 'summary').map((h, i) => (
                    <div key={i} className="p-5 rounded-2xl bg-black/40 border border-white/5 hover:border-indigo-500/50 hover:bg-white/10 cursor-pointer transition-all group">
                      <div className="font-bold text-white group-hover:text-indigo-300 transition-colors line-clamp-1">{h.chapter_title}</div>
                      <div className="text-xs opacity-50 uppercase tracking-widest mt-2">{h.pdf_name}</div>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>
        ) : data && (
          <div className="max-w-4xl mx-auto space-y-6">
             {data.chapters.map((cap: any, idx: number) => (
                <div key={idx} className="rounded-[2.5rem] border border-white/10 bg-white/5 overflow-hidden backdrop-blur-2xl shadow-xl">
                    <button onClick={() => setExpandedChapter(expandedChapter === idx ? null : idx)} className="w-full p-6 md:p-8 flex justify-between items-center text-left hover:bg-white/10 transition-colors">
                        <span className="text-xl md:text-2xl font-bold flex items-center gap-4">
                            <span className="flex items-center justify-center w-12 h-12 rounded-full bg-blue-500/20 text-blue-400 text-lg shadow-inner">{idx + 1}</span>
                            {cap.titolo}
                        </span>
                        <ChevronDown className={`w-6 h-6 text-gray-400 transition-transform duration-300 ${expandedChapter === idx ? 'rotate-180' : ''}`} />
                    </button>
                    
                    <AnimatePresence>
                        {expandedChapter === idx && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-6 md:px-10 pb-10">
                                <div className="border-t border-white/10 pt-8">
                                    <RenderMarkdown content={cap.testo} />
                                    
                                    <div className="mt-16 p-8 md:p-10 rounded-[2.5rem] bg-gradient-to-br from-indigo-900/40 to-blue-900/40 border border-indigo-500/30 flex flex-col items-center text-center space-y-6 shadow-2xl relative overflow-hidden">
                                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
                                        <div className="relative z-10 w-20 h-20 rounded-3xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-inner backdrop-blur-md"><BrainCircuit className="w-10 h-10" /></div>
                                        <div className="relative z-10">
                                            <h4 className="text-2xl font-extrabold mb-2 text-white">Area Ripasso Interattiva</h4>
                                            <p className="text-indigo-200/70 font-medium">10 Flashcards + Test Universitario</p>
                                        </div>
                                        
                                        {!cap.quiz ? (
                                            <button 
                                                disabled={generatingQA === idx}
                                                onClick={() => generateQAForChapter(idx)}
                                                className="relative z-10 px-8 py-4 bg-indigo-600 hover:bg-indigo-500 rounded-full font-bold flex items-center gap-3 transition-all disabled:opacity-50 shadow-[0_0_30px_rgba(79,70,229,0.4)]"
                                            >
                                                {generatingQA === idx ? <Loader2 className="animate-spin w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
                                                Genera Materiale di Studio
                                            </button>
                                        ) : (
                                            <div className="relative z-10 flex flex-wrap justify-center gap-4 w-full mt-4">
                                                <button onClick={() => { setData({...data, activeQA: {idx, type: 'flashcards'}}); setActiveTab('qa'); }} className="px-8 py-4 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-full font-bold transition-all shadow-lg backdrop-blur-md">Studia Flashcards</button>
                                                <button onClick={() => { setData({...data, activeQA: {idx, type: 'quiz'}}); setActiveTab('qa'); }} className="px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-full font-bold transition-all shadow-[0_0_30px_rgba(37,99,235,0.4)]">Inizia Simulazione</button>
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

        {/* MODALE Q&A (FLASHCARDS E QUIZ) - Stile iOS 26 ripristinato */}
        <AnimatePresence>
            {activeTab === 'qa' && data.activeQA && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-2xl" onClick={() => setActiveTab('riassunto')} />
                    <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-zinc-900/80 backdrop-blur-3xl rounded-[3rem] border border-white/10 flex flex-col shadow-2xl custom-scrollbar">
                        <div className="sticky top-0 p-6 md:p-8 border-b border-white/10 flex justify-between items-center bg-zinc-900/80 backdrop-blur-xl z-20">
                            <h2 className="text-2xl font-extrabold text-white">{data.activeQA.type === 'flashcards' ? 'Flashcards Interattive' : 'Simulazione d\'Esame'}</h2>
                            <button onClick={() => setActiveTab('riassunto')} className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"><X className="w-6 h-6" /></button>
                        </div>
                        
                        <div className="p-6 md:p-10">
                            {data.activeQA.type === 'flashcards' ? (
                                <div className="flex flex-col items-center">
                                    <div onClick={() => setIsFlipped(!isFlipped)} className="w-full max-w-xl h-96 relative cursor-pointer perspective-2000 group">
                                        <motion.div animate={{ rotateY: isFlipped ? 180 : 0 }} transition={{ type: "spring", stiffness: 100, damping: 20 }} className="w-full h-full preserve-3d">
                                            {/* Fronte Carta */}
                                            <div className="absolute inset-0 backface-hidden bg-white/5 border border-white/10 rounded-[3rem] p-10 flex flex-col justify-center items-center text-center shadow-2xl group-hover:bg-white/10 transition-colors">
                                                <span className="text-sm text-blue-400 font-black uppercase tracking-widest mb-6">Fronte - Domanda</span>
                                                <div className="text-2xl font-bold text-white"><RenderMarkdown content={data.chapters[data.activeQA.idx].flashcards[cardIndex].domanda} /></div>
                                            </div>
                                            {/* Retro Carta */}
                                            <div className="absolute inset-0 backface-hidden rotate-y-180 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[3rem] p-10 flex flex-col justify-center items-center text-center shadow-2xl border border-blue-400/30 overflow-y-auto custom-scrollbar">
                                                <span className="text-sm text-white/60 font-black uppercase tracking-widest mb-6 mt-auto">Retro - Risposta</span>
                                                <div className="text-xl font-medium text-white mb-auto"><RenderMarkdown content={data.chapters[data.activeQA.idx].flashcards[cardIndex].risposta} /></div>
                                            </div>
                                        </motion.div>
                                    </div>
                                    <div className="flex items-center gap-6 mt-10">
                                        <button onClick={() => {setCardIndex(Math.max(0, cardIndex - 1)); setIsFlipped(false)}} className="p-4 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"><ChevronLeft className="w-6 h-6" /></button>
                                        <span className="font-mono font-bold text-xl text-white px-4 bg-white/5 py-2 rounded-xl">{cardIndex + 1} / 10</span>
                                        <button onClick={() => {setCardIndex(Math.min(9, cardIndex + 1)); setIsFlipped(false)}} className="p-4 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"><ChevronRight className="w-6 h-6" /></button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-8">
                                    {data.chapters[data.activeQA.idx].quiz.map((q: any, i: number) => (
                                        <div key={i} className="p-8 bg-black/40 border border-white/10 rounded-[2.5rem] space-y-6 shadow-lg">
                                            <div className="text-xl font-bold flex gap-4 text-white">
                                              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 text-sm flex-shrink-0">{i+1}</span>
                                              <RenderMarkdown content={q.domanda} />
                                            </div>
                                            <div className="grid gap-4">
                                                {q.opzioni.map((opt: string, oi: number) => {
                                                    const qKey = `${data.activeQA.idx}-${i}`;
                                                    const isSelected = quizAnswers[qKey] === oi;
                                                    const submitted = quizSubmitted[data.activeQA.idx];
                                                    let btnClass = isSelected ? 'bg-blue-600/20 border-blue-500 text-white' : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:border-white/20';
                                                    if (submitted) {
                                                        if (oi === q.corretta) btnClass = 'bg-green-500/20 border-green-500 text-green-300';
                                                        else if (isSelected) btnClass = 'bg-red-500/20 border-red-500 text-red-300';
                                                        else btnClass = 'bg-white/5 border-white/10 opacity-50';
                                                    }
                                                    return (
                                                        <button key={oi} onClick={() => !submitted && setQuizAnswers({...quizAnswers, [qKey]: oi})} className={`w-full p-5 rounded-2xl text-left border transition-all duration-300 ${btnClass}`}>
                                                          <RenderMarkdown content={opt} />
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            {quizSubmitted[data.activeQA.idx] && (
                                              <div className="p-6 bg-blue-900/30 border border-blue-500/30 rounded-2xl mt-4">
                                                <strong className="text-blue-400 mb-2 block uppercase text-xs tracking-widest">Spiegazione</strong>
                                                <RenderMarkdown content={q.spiegazione} />
                                              </div>
                                            )}
                                        </div>
                                    ))}
                                    {!quizSubmitted[data.activeQA.idx] && (
                                      <button onClick={() => setQuizSubmitted({...quizSubmitted, [data.activeQA.idx]: true})} className="w-full py-5 mt-10 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 rounded-[2rem] text-white font-extrabold text-xl shadow-[0_0_40px_rgba(16,185,129,0.3)] transition-all">
                                        Consegna ed Esamina Risultati
                                      </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>

      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .perspective-2000 { perspective: 2000px; }
        .preserve-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
        .prose p { margin-bottom: 0 !important; margin-top: 0 !important; }
        .custom-scrollbar::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.02); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.2); }
      `}} />
    </div>
  );
}
