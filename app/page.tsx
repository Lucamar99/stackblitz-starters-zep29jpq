'use client';

import { useState, useEffect, useRef } from 'react';
import { UserButton, SignInButton, useUser } from '@clerk/nextjs';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BookOpen, UploadCloud, ChevronDown, FileText, Loader2, 
  Sparkles, BrainCircuit, History, ChevronLeft, ChevronRight, X, Download, Trash2, Layers, ZoomIn, ZoomOut,
  MessageCircle, Send
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { PDFDocument } from 'pdf-lib';

import 'katex/dist/katex.min.css';
// Importo lo stile nativo per rendere il testo del PDF selezionabile e allineato correttamente
import 'react-pdf/dist/Page/TextLayer.css'; 

import dynamic from 'next/dynamic';
const Document = dynamic(() => import('react-pdf').then((mod) => mod.Document), { ssr: false });
const Page = dynamic(() => import('react-pdf').then((mod) => mod.Page), { ssr: false });

const RenderMarkdown = ({ content }: { content: string }) => {
  if (!content) return <span className="text-gray-500 italic">Testo mancante...</span>;
  return (
    <div className="prose prose-invert max-w-none text-gray-200">
      <ReactMarkdown 
        remarkPlugins={[remarkGfm, remarkMath]} 
        rehypePlugins={[rehypeKatex]}
        components={{
          h2: ({node, ...props}) => <h2 className="text-2xl font-bold text-blue-300 mt-12 mb-6 border-l-4 border-blue-400/50 pl-4" {...props} />,
          h3: ({node, ...props}) => <h3 className="text-xl font-bold text-white mt-8 mb-4" {...props} />,
          p: ({node, ...props}) => <p className="text-lg leading-relaxed mb-6 text-white/80 text-justify font-light" {...props} />,
          strong: ({node, ...props}) => <strong className="font-bold text-white" {...props} />,
          blockquote: ({node, ...props}) => <blockquote className="border-l-2 border-white/30 pl-6 my-8 text-white/60 italic bg-white/5 py-3 pr-4 rounded-r-2xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]" {...props} />,
          ul: ({node, ...props}) => <ul className="space-y-2 mb-6 ml-4 list-disc text-lg text-white/80 font-light" {...props} />,
          ol: ({node, ...props}) => <ol className="space-y-2 mb-6 ml-4 list-decimal text-lg text-white/80 font-light" {...props} />,
          div: ({node, ...props}) => <div className="my-4 overflow-x-auto custom-scrollbar" {...props} />,
        }}
      >
        {String(content)}
      </ReactMarkdown>
    </div>
  );
};

