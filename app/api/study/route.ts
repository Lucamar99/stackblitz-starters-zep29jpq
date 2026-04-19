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
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const data = await request.formData();
    const apiKey = data.get('apiKey') as string;
    const action = data.get('action') as string;
    const focus = data.get('focus') as string;
    const pdfName = data.get('pdfName') as string;
    const file = data.get('file') as unknown as File;

    const genAI = new GoogleGenerativeAI(apiKey.trim());
    const bytes = await file.arrayBuffer();
    const pdfPart = { inlineData: { data: Buffer.from(bytes).toString('base64'), mimeType: "application/pdf" } };

    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });

    if (action === 'outline') {
      const modelJSON = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview", generationConfig: { responseMimeType: "application/json" } });
      const res = await modelJSON.generateContent(["Identifica i capitoli del PDF. JSON: { \"capitoli\": [{ \"titolo\": \"...\", \"paginaInizio\": 1 }] }", pdfPart]);
      return NextResponse.json(JSON.parse(res.response.text()));
    }

    if (action === 'chapter') {
      const prompt = `Redigi dispensa accademica esaustiva per: ${focus}. Usa Markdown pulito e LaTeX ($..$ o $$..$$) solo per formule. NO documenti raw .tex.`;
      const result = await model.generateContent([prompt, pdfPart]);
      const content = result.response.text();

      // SALVATAGGIO SU SUPABASE
      await supabase.from('study_data').insert([{ user_id: userId, pdf_name: pdfName, chapter_title: focus, content, type: 'summary' }]);

      return NextResponse.json({ riassunto: content });
    }

    if (action === 'generate_qa') {
      const modelJSON = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview", generationConfig: { responseMimeType: "application/json" } });
      const prompt = `Crea 10 flashcards e 10 quiz per: ${focus}. JSON: { "flashcards": [...], "quiz": [...] }`;
      const result = await modelJSON.generateContent([prompt, pdfPart]);
      const content = result.response.text();

      await supabase.from('study_data').insert([{ user_id: userId, pdf_name: pdfName, chapter_title: focus, content, type: 'qa' }]);

      return NextResponse.json(JSON.parse(content));
    }

    return NextResponse.json({ error: "Invalid action" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  const { userId } = auth();
  if (!userId) return NextResponse.json([]);
  const { data } = await supabase.from('study_data').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  return NextResponse.json(data || []);
}
