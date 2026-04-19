export const maxDuration = 60;
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export async function POST(request: Request) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Effettua il login" }, { status: 401 });

    const data = await request.formData();
    const apiKey = data.get('apiKey') as string;
    const action = data.get('action') as string;
    const focus = data.get('focus') as string;
    const pdfName = data.get('pdfName') as string;
    const file = data.get('file') as unknown as File;

    const genAI = new GoogleGenerativeAI(apiKey.trim());
    const bytes = await file.arrayBuffer();
    const pdfPart = { inlineData: { data: Buffer.from(bytes).toString('base64'), mimeType: "application/pdf" } };

    // FASE 1: INDICE (PULIZIA TOTALE)
    if (action === 'outline') {
      const model = genAI.getGenerativeModel({ 
        model: "gemini-3.1-flash-lite-preview",
        generationConfig: { responseMimeType: "application/json" }
      });
      
      const prompt = `Analizza l'indice di questo PDF. 
      Restituisci un JSON con questa struttura esatta: 
      {"capitoli": [{"titolo": "Titolo", "paginaInizio": 1}]}`;
      
      const res = await model.generateContent([prompt, pdfPart]);
      const rawJson = res.response.text();
      
      // Pulizia di emergenza se l'IA aggiunge ```json o altro
      const cleanJson = rawJson.replace(/^```json\s*/gi, '').replace(/```\s*$/g, '').trim();
      return NextResponse.json(JSON.parse(cleanJson));
    }

    // FASE 2: DISPENSA
    if (action === 'chapter') {
      const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });
      const prompt = `Sei un professore. Scrivi una dispensa ESAUSTIVA su: ${focus}. Usa Markdown e LaTeX ($..$) per le formule.`;
      const result = await model.generateContent([prompt, pdfPart]);
      const content = result.response.text();

      await supabase.from('study_data').insert([{ user_id: userId, pdf_name: pdfName, chapter_title: focus, content, type: 'summary' }]);
      return NextResponse.json({ riassunto: content });
    }

    // FASE 3: TEST
    if (action === 'generate_qa') {
      const modelJSON = genAI.getGenerativeModel({ 
        model: "gemini-3.1-flash-lite-preview",
        generationConfig: { responseMimeType: "application/json" }
      });
      const prompt = `Crea 10 flashcards e 10 quiz per: ${focus}. JSON: {"flashcards": [...], "quiz": [...]}`;
      const result = await modelJSON.generateContent([prompt, pdfPart]);
      const cleanQA = result.response.text().replace(/^```json\s*/gi, '').replace(/```\s*$/g, '').trim();

      await supabase.from('study_data').insert([{ user_id: userId, pdf_name: pdfName, chapter_title: focus, content: cleanQA, type: 'qa' }]);
      return NextResponse.json(JSON.parse(cleanQA));
    }

    return NextResponse.json({ error: "Azione non valida" });
  } catch (error: any) {
    return NextResponse.json({ error: "Errore AI: " + error.message }, { status: 500 });
  }
}

export async function GET() {
  const { userId } = auth();
  if (!userId) return NextResponse.json([]);
  const { data } = await supabase.from('study_data').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  return NextResponse.json(data || []);
}
