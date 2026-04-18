import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(request: Request) {
  try {
    const data = await request.formData();
    const file: File | null = data.get('file') as unknown as File;
    const apiKey = data.get('apiKey') as string;
    const action = data.get('action') as string; // 'outline' o 'chapter'
    const focus = data.get('focus') as string; // Il capitolo corrente

    if (!file || !apiKey) {
      return NextResponse.json({ error: "File e API Key obbligatori." }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Data = buffer.toString('base64');

    const genAI = new GoogleGenerativeAI(apiKey.trim());
    
    const pdfPart = { inlineData: { data: base64Data, mimeType: "application/pdf" } };

    // FASE 1: Estrazione automatica dell'indice
    if (action === 'outline') {
      const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview", generationConfig: { responseMimeType: "application/json" } });
      const promptOutline = `
        Analizza l'intero documento e identifica i capitoli o moduli principali (massimo 8-10 blocchi per non sovraccaricare).
        Rispondi ESCLUSIVAMENTE con un JSON:
        { "capitoli": ["Nome Capitolo 1", "Nome Capitolo 2", "..."] }
      `;
      const res = await model.generateContent([promptOutline, pdfPart]);
      return NextResponse.json(JSON.parse(res.response.text()));
    }

    // FASE 2: Analisi profonda di un singolo capitolo
    if (action === 'chapter') {
      const modelTesto = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });
      const modelJSON = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview", generationConfig: { responseMimeType: "application/json" } });

      const promptRiassunto = `
        Sei un professore universitario. Concentrati ESCLUSIVAMENTE su questo capitolo/argomento del PDF: "${focus}".
        Scrivi un riassunto ESTREMAMENTE LUNGO, sviscerando ogni dettaglio, formula e concetto di questa specifica sezione.
        Usa Markdown per i titoli e LaTeX ($...$ e $$...$$) per le formule, scrivendo le formule normalmente (es: \\frac).
      `;
      const riassuntoPromise = modelTesto.generateContent([promptRiassunto, pdfPart]);

      const promptQuiz = `
        Concentrati SOLO su: "${focus}".
        Crea 3 flashcards e 2 domande a risposta multipla su questo specifico argomento.
        FAI L'ESCAPE (doppio backslash) per TUTTI i comandi LaTeX (es: \\\\frac).
        Rispondi IN JSON:
        {
          "flashcards": [{"domanda": "...", "risposta": "..."}],
          "quiz": [{"domanda": "...", "opzioni": ["a","b","c","d"], "corretta": 0, "spiegazione": "..."}]
        }
      `;
      const quizPromise = modelJSON.generateContent([promptQuiz, pdfPart]);

      const [riassuntoResult, quizResult] = await Promise.all([riassuntoPromise, quizPromise]);
      const quizData = JSON.parse(quizResult.response.text());

      return NextResponse.json({
        riassunto: riassuntoResult.response.text(),
        flashcards: quizData.flashcards || [],
        quiz: quizData.quiz || []
      });
    }

    return NextResponse.json({ error: "Azione non valida" }, { status: 400 });

  } catch (error: any) {
    console.error("🚨 ERRORE:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