export default function Home() {
  const { isSignedIn } = useUser();
  const [apiKey, setApiKey] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [chapters, setChapters] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [expandedChapter, setExpandedChapter] = useState<number | null>(0);
  
  const [activeQA, setActiveQA] = useState<any>(null); 
  const [cardIndex, setCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState<Record<number, boolean>>({});
  const [generatingQA, setGeneratingQA] = useState<number | null>(null);

  const [showPdfModal, setShowPdfModal] = useState(false);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pdfScale, setPdfScale] = useState(1); 
  
  const [viewerWidth, setViewerWidth] = useState(0);
  const [inlineViewerWidth, setInlineViewerWidth] = useState(0);

  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{role: 'user'|'model', text: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // NUOVO: Stato per gestire il testo selezionato
  const [selectedText, setSelectedText] = useState('');

  // NUOVO: Ascoltatore globale per la selezione del testo
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      const text = selection?.toString().trim();
      if (text && text.length > 0) {
        setSelectedText(text);
      } else {
        setSelectedText('');
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, []);

  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [chatMessages, isChatLoading]);

  useEffect(() => {
    document.documentElement.classList.add('dark');
    import('react-pdf').then(({ pdfjs }) => {
      pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    });
  }, []);

  useEffect(() => {
    if (isSignedIn) {
      loadHistory();
      const savedKey = localStorage.getItem('study_buddy_api_key');
      if (savedKey) setApiKey(savedKey);
    }
  }, [isSignedIn]);

  useEffect(() => {
    setPdfScale(1);
  }, [pdfUrl]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const updateWidths = () => {
        setViewerWidth(window.innerWidth - 48);
        if (window.innerWidth >= 1280) {
          const container = Math.min(window.innerWidth, 1400); 
          setInlineViewerWidth((container - 64) * 0.45); 
        } else if (window.innerWidth >= 1024) {
          const container = Math.min(window.innerWidth, 1400);
          setInlineViewerWidth((container - 64) * 0.5); 
        }
      };
      updateWidths();
      window.addEventListener('resize', updateWidths);
      return () => window.removeEventListener('resize', updateWidths);
    }
  }, [chapters, pdfUrl]);

  const loadHistory = async () => {
    try {
      const res = await fetch('/api/study');
      const data = await res.json();
      setHistory(Array.isArray(data) ? data : []);
    } catch (e) {
      setHistory([]);
    }
  };

  const loadFromHistory = async (pdfName: string) => {
    const fileChapters = history
        .filter(h => h.type === 'summary' && h.pdf_name === pdfName)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    if (fileChapters.length === 0) return;

    const savedUrl = fileChapters[0].pdf_url;
    if (savedUrl) {
      setPdfUrl(savedUrl);
      try {
        const response = await fetch(savedUrl);
        const blob = await response.blob();
        setFile(new File([blob], pdfName, { type: "application/pdf" }));
      } catch (e) {
        console.error("Impossibile recuperare il file PDF originale.");
      }
    }

    const loadedChapters = fileChapters.map(historicalChapter => {
      const associatedQA = history.find(item => 
        item.type === 'qa' && 
        item.chapter_title === historicalChapter.chapter_title && 
        item.pdf_name === historicalChapter.pdf_name
      );

      let parsedFlashcards = null;
      let parsedQuiz = null;

      if (associatedQA && associatedQA.content) {
        try {
          const parsed = JSON.parse(associatedQA.content);
          parsedFlashcards = parsed.flashcards;
          parsedQuiz = parsed.quiz;
        } catch (e) {}
      }

      return {
        titolo: historicalChapter.chapter_title,
        testo: historicalChapter.content,
        pdfBlob: null, 
        flashcards: parsedFlashcards,
        quiz: parsedQuiz
      };
    });

    setChapters(loadedChapters);
    setExpandedChapter(0);
  };

  const startAutoPilot = async () => {
    if (!file || !apiKey) return alert("Configura API Key e carica il PDF!");
    
    setLoading(true);
    setChapters([]);
    setPdfUrl(URL.createObjectURL(file));
    localStorage.setItem('study_buddy_api_key', apiKey);

    try {
      setLoadingStatus("Fase 1: Analisi dell'indice...");
      const form = new FormData();
      form.append('file', file);
      form.append('apiKey', apiKey);
      form.append('action', 'outline');
      form.append('pdfName', file.name);

      const outlineRes = await fetch('/api/study', { method: 'POST', body: form });
      
      if (!outlineRes.ok) {
        if (outlineRes.status === 413) throw new Error("Il PDF supera il limite di 4.5MB. Comprimilo con iLovePDF e riprova!");
        throw new Error("Errore di connessione al server.");
      }

      const outlineData = await outlineRes.json();
      
      if (outlineData.error) throw new Error(outlineData.error);
      if (!outlineData.capitoli || !Array.isArray(outlineData.capitoli)) {
        throw new Error("Formato indice non valido.");
      }

      const currentPdfUrl = outlineData.savedPdfUrl;
      if (currentPdfUrl) setPdfUrl(currentPdfUrl);

      const fileBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(fileBuffer);
      const totalPages = pdfDoc.getPageCount();

      let currentChapters = [];
      for (let i = 0; i < outlineData.capitoli.length; i++) {
        const cap = outlineData.capitoli[i];
        const nextCap = outlineData.capitoli[i+1];
        setLoadingStatus(`Fase 2: Dispensa - ${cap.titolo}`);

        let start = Math.max(0, parseInt(cap.paginaInizio) - 1);
        let end = nextCap ? parseInt(nextCap.paginaInizio) - 2 : totalPages - 1;
        if (isNaN(end) || end < start) end = totalPages - 1;

        const newPdf = await PDFDocument.create();
        const pages = await newPdf.copyPages(pdfDoc, Array.from({length: end - start + 1}, (_, k) => start + k));
        pages.forEach(p => newPdf.addPage(p));
        const blob = new Blob([await newPdf.save()], {type: 'application/pdf'});

        const formData = new FormData();
        formData.append('file', new File([blob], 'cap.pdf'));
        formData.append('apiKey', apiKey);
        formData.append('action', 'chapter');
        formData.append('focus', cap.titolo);
        formData.append('pdfName', file.name);
        if (currentPdfUrl) formData.append('pdfUrl', currentPdfUrl);

        const capRes = await fetch('/api/study', { method: 'POST', body: formData });
        
        if (!capRes.ok) {
           throw new Error(capRes.status === 413 ? "Un capitolo è troppo pesante (limite 4.5MB)." : "Errore durante l'elaborazione del capitolo.");
        }

        const capData = await capRes.json();
        
        currentChapters.push({ 
          ...cap, 
          testo: capData.riassunto || `Errore: ${capData.error || "Contenuto non disponibile"}`, 
          pdfBlob: blob, 
          flashcards: null, 
          quiz: null 
        });
        
        setChapters([...currentChapters]);
        await new Promise(r => setTimeout(r, 3500));
      }
      loadHistory();
    } catch (e: any) { 
      alert("ATTENZIONE: " + e.message); 
      setChapters([]); 
    }
    setLoading(false);
  };

  const generateQA = async (idx: number) => {
    if (!file) return alert("File non disponibile per generare i test.");
    const cap = chapters[idx];
    setGeneratingQA(idx);

    try {
      let blobToUse = cap.pdfBlob;
      if (!blobToUse) blobToUse = file;

      const formData = new FormData();
      formData.append('file', blobToUse);
      formData.append('apiKey', apiKey);
      formData.append('action', 'generate_qa');
      formData.append('focus', cap.titolo);
      formData.append('pdfName', file.name);
      if (pdfUrl) formData.append('pdfUrl', pdfUrl);

      const res = await fetch('/api/study', { method: 'POST', body: formData });
      
      if (!res.ok) {
         if (res.status === 413) throw new Error("Il file è troppo grande per generare i test (limite 4.5MB).");
         throw new Error("Errore di connessione al server.");
      }

      const qa = await res.json();
      
      if (qa.error || !qa.flashcards || !qa.quiz) {
         alert("L'IA ha fallito la formattazione. Riprova.");
         setGeneratingQA(null);
         return;
      }

      const newChapters = [...chapters];
      newChapters[idx].flashcards = qa.flashcards;
      newChapters[idx].quiz = qa.quiz;
      setChapters(newChapters);
      loadHistory();
    } catch (e: any) { alert(e.message || "Errore di connessione durante la generazione dei test."); }
    setGeneratingQA(null);
  };

  const deletePdf = async (pdfName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Vuoi eliminare definitivamente "${pdfName}"?`)) return;
    try {
      await fetch(`/api/study?pdfName=${encodeURIComponent(pdfName)}`, { method: 'DELETE' });
      loadHistory();
      setChapters([]);
    } catch (err) {
      alert("Errore durante l'eliminazione.");
    }
  };

  const sendChatMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || !apiKey) {
      if (!apiKey) alert("Inserisci prima l'API Key nella schermata principale.");
      return;
    }

    const newMessages = [...chatMessages, { role: 'user' as const, text: chatInput }];
    setChatMessages(newMessages);
    setChatInput('');
    setIsChatLoading(true);

    let currentContext = "";
    if (chapters.length > 0) {
      if (expandedChapter !== null && chapters[expandedChapter]) {
        currentContext = `L'utente sta studiando il capitolo intitolato: "${chapters[expandedChapter].titolo}".\nEcco il testo del capitolo a sua disposizione:\n\n${chapters[expandedChapter].testo}`;
      } else {
        currentContext = `L'utente ha aperto un documento con questi capitoli: ${chapters.map(c => c.titolo).join(', ')}. Attualmente ha la visuale generale dell'indice.`;
      }
    }

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, apiKey, context: currentContext })
      });
      const data = await res.json();
      
      if (data.error) throw new Error(data.error);
      
      setChatMessages([...newMessages, { role: 'model', text: data.reply }]);
    } catch (err: any) {
      const rawError = err.message || "";
      let friendlyError = "Scusa, si è verificato un errore imprevisto. 🔧";
      
      if (rawError.includes("503") || rawError.includes("high demand") || rawError.includes("overloaded")) {
         friendlyError = "I miei server sono temporaneamente sovraccarichi per la troppa affluenza! ⏳ Riprova tra un minuto, sarò pronto ad aiutarti.";
      } else if (rawError.includes("API Key") || rawError.includes("401")) {
         friendlyError = "Sembra ci sia un problema con la tua API Key di Google. Sicuro sia corretta? 🔑";
      }

      setChatMessages([...newMessages, { role: 'model', text: friendlyError }]);
    }
    setIsChatLoading(false);
  };

  // NUOVO: Funzione per gestire il click sul bottone "Spiega Testo"
  const handleAskAboutSelection = () => {
    setChatInput(`Spiegami in modo dettagliato questo passaggio:\n\n"${selectedText}"`);
    setChatOpen(true);
    setSelectedText('');
    window.getSelection()?.removeAllRanges(); // Deseleziona il testo dopo averlo catturato
  };

  const groupedHistory = history.reduce((acc: any, curr: any) => {
    if (curr.type === 'summary') {
      if (!acc[curr.pdf_name]) acc[curr.pdf_name] = [];
      acc[curr.pdf_name].push(curr);
    }
    return acc;
  }, {});

  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-[#050508] text-white flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
           <div className="absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] bg-blue-600/30 blur-[140px] rounded-full mix-blend-screen" />
           <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] bg-purple-600/20 blur-[140px] rounded-full mix-blend-screen" />
        </div>

        <div className="relative z-10 w-24 h-24 bg-white/5 backdrop-blur-[40px] border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] rounded-3xl mb-8 flex items-center justify-center">
          <BookOpen className="text-white w-10 h-10 drop-shadow-[0_2px_10px_rgba(255,255,255,0.5)]" />
        </div>
        <h1 className="relative z-10 text-5xl font-extrabold mb-4 tracking-tighter lowercase drop-shadow-lg">studdy<span className="text-blue-400">.</span></h1>
        <p className="relative z-10 text-white/60 mb-10 max-w-sm text-lg font-light">Il tuo archivio di studio intelligente, sincronizzato su ogni dispositivo.</p>
        <SignInButton mode="modal">
          <button className="relative z-10 px-10 py-4 bg-white/5 hover:bg-white/10 backdrop-blur-[40px] border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] text-white font-medium rounded-full transition-all text-lg hover:shadow-[0_10px_40px_0_rgba(37,99,235,0.2)]">
            Accedi per iniziare
          </button>
        </SignInButton>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050508] text-white font-sans pb-20 relative selection:bg-blue-500/30">
      
      {/* BACKGROUND LUMINOSO PER IL VETRO LIQUIDO */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[60vw] h-[60vw] bg-blue-600/20 blur-[150px] rounded-full mix-blend-screen animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-indigo-600/20 blur-[150px] rounded-full mix-blend-screen animate-pulse" style={{ animationDuration: '12s' }} />
        <div className="absolute top-[30%] left-[40%] w-[40vw] h-[40vw] bg-teal-500/10 blur-[150px] rounded-full mix-blend-screen animate-pulse" style={{ animationDuration: '10s' }} />
      </div>

      <div className="relative z-10 max-w-[1400px] mx-auto px-4 py-8 md:py-12">
        <header className="flex justify-between items-center mb-16">
          <div className="flex items-center gap-4 cursor-pointer" onClick={() => { setChapters([]); setPdfUrl(null); }}>
            <motion.div whileHover={{ scale: 1.05 }} className="w-12 h-12 rounded-2xl bg-white/5 backdrop-blur-[40px] border border-white/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] flex items-center justify-center">
              <BookOpen className="text-white w-6 h-6 drop-shadow-[0_2px_10px_rgba(255,255,255,0.3)]" />
            </motion.div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tighter lowercase drop-shadow-xl text-white">studdy<span className="text-blue-400">.</span></h1>
          </div>
          <div className="flex items-center gap-4">
            {pdfUrl && chapters.length > 0 && (
              <button onClick={() => setShowPdfModal(true)} className="flex lg:hidden px-4 py-2 rounded-full text-sm font-medium bg-white/5 backdrop-blur-[40px] border border-white/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] text-white hover:bg-white/10 transition-all items-center gap-2"><Layers className="w-4 h-4" /> Vedi PDF</button>
            )}
            
            <div className="w-11 h-11 flex items-center justify-center bg-white/5 backdrop-blur-[40px] border border-white/20 rounded-full shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] shadow-[0_8px_32px_0_rgba(0,0,0,0.37)]">
               <UserButton afterSignOutUrl="/" appearance={{ elements: { avatarBox: "w-9 h-9 rounded-full" } }} />
            </div>

          </div>
        </header>

        {/* CARICAMENTO */}
        {loading && (
           <div className="mb-8 p-12 rounded-[3rem] bg-white/[0.03] backdrop-blur-[60px] border border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] flex flex-col items-center justify-center text-center space-y-6">
              <div className="p-5 bg-white/5 rounded-full shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] border border-white/10">
                 <Loader2 className="w-12 h-12 text-white animate-spin drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]" />
              </div>
              <div>
                <p className="font-bold text-2xl text-white tracking-tight drop-shadow-md">{loadingStatus}</p>
                <p className="text-white/50 text-sm mt-2 font-light">Elaborazione neurale in corso...</p>
              </div>
           </div>
        )}

        {/* HOME */}
        {!loading && chapters.length === 0 && (
          <div className="grid md:grid-cols-2 gap-8">
            <div className="p-8 rounded-[2.5rem] bg-white/[0.04] backdrop-blur-[60px] border border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] space-y-6 transition-all hover:bg-white/[0.06]">
              <h3 className="text-2xl font-bold flex items-center gap-2 text-white tracking-tight"><Sparkles className="text-blue-400 drop-shadow-[0_0_10px_rgba(96,165,250,0.8)]" /> Nuovo Studio</h3>
              <input type="password" value={apiKey} onChange={e => {setApiKey(e.target.value); localStorage.setItem('study_buddy_api_key', e.target.value);}} className="w-full p-4 bg-black/20 rounded-2xl border border-white/5 outline-none focus:border-white/20 transition-all text-white placeholder-white/30 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]" placeholder="Google Gemini API Key" />
              <label className="flex flex-col items-center justify-center h-40 border border-dashed border-white/20 rounded-3xl cursor-pointer hover:bg-white/5 transition-all bg-white/[0.02] text-center px-4 shadow-[inset_0_2px_10px_rgba(0,0,0,0.2)] group">
                <UploadCloud className="w-10 h-10 text-white/40 mb-3 group-hover:text-blue-400 group-hover:drop-shadow-[0_0_10px_rgba(96,165,250,0.5)] transition-all" />
                <span className="text-sm font-medium text-white/60 group-hover:text-white transition-colors">{file ? file.name : "Trascina o clicca per caricare il PDF"}</span>
                <input type="file" className="hidden" accept=".pdf" onChange={e => setFile(e.target.files?.[0] || null)} />
              </label>
              <button onClick={startAutoPilot} className="w-full py-4 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 transition-all rounded-2xl font-bold text-lg shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)] shadow-[0_8px_20px_rgba(0,0,0,0.3)] text-white">Analizza Documento</button>
            </div>

            <div className="p-8 rounded-[2.5rem] bg-white/[0.04] backdrop-blur-[60px] border border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] flex flex-col transition-all hover:bg-white/[0.06]">
              <h3 className="text-2xl font-bold flex items-center gap-2 mb-6 text-white tracking-tight"><History className="text-indigo-400 drop-shadow-[0_0_10px_rgba(129,140,248,0.8)]" /> Archivio Studi</h3>
              <div className="space-y-3 overflow-y-auto flex-1 pr-2 custom-scrollbar">
                {Object.keys(groupedHistory).length === 0 ? (
                  <div className="flex items-center justify-center h-full opacity-40 italic font-light">Nessun documento salvato.</div>
                ) : (
                  Object.entries(groupedHistory).map(([pdfName, caps]: [string, any], i) => (
                    <div key={i} onClick={() => loadFromHistory(pdfName)} className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/10 hover:border-white/15 cursor-pointer transition-all group flex flex-col gap-2 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]">
                      <div className="flex justify-between items-start w-full">
                        <div>
                          <div className="font-bold text-white/90 group-hover:text-white transition-colors line-clamp-2 leading-snug flex items-start gap-3">
                            <FileText className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5 opacity-70 group-hover:opacity-100 group-hover:drop-shadow-[0_0_8px_rgba(129,140,248,0.5)] transition-all" />
                            {pdfName}
                          </div>
                          <div className="text-xs opacity-50 uppercase tracking-widest pl-8 font-medium text-white mt-2">
                            {caps.length} Capitoli
                          </div>
                        </div>
                        <button 
                          onClick={(e) => deletePdf(pdfName, e)} 
                          className="p-3 rounded-full hover:bg-red-500/20 text-white/30 hover:text-red-400 transition-colors flex-shrink-0 ml-2"
                          title="Elimina PDF"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* RISULTATI: LAYOUT SPLIT-SCREEN LIQUID GLASS */}
        {!loading && chapters.length > 0 && (
          <div className="flex flex-col w-full">
             
             <button onClick={() => { setChapters([]); setPdfUrl(null); }} className="self-start mb-6 px-5 py-2.5 bg-white/5 hover:bg-white/10 backdrop-blur-[40px] border border-white/10 rounded-full text-white/80 hover:text-white font-medium transition-all flex items-center gap-2 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]">
                <ChevronLeft className="w-4 h-4"/> Torna all'Archivio
             </button>

             <div className="flex flex-col lg:flex-row gap-8 items-start w-full">
                 
                 {/* COLONNA SINISTRA: Visualizzatore PDF */}
                 <div className="hidden lg:flex flex-col w-1/2 xl:w-[45%] sticky top-8 h-[calc(100vh-4rem)] bg-white/[0.03] backdrop-blur-[60px] border border-white/10 rounded-[2.5rem] shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] overflow-hidden">
                    <div className="px-6 py-5 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                       <span className="font-bold flex items-center gap-3 text-white">
                          <div className="p-2 bg-white/5 rounded-xl border border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]"><FileText className="w-4 h-4 text-white/80"/></div>
                          <span className="truncate max-w-[150px] xl:max-w-[200px] text-sm tracking-wide font-medium">{file?.name || "Documento"}</span>
                       </span>
                       <div className="flex items-center gap-4">
                           <div className="flex items-center gap-1 bg-black/20 rounded-xl p-1 border border-white/5 shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)]">
                              <button onClick={() => setPdfScale(s => Math.max(0.5, s - 0.25))} className="p-1.5 hover:bg-white/10 rounded-lg transition-all text-white/50 hover:text-white"><ZoomOut className="w-4 h-4"/></button>
                              <span className="font-mono text-xs font-bold text-white/70 px-1 w-10 text-center">{Math.round(pdfScale * 100)}%</span>
                              <button onClick={() => setPdfScale(s => Math.min(3, s + 0.25))} className="p-1.5 hover:bg-white/10 rounded-lg transition-all text-white/50 hover:text-white"><ZoomIn className="w-4 h-4"/></button>
                           </div>
                           {numPages && (
                             <div className="flex items-center gap-1 bg-black/20 rounded-xl p-1 border border-white/5 shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)]">
                                <button disabled={pageNumber <= 1} onClick={() => setPageNumber(p => Math.max(1, p - 1))} className="p-1.5 hover:bg-white/10 rounded-lg disabled:opacity-30 transition-all text-white/50 hover:text-white"><ChevronLeft className="w-4 h-4"/></button>
                                <span className="font-mono text-xs font-bold text-white/70 px-2">{pageNumber} / {numPages}</span>
                                <button disabled={pageNumber >= numPages} onClick={() => setPageNumber(p => Math.min(numPages, p + 1))} className="p-1.5 hover:bg-white/10 rounded-lg disabled:opacity-30 transition-all text-white/50 hover:text-white"><ChevronRight className="w-4 h-4"/></button>
                             </div>
                           )}
                       </div>
                    </div>
                    <div className="flex-1 overflow-auto custom-scrollbar pt-6 pb-6 bg-transparent relative">
                       {pdfUrl && inlineViewerWidth > 0 ? (
                          <Document file={pdfUrl} onLoadSuccess={({ numPages }) => { setNumPages(numPages); setPageNumber(1); }} loading={<div className="flex w-full justify-center mt-32"><Loader2 className="w-8 h-8 animate-spin text-white opacity-30" /></div>} className="w-max mx-auto flex flex-col items-center">
                             <AnimatePresence mode="wait">
                               <motion.div key={pageNumber} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.15 }} className="rounded-xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/5 relative">
                                  {/* NUOVO: renderTextLayer=true per permettere la selezione del testo dal PDF originale */}
                                  <Page pageNumber={pageNumber} width={inlineViewerWidth - 48} scale={pdfScale} renderTextLayer={true} renderAnnotationLayer={false} />
                               </motion.div>
                             </AnimatePresence>
                          </Document>
                       ) : (
                          <div className="mt-32 text-center text-white/30 text-sm font-light w-full">Preparazione lettore...</div>
                       )}
                    </div>
                 </div>

                 {/* COLONNA DESTRA */}
                 <div className="w-full lg:w-1/2 xl:w-[55%] space-y-6">
                     {chapters.map((cap: any, idx: number) => (
                        <div key={idx} className="rounded-[2.5rem] bg-white/[0.03] backdrop-blur-[60px] border border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] overflow-hidden transition-all">
                            <button onClick={() => setExpandedChapter(expandedChapter === idx ? null : idx)} className="w-full p-6 md:p-8 flex justify-between items-center text-left hover:bg-white/[0.02] transition-colors">
                                <span className="text-xl md:text-2xl font-bold flex items-center gap-5 text-white tracking-tight">
                                    <span className="flex items-center justify-center w-12 h-12 rounded-full bg-white/5 border border-white/10 text-white/90 text-lg shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] flex-shrink-0 backdrop-blur-md">{idx + 1}</span>
                                    {cap.titolo}
                                </span>
                                <ChevronDown className={`w-6 h-6 text-white/40 transition-transform duration-300 ${expandedChapter === idx ? 'rotate-180' : ''}`} />
                            </button>
                            
                            <AnimatePresence>
                                {expandedChapter === idx && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-6 md:px-10 pb-10">
                                        <div className="border-t border-white/5 pt-8 relative">
                                            <RenderMarkdown content={cap.testo} />
                                            
                                            <div className="mt-16 p-8 md:p-10 rounded-[2.5rem] bg-white/[0.02] border border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] flex flex-col items-center text-center space-y-6 relative overflow-hidden backdrop-blur-[20px]">
                                                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.02] mix-blend-overlay"></div>
                                                <div className="relative z-10 w-20 h-20 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] backdrop-blur-md"><BrainCircuit className="w-10 h-10 drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]" /></div>
                                                <div className="relative z-10">
                                                    <h4 className="text-2xl font-extrabold mb-2 text-white tracking-tight">Area Ripasso Interattiva</h4>
                                                    <p className="text-white/60 font-light">10 Flashcards + Test Universitario</p>
                                                </div>
                                                
                                                {!cap.quiz ? (
                                                    <button 
                                                        disabled={generatingQA === idx}
                                                        onClick={() => generateQA(idx)}
                                                        className="relative z-10 px-8 py-4 bg-white/10 hover:bg-white/20 border border-white/20 rounded-full font-bold flex items-center gap-3 transition-all disabled:opacity-50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)] shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] backdrop-blur-md text-white"
                                                    >
                                                        {generatingQA === idx ? <Loader2 className="animate-spin w-5 h-5" /> : <Sparkles className="w-5 h-5 text-white/90" />}
                                                        Genera Materiale di Studio
                                                    </button>
                                                ) : (
                                                    <div className="relative z-10 flex flex-wrap justify-center gap-4 w-full mt-4">
                                                        <button onClick={() => { setActiveQA({idx, type: 'flashcards'}); setCardIndex(0); }} className="px-8 py-4 bg-black/20 hover:bg-black/40 border border-white/10 text-white rounded-full font-medium transition-all shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] backdrop-blur-md">Studia Flashcards</button>
                                                        <button onClick={() => { setActiveQA({idx, type: 'quiz'}); }} className="px-8 py-4 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-full font-medium transition-all shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)] shadow-[0_8px_32px_0_rgba(0,0,0,0.3)]">Inizia Simulazione</button>
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
             </div>
          </div>
        )}

        {/* MODALE Q&A */}
        <AnimatePresence>
            {activeQA && chapters[activeQA.idx] && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/40 backdrop-blur-[20px]" onClick={() => setActiveQA(null)} />
                    <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-white/[0.04] backdrop-blur-[80px] rounded-[3rem] border border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] shadow-[0_30px_80px_rgba(0,0,0,0.8)] flex flex-col custom-scrollbar">
                        <div className="sticky top-0 p-6 md:p-8 border-b border-white/5 flex justify-between items-center bg-white/[0.02] shadow-sm z-20 backdrop-blur-md">
                            <h2 className="text-2xl font-extrabold text-white tracking-tight">{activeQA.type === 'flashcards' ? 'Flashcards Interattive' : 'Simulazione d\'Esame'}</h2>
                            <button onClick={() => setActiveQA(null)} className="p-3 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 transition-colors text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]"><X className="w-6 h-6" /></button>
                        </div>
                        
                        <div className="p-6 md:p-10">
                            {activeQA.type === 'flashcards' && chapters[activeQA.idx].flashcards ? (
                                <div className="flex flex-col items-center">
                                    <div onClick={() => setIsFlipped(!isFlipped)} className="w-full max-w-xl h-96 relative cursor-pointer perspective-2000 group">
                                        <motion.div animate={{ rotateY: isFlipped ? 180 : 0 }} transition={{ type: "spring", stiffness: 100, damping: 20 }} className="w-full h-full preserve-3d">
                                            <div className="absolute inset-0 backface-hidden bg-white/[0.03] border border-white/10 rounded-[3rem] p-10 flex flex-col justify-center items-center text-center shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] shadow-[0_15px_35px_rgba(0,0,0,0.3)] backdrop-blur-3xl group-hover:bg-white/[0.06] transition-colors">
                                                <span className="text-sm text-blue-300 font-bold uppercase tracking-[0.2em] mb-6 drop-shadow-[0_0_8px_rgba(96,165,250,0.5)]">Fronte - Domanda</span>
                                                <div className="text-2xl font-bold text-white drop-shadow-md"><RenderMarkdown content={chapters[activeQA.idx].flashcards[cardIndex]?.domanda || ""} /></div>
                                            </div>
                                            <div className="absolute inset-0 backface-hidden rotate-y-180 bg-blue-600/20 rounded-[3rem] p-10 flex flex-col justify-center items-center text-center shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)] shadow-[0_15px_35px_rgba(37,99,235,0.3)] border border-blue-400/30 backdrop-blur-[80px] overflow-y-auto custom-scrollbar">
                                                <span className="text-sm text-white/70 font-bold uppercase tracking-[0.2em] mb-6 mt-auto">Retro - Risposta</span>
                                                <div className="text-xl font-medium text-white mb-auto drop-shadow-md"><RenderMarkdown content={chapters[activeQA.idx].flashcards[cardIndex]?.risposta || ""} /></div>
                                            </div>
                                        </motion.div>
                                    </div>
                                    <div className="flex items-center gap-6 mt-10">
                                        <button onClick={() => {setCardIndex(Math.max(0, cardIndex - 1)); setIsFlipped(false)}} className="p-4 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] transition-colors text-white"><ChevronLeft className="w-6 h-6" /></button>
                                        <span className="font-mono font-bold text-xl text-white px-5 bg-black/20 py-2 rounded-xl shadow-[inset_0_2px_5px_rgba(0,0,0,0.5)] border border-white/5">{cardIndex + 1} / {chapters[activeQA.idx].flashcards.length}</span>
                                        <button onClick={() => {setCardIndex(Math.min(chapters[activeQA.idx].flashcards.length - 1, cardIndex + 1)); setIsFlipped(false)}} className="p-4 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] transition-colors text-white"><ChevronRight className="w-6 h-6" /></button>
                                    </div>
                                </div>
                            ) : activeQA.type === 'quiz' && chapters[activeQA.idx].quiz ? (
                                <div className="space-y-8">
                                    {chapters[activeQA.idx].quiz.map((q: any, i: number) => (
                                        <div key={i} className="p-8 bg-black/20 border border-white/5 rounded-[2.5rem] space-y-6 shadow-[inset_0_2px_10px_rgba(0,0,0,0.2)]">
                                            <div className="text-xl font-bold flex gap-4 text-white">
                                              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-white/10 border border-white/10 text-white text-sm flex-shrink-0 shadow-inner">{i+1}</span>
                                              <RenderMarkdown content={q.domanda || ""} />
                                            </div>
                                            <div className="grid gap-4">
                                                {q.opzioni?.map((opt: string, oi: number) => {
                                                    const qKey = `${activeQA.idx}-${i}`;
                                                    const isSelected = quizAnswers[qKey] === oi;
                                                    const submitted = quizSubmitted[activeQA.idx];
                                                    let btnClass = isSelected ? 'bg-white/20 border-white/40 text-white shadow-[0_0_20px_rgba(255,255,255,0.1)]' : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:border-white/20';
                                                    if (submitted) {
                                                        if (oi === q.corretta) btnClass = 'bg-green-500/20 border-green-400 text-green-200 shadow-[0_0_15px_rgba(34,197,94,0.3)]';
                                                        else if (isSelected) btnClass = 'bg-red-500/20 border-red-400 text-red-200 shadow-[0_0_15px_rgba(239,68,68,0.3)]';
                                                        else btnClass = 'bg-white/5 border-white/5 opacity-40';
                                                    }
                                                    return (
                                                        <button key={oi} onClick={() => !submitted && setQuizAnswers({...quizAnswers, [qKey]: oi})} className={`w-full p-5 rounded-2xl text-left border backdrop-blur-md transition-all duration-300 ${btnClass} font-light`}>
                                                          <RenderMarkdown content={opt || ""} />
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            {quizSubmitted[activeQA.idx] && (
                                              <div className="p-6 bg-blue-900/20 border border-blue-400/20 rounded-2xl mt-4 shadow-inner">
                                                <strong className="text-blue-300 mb-2 block uppercase text-xs tracking-[0.2em] font-bold">Spiegazione</strong>
                                                <RenderMarkdown content={q.spiegazione || ""} />
                                              </div>
                                            )}
                                        </div>
                                    ))}
                                    {!quizSubmitted[activeQA.idx] && (
                                      <button onClick={() => setQuizSubmitted({...quizSubmitted, [activeQA.idx]: true})} className="w-full py-5 mt-10 bg-white/10 hover:bg-white/20 border border-white/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)] backdrop-blur-[40px] rounded-[2rem] text-white font-extrabold text-xl transition-all">
                                        Consegna ed Esamina Risultati
                                      </button>
                                    )}
                                </div>
                            ) : (
                                <div className="text-center p-10 text-white/40 font-light">Dati non trovati.</div>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>

        {/* MODALE PDF VIEWER MOBILE */}
        <AnimatePresence>
          {showPdfModal && pdfUrl && (
            <div className="fixed inset-0 z-[100] flex lg:hidden items-center justify-center p-4 bg-black/40 backdrop-blur-[30px]">
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full h-full max-w-5xl rounded-[2.5rem] overflow-hidden bg-white/[0.04] border border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] flex flex-col shadow-[0_30px_80px_rgba(0,0,0,0.8)] backdrop-blur-[80px]">
                <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                  <div className="flex items-center gap-1 bg-black/20 rounded-xl p-1 border border-white/5 shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)]">
                     <button onClick={() => setPdfScale(s => Math.max(0.5, s - 0.25))} className="p-1.5 hover:bg-white/10 rounded-lg transition-all text-white/50 hover:text-white"><ZoomOut className="w-4 h-4"/></button>
                     <span className="font-mono text-xs font-bold text-white/70 px-1 w-10 text-center">{Math.round(pdfScale * 100)}%</span>
                     <button onClick={() => setPdfScale(s => Math.min(3, s + 0.25))} className="p-1.5 hover:bg-white/10 rounded-lg transition-all text-white/50 hover:text-white"><ZoomIn className="w-4 h-4"/></button>
                  </div>
                  <div className="flex items-center gap-3">
                    <a href={pdfUrl} target="_blank" rel="noopener noreferrer" download={file?.name || "documento.pdf"} className="p-2.5 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] transition-colors text-white">
                      <Download className="w-5 h-5" />
                    </a>
                    <button onClick={() => setShowPdfModal(false)} className="p-2.5 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] transition-colors text-white">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 w-full bg-transparent relative overflow-auto pb-24 pt-6 custom-scrollbar">
                   {viewerWidth > 0 && (
                     <Document file={pdfUrl} onLoadSuccess={({ numPages }) => { setNumPages(numPages); setPageNumber(1); }} loading={<div className="flex w-full justify-center mt-32"><Loader2 className="w-10 h-10 animate-spin text-white/50" /></div>} className="w-max mx-auto flex flex-col items-center">
                        <AnimatePresence mode="wait">
                           <motion.div key={pageNumber} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="rounded-xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] mb-8 overflow-hidden bg-white/5 min-w-min relative">
                              {/* NUOVO: renderTextLayer=true per il mobile */}
                              <Page pageNumber={pageNumber} width={viewerWidth - 32} scale={pdfScale} renderTextLayer={true} renderAnnotationLayer={false} />
                           </motion.div>
                        </AnimatePresence>
                     </Document>
                   )}
                   {numPages && (
                     <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-[60px] border border-white/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] px-2 py-2 rounded-full flex items-center gap-2 shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-50">
                       <button disabled={pageNumber <= 1} onClick={() => setPageNumber(p => Math.max(1, p - 1))} className="p-3 hover:bg-white/10 rounded-full disabled:opacity-30 transition-all text-white"><ChevronLeft className="w-5 h-5" /></button>
                       <span className="font-mono text-sm font-bold text-white px-4">{pageNumber} <span className="text-white/50 font-normal">/</span> {numPages}</span>
                       <button disabled={pageNumber >= numPages} onClick={() => setPageNumber(p => Math.min(numPages, p + 1))} className="p-3 hover:bg-white/10 rounded-full disabled:opacity-30 transition-all text-white"><ChevronRight className="w-5 h-5" /></button>
                     </div>
                   )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* ========================================================= */}
        {/* WIDGET FLUTTUANTE CHAT AI E BOTTONE SELEZIONE TESTO       */}
        {/* ========================================================= */}
        <div className="fixed bottom-6 right-6 z-[150] flex flex-col items-end gap-4">
          
          {/* NUOVO: BOTTONE FLUTTUANTE IN VETRO SE C'E' TESTO SELEZIONATO */}
          <AnimatePresence>
            {selectedText && !chatOpen && (
              <motion.button
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.9 }}
                onClick={handleAskAboutSelection}
                className="mb-2 px-6 py-3 bg-gradient-to-r from-blue-500/80 to-indigo-600/80 hover:from-blue-400 hover:to-indigo-500 backdrop-blur-3xl border-t border-l border-white/30 shadow-[0_8px_32px_0_rgba(37,99,235,0.4)] rounded-full flex items-center justify-center text-white font-bold gap-3 transition-all hover:scale-105 active:scale-95"
              >
                <Sparkles className="w-5 h-5 drop-shadow-md" />
                Spiega testo selezionato
              </motion.button>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {chatOpen && (
              <motion.div 
                initial={{ opacity: 0, y: 20, scale: 0.95 }} 
                animate={{ opacity: 1, y: 0, scale: 1 }} 
                exit={{ opacity: 0, y: 20, scale: 0.95 }}
                className="w-80 sm:w-96 h-[500px] max-h-[70vh] bg-white/[0.04] backdrop-blur-[80px] border border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] shadow-[0_30px_80px_rgba(0,0,0,0.8)] rounded-3xl flex flex-col overflow-hidden"
              >
                <div className="p-4 border-b border-white/5 bg-white/[0.02] flex justify-between items-center shadow-sm">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-blue-500/20 rounded-lg border border-white/10"><Sparkles className="w-4 h-4 text-blue-300" /></div>
                    <span className="font-bold text-white tracking-tight text-sm">Tutor IA</span>
                  </div>
                  <button onClick={() => setChatOpen(false)} className="p-1.5 rounded-full hover:bg-white/10 transition-colors text-white/50 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 custom-scrollbar" ref={chatScrollRef}>
                  {chatMessages.length === 0 && (
                    <div className="text-center text-white/40 text-sm font-light mt-auto mb-auto">
                      Fammi una domanda o seleziona un testo!
                    </div>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-blue-600/40 text-white rounded-br-sm shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] border border-blue-400/20' : 'bg-white/5 text-gray-200 rounded-bl-sm border border-white/5'}`}>
                        <ReactMarkdown 
                          className="prose prose-invert prose-sm max-w-none"
                          remarkPlugins={[remarkGfm, remarkMath]} 
                          rehypePlugins={[rehypeKatex]}
                        >
                          {msg.text}
                        </ReactMarkdown>
                      </div>
                    </div>
                  ))}
                  {isChatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-white/5 p-3 rounded-2xl rounded-bl-sm border border-white/5 flex gap-1">
                        <motion.div animate={{y: [0, -5, 0]}} transition={{repeat: Infinity, duration: 0.6, delay: 0}} className="w-1.5 h-1.5 bg-white/40 rounded-full" />
                        <motion.div animate={{y: [0, -5, 0]}} transition={{repeat: Infinity, duration: 0.6, delay: 0.2}} className="w-1.5 h-1.5 bg-white/40 rounded-full" />
                        <motion.div animate={{y: [0, -5, 0]}} transition={{repeat: Infinity, duration: 0.6, delay: 0.4}} className="w-1.5 h-1.5 bg-white/40 rounded-full" />
                      </div>
                    </div>
                  )}
                </div>

                <form onSubmit={sendChatMessage} className="p-4 bg-black/20 border-t border-white/5 flex gap-2">
                  <input 
                    type="text" 
                    value={chatInput} 
                    onChange={e => setChatInput(e.target.value)} 
                    placeholder="Chiedi qualcosa..." 
                    className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/30 transition-all shadow-[inset_0_2px_5px_rgba(0,0,0,0.5)]"
                  />
                  <button type="submit" disabled={isChatLoading || !chatInput.trim()} className="p-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-white/5 disabled:text-white/30 text-white rounded-full transition-all shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)]">
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          <button 
            onClick={() => setChatOpen(!chatOpen)}
            className="w-14 h-14 bg-gradient-to-br from-blue-500/80 to-indigo-600/80 hover:from-blue-400 hover:to-indigo-500 backdrop-blur-3xl rounded-full flex items-center justify-center text-white shadow-[0_8px_32px_0_rgba(37,99,235,0.4)] border-t border-l border-white/30 transition-all hover:scale-105 active:scale-95"
          >
            {chatOpen ? <X className="w-6 h-6 drop-shadow-md" /> : <MessageCircle className="w-6 h-6 drop-shadow-md" />}
          </button>
        </div>

      </div>

      {/* NUOVO: Stili CSS per rendere invisibile la grafica del testo PDF mantenendo la selezione blu scura */}
      <style dangerouslySetInnerHTML={{__html: `
        .perspective-2000 { perspective: 2000px; }
        .preserve-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
        .prose p { margin-bottom: 0 !important; margin-top: 0 !important; }
        .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.02); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); border-radius: 10px; border: 1px solid rgba(255,255,255,0.05); }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.25); }

        .react-pdf__Page__textContent {
            color: transparent;
        }
        .react-pdf__Page__textContent ::selection {
            background: rgba(59, 130, 246, 0.4);
            color: transparent;
        }
      `}} />
    </div>
  );
}
