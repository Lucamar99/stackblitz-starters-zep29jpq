import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(request: Request) {
  try {
    const data = await request.formData();
    const file: File | null = data.get('file') as unknown as File;
    const apiKey = data.get('apiKey') as string;

    if (!file || !apiKey) {
      return NextResponse.json({ error: "File e API Key sono obbligatori." }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Data = buffer.toString('base64');

    const genAI = new GoogleGenerativeAI(apiKey.trim());
    
    // MODELLO 1: Libero e senza limiti per scrivere un papiro
    const modelTesto = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });
    
    // MODELLO 2: Ingabbiato nel JSON solo per Quiz e Flashcards
    const modelJSON = genAI.getGenerativeModel({ 
      model: "gemini-3.1-flash-lite-preview",
      generationConfig: { responseMimeType: "application/json" }
    });

    const pdfPart = {
      inlineData: { data: base64Data, mimeType: "application/pdf" }
    };

    // --- FASE 1: IL RIASSUNTO TITANICO ---
    const promptRiassunto = `
      Sei un professore universitario esigente. Ho bisogno di un riassunto ESTREMAMENTE LUNGO, APPROFONDITO e CORPOSO del documento allegato.
      REGOLE:
      1. Procedi rigorosamente capitolo per capitolo, sezione per sezione.
      2. NON tralasciare formule, definizioni tecniche o passaggi logici.
      3. Voglio una vera e propria "dispensa" sostitutiva del libro, non una sintesi.
      4. Usa il Markdown per titoli, elenchi puntati e grassetti.
      5. Usa il formato LaTeX per le formule matematiche (es: $formula$ o $$formula$$). Non fare l'escape del backslash, scrivi le formule normalmente (es: \\frac).
    `;
    const riassuntoPromise = modelTesto.generateContent([promptRiassunto, pdfPart]);

    // --- FASE 2: QUIZ E FLASHCARDS ---
    const promptQuiz = `
      Analizza il documento e genera materiale di ripasso.
      ATTENZIONE: Poiché rispondi in JSON, fai l'escape (doppio backslash) per TUTTI i comandi LaTeX (es: \\\\frac).
      Rispondi ESCLUSIVAMENTE con un JSON con questa struttura:
      {
        "flashcards": [{"domanda": "...", "risposta": "..."}],
        "quiz": [{"domanda": "...", "opzioni": ["a","b","c","d"], "corretta": 0, "spiegazione": "..."}]
      }
    `;
    const quizPromise = modelJSON.generateContent([promptQuiz, pdfPart]);

    // Eseguiamo le due operazioni in parallelo per non far aspettare troppo l'utente
    const [riassuntoResult, quizResult] = await Promise.all([riassuntoPromise, quizPromise]);

    const testoRiassunto = riassuntoResult.response.text();
    const quizData = JSON.parse(quizResult.response.text());

    // Assembliamo il pacchetto finale per il sito
    return NextResponse.json({
      riassunto: testoRiassunto,
      flashcards: quizData.flashcards,
      quiz: quizData.quiz
    });

  } catch (error: any) {
    console.error("🚨 ERRORE INTERNO:", error);
    return NextResponse.json({ error: error.message || "Errore durante la generazione." }, { status: 500 });
  }
}
