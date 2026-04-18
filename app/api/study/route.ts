export const maxDuration = 60; 

import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(request: Request) {
  try {
    const data = await request.formData();
    const file: File | null = data.get('file') as unknown as File;
    const apiKey = data.get('apiKey') as string;
    const action = data.get('action') as string;
    const focus = data.get('focus') as string;

    if (!file || !apiKey) {
      return NextResponse.json({ error: "File e API Key obbligatori." }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Data = buffer.toString('base64');
    const genAI = new GoogleGenerativeAI(apiKey.trim());
    const pdfPart = { inlineData: { data: base64Data, mimeType: "application/pdf" } };

    // FASE 1: Individuazione capitoli e PAGINE
    if (action === 'outline') {
      const model = genAI.getGenerativeModel({ 
        model: "gemini-3.1-flash-lite-preview", 
        generationConfig: { responseMimeType: "application/json" } 
      });
      
      const promptOutline = `
        Analizza questo documento tecnico. Identifica i capitoli o i moduli principali.
        Per ogni capitolo, restituisci il titolo e il numero di pagina esatto in cui inizia (basati sulla numerazione del PDF).
        Rispondi ESCLUSIVAMENTE con questo JSON:
        { "capitoli": [{ "titolo": "Nome Capitolo", "paginaInizio": 1 }, ...] }
      `;
      
      const res = await model.generateContent([promptOutline, pdfPart]);
      return NextResponse.json(JSON.parse(res.response.text()));
    }

    // FASE 2: Riassunto del capitolo estratto
    if (action === 'chapter') {
      const modelTesto = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });
      const modelJSON = genAI.getGenerativeModel({ 
        model: "gemini-3.1-flash-lite-preview", 
        generationConfig: { responseMimeType: "application/json" } 
      });

      const promptRiassunto = `
        Sei un tutor accademico di alto livello. Il tuo obiettivo è redigere una DISPENSA ESAUSTIVA e DETTAGLIATISSIMA della seguente sezione: "${focus}".
        
        LINEE GUIDA PER IL CONTENUTO:
        - NON SINTETIZZARE: Espandi ogni concetto. Se il testo parla di un teorema, spiegane l'enunciato, la dimostrazione e le implicazioni.
        - PARAGRAFI CORPOSI: Scrivi paragrafi ampi e articolati che approfondiscano l'argomento. Evita frasi spezzettate o troppo brevi.
        - COMPLETEZZA: Assicurati che ogni sottotitolo o paragrafo del PDF originale sia sviscerato.
        - FORMALISMO: Mantieni un tono rigoroso. Includi tutte le formule matematiche usando LaTeX ($...$ e $$...$$).
        
        FORMATTAZIONE:
        - Usa titoli (##) e sottotitoli (###) per organizzare il discorso.
        - Usa il grassetto (**testo**) solo per i termini tecnici fondamentali.
        - Usa elenchi puntati solo se strettamente necessario per liste di componenti o dati, preferendo altrimenti l'esposizione discorsiva.
      `;
      
      // 1. Chiediamo il testo (SEQUENZIALE: ASPETTIAMO CHE FINISCA per non bloccare le API di Google)
      const riassuntoResult = await modelTesto.generateContent([promptRiassunto, pdfPart]);

      const promptQuiz = `
        Crea 3 flashcards e 2 domande a risposta multipla su questo capitolo: "${focus}".
        Usa LaTeX per le formule matematiche.
        Rispondi ESCLUSIVAMENTE IN JSON:
        {
          "flashcards": [{"domanda": "...", "risposta": "..."}],
          "quiz": [{"domanda": "...", "opzioni": ["a","b","c","d"], "corretta": 0, "spiegazione": "..."}]
        }
      `;
      
      // 2. Chiediamo il quiz solo DOPO aver finito il riassunto per evitare l'ingorgo del Rate Limit
      const quizResult = await modelJSON.generateContent([promptQuiz, pdfPart]);
      
      // IL LAVA-JSON: Pulizia automatica dei backslash ribelli del LaTeX
      let quizData;
      const rawJsonString = quizResult.response.text();
      try {
        quizData = JSON.parse(rawJsonString);
      } catch (e) {
        console.log("JSON sporco rilevato, avvio pulizia di emergenza...");
        const cleanedString = rawJsonString.replace(/\\(?!["\\/bfnrt])/g, "\\\\");
        quizData = JSON.parse(cleanedString);
      }

      return NextResponse.json({
        riassunto: riassuntoResult.response.text(),
        flashcards: quizData.flashcards || [],
        quiz: quizData.quiz || []
      });
    }

    return NextResponse.json({ error: "Azione non valida" }, { status: 400 });

  } catch (error: any) {
    console.error("🚨 ERRORE API:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
