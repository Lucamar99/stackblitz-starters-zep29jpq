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

    // FASE 0: Caricamento del PDF su Storage (se è un nuovo caricamento)
    let publicUrl = data.get('pdfUrl') as string;
    
    if (file && !publicUrl && action === 'outline') {
      const fileName = `${userId}/${Date.now()}_${pdfName}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('pdfs')
        .upload(fileName, file);

      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('pdfs').getPublicUrl(fileName);
        publicUrl = urlData.publicUrl;
      }
    }

    const genAI = new GoogleGenerativeAI(apiKey.trim());
    const bytes = await file.arrayBuffer();
    const pdfPart = { inlineData: { data: Buffer.from(bytes).toString('base64'), mimeType: "application/pdf" } };

    if (action === 'outline') {
      const model = genAI.getGenerativeModel({ 
        model: "gemini-3.1-flash-lite-preview",
        generationConfig: { responseMimeType: "application/json" }
      });
      const prompt = `Analizza l'indice di questo PDF. Restituisci ESCLUSIVAMENTE un JSON: {"capitoli": [{"titolo": "Titolo", "paginaInizio": 1}]}`;
      const res = await model.generateContent([prompt, pdfPart]);
      const cleanJson = res.response.text().replace(/^```json\s*/gi, '').replace(/```\s*$/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      
      return NextResponse.json({ 
        capitoli: parsed.capitoli || parsed.Capitoli || [],
        savedPdfUrl: publicUrl 
      });
    }

    if (action === 'chapter') {
      const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });
      const prompt = `Sei un professore. Scrivi una dispensa ESAUSTIVA su: ${focus}. Usa Markdown e LaTeX ($..$).`;
      const result = await model.generateContent([prompt, pdfPart]);
      const content = result.response.text();

      await supabase.from('study_data').insert([{ 
        user_id: userId, 
        pdf_name: pdfName, 
        chapter_title: focus, 
        content, 
        type: 'summary',
        pdf_url: publicUrl // Salviamo il link al PDF
      }]);
      return NextResponse.json({ riassunto: content });
    }

    if (action === 'generate_qa') {
      const modelJSON = genAI.getGenerativeModel({ 
        model: "gemini-3.1-flash-lite-preview",
        generationConfig: { responseMimeType: "application/json" }
      });
      const prompt = `Crea 10 flashcards e 10 quiz per: ${focus}. JSON in minuscolo.`;
      const result = await modelJSON.generateContent([prompt, pdfPart]);
      const cleanQA = result.response.text().replace(/^```json\s*/gi, '').replace(/```\s*$/g, '').trim();

      await supabase.from('study_data').insert([{ 
        user_id: userId, 
        pdf_name: pdfName, 
        chapter_title: focus, 
        content: cleanQA, 
        type: 'qa',
        pdf_url: publicUrl 
      }]);
      return NextResponse.json(JSON.parse(cleanQA));
    }

    return NextResponse.json({ error: "Azione non valida" });
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

export async function DELETE(request: Request) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    const { searchParams } = new URL(request.url);
    const pdfName = searchParams.get('pdfName');
    
    // Recuperiamo il link del file prima di cancellare i record
    const { data: records } = await supabase.from('study_data').select('pdf_url').eq('pdf_name', pdfName).limit(1);
    
    if (records?.[0]?.pdf_url) {
      const filePath = records[0].pdf_url.split('/pdfs/')[1];
      await supabase.storage.from('pdfs').remove([filePath]);
    }

    await supabase.from('study_data').delete().eq('user_id', userId).eq('pdf_name', pdfName);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
