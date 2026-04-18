export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

// Inizializziamo Supabase (le chiavi devono essere su Vercel)
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export async function POST(request: Request) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Accesso negato" }, { status: 401 });

    const data = await request.formData();
    const apiKey = data.get('apiKey') as string;
    const action = data.get('action') as string;
    const focus = data.get('focus') as string;
    const pdfName = data.get('pdfName') as string;
    const file = data.get('file') as unknown as File;

    const genAI = new GoogleGenerativeAI(apiKey.trim());
    const bytes = await file.arrayBuffer();
    const pdfPart = { inlineData: { data: Buffer.from(bytes).toString('base64'), mimeType: "application/pdf" } };

    // FASE 1: INDICE
    if (action === 'outline') {
      const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview", generationConfig: { responseMimeType: "application/json" } });
      const res = await model.generateContent(["Analizza l'indice del PDF e restituisci JSON: { \"capitoli\": [{ \"titolo\": \"...\", \"paginaInizio\": 1 }] }", pdfPart]);
      return NextResponse.json(JSON.parse(res.response.text()));
    }

    // FASE 2: DISPENSA + SALVATAGGIO DB
    if (action === 'chapter') {
      const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });
      const prompt = `Redigi dispensa accademica esaustiva per: ${focus}. Usa LaTeX.`;
      const result = await model.generateContent([prompt, pdfPart]);
      const testoGenerato = result.response.text();

      // Salviamo nel Database Supabase
      const { data: dbData, error } = await supabase.from('study_data').insert([
        { 
          user_id: userId, 
          pdf_name: pdfName, 
          chapter_title: focus, 
          content: testoGenerato,
          type: 'summary'
        }
      ]).select();

      return NextResponse.json({ riassunto: testoGenerato, id: dbData?.[0]?.id });
    }

    // FASE 3: TEST + SALVATAGGIO DB
    if (action === 'generate_qa') {
      const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview", generationConfig: { responseMimeType: "application/json" } });
      const prompt = `Crea 10 flashcards e 10 quiz per: ${focus}. Rispondi in JSON.`;
      const result = await model.generateContent([prompt, pdfPart]);
      
      let qaData = JSON.parse(result.response.text().replace(/\\(?!["\\/bfnrt])/g, "\\\\"));

      await supabase.from('study_data').insert([
        { 
          user_id: userId, 
          pdf_name: pdfName, 
          chapter_title: focus, 
          content: JSON.stringify(qaData),
          type: 'qa'
        }
      ]);

      return NextResponse.json(qaData);
    }

    return NextResponse.json({ error: "Azione non valida" }, { status: 400 });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Nuova funzione GET per recuperare i dati salvati all'avvio
export async function GET() {
  const { userId } = auth();
  if (!userId) return NextResponse.json([], { status: 401 });

  const { data } = await supabase
    .from('study_data')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  return NextResponse.json(data || []);
}
