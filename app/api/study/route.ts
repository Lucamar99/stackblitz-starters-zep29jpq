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
    const model = genAI.getGenerativeModel({ 
      model: "gemini-3.1-flash-lite-preview",
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `
      Sei un tutor universitario meticoloso. Analizza il documento PDF allegato e genera:
      
      1. Un riassunto ESTREMAMENTE CORPOSO e LUNGO. NON fare una sintesi breve. Devi espandere i concetti, spiegare i dettagli, i passaggi logici e coprire ogni singola sezione del documento originale. Voglio un testo di livello accademico.
      2. Una lista di flashcards (domanda e risposta) per memorizzare.
      3. Un quiz di 10 domande a risposta multipla.
      
      REGOLE DI FORMATTAZIONE (TASSATIVE):
      - Usa il Markdown per strutturare il testo (grassetti, liste, intestazioni).
      - Usa il formato LaTeX per TUTTE le formule matematiche ($ formula $ per le inline, $$ formula $$ per i blocchi). Fai il doppio backslash (es: \\\\frac).
      
      Rispondi ESCLUSIVAMENTE con un oggetto JSON valido strutturato in questo modo:
      {
        "riassunto": "...",
        "flashcards": [{"domanda": "...", "risposta": "..."}],
        "quiz": [{"domanda": "...", "opzioni": ["a","b","c","d"], "corretta": 0, "spiegazione": "..."}]
      }
    `;

    const result = await model.generateContent([ prompt, { inlineData: { data: base64Data, mimeType: "application/pdf" } } ]);
    return NextResponse.json(JSON.parse(result.response.text()));

  } catch (error: any) {
    console.error("🚨 ERRORE INTERNO:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}