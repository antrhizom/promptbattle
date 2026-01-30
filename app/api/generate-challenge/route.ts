import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { category } = await request.json();

    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API-Key nicht konfiguriert' },
        { status: 500 }
      );
    }

    const prompts: { [key: string]: string } = {
      betrieb: 'Erstelle EINE kurze Aufgabe für Berufsschüler über ihren Betrieb oder Ausbildung. Die Aufgabe muss eine ENTSCHEIDUNG beinhalten (z.B. "wer gewinnt", "was ist wichtiger", "wer ist stärker"). Format: "Mache ein Bild, das darstellt [Entscheidungsfrage]". Beispiele: "...welches von zwei Werkzeugen in eurem Betrieb der Boss ist", "...ob Montagmorgen oder Freitagnachmittag gewinnt", "...was wichtiger ist - gute Noten oder echte Erfahrung". Antworte NUR mit EINEM Satz, maximal 20 Wörter.',
      
      freizeit: 'Erstelle EINE kurze Aufgabe für Jugendliche über ihre Freizeit. Die Aufgabe muss eine ENTSCHEIDUNG beinhalten (z.B. "wer gewinnt", "was ist stärker"). Format: "Mache ein Bild, das darstellt [Entscheidungsfrage]". Beispiele: "...wer gewinnt - dein Handy oder dein Schlaf", "...ob Instagram-Leben oder echtes Leben glücklicher macht", "...was stärker ist - Freundschaft oder Familie". Antworte NUR mit EINEM Satz, maximal 20 Wörter.',
      
      familie: 'Erstelle EINE kurze Aufgabe für Jugendliche über Familie und Zuhause. Die Aufgabe muss eine ENTSCHEIDUNG beinhalten (z.B. "wer weiß mehr", "wer bestimmt"). Format: "Mache ein Bild, das darstellt [Entscheidungsfrage]". Beispiele: "...ob Kühlschrank oder Sofa mehr über deine Familie weiß", "...wer den Sonntagsablauf bestimmt - Eltern oder Kinder", "...wer klüger ist - Oma/Opa oder die Jugend heute". Antworte NUR mit EINEM Satz, maximal 20 Wörter.',
      
      jungsein: 'Erstelle EINE kurze Aufgabe über das Leben als junger Mensch heute. Die Aufgabe muss eine ENTSCHEIDUNG beinhalten (z.B. "was ist wichtiger", "wer gewinnt das Rennen", "was wiegt schwerer"). Format: "Mache ein Bild, das darstellt [Entscheidungsfrage]". Beispiele: "...was wichtiger ist - Geld oder Zeit", "...wer das Rennen gewinnt - Führerschein, Ausbildung oder erste Liebe", "...was schwerer wiegt - Erwartungen von anderen oder eigene Träume". Antworte NUR mit EINEM Satz, maximal 20 Wörter.'
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'Du bist ein kreativer Spielleiter für ein Kunst-Wettbewerb. Erstelle präzise, inspirierende Aufgaben.' },
          { role: 'user', content: prompts[category] || prompts.betrieb }
        ],
        max_tokens: 150,
        temperature: 0.9,
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      return NextResponse.json(
        { error: data.error?.message || 'OpenAI API Fehler' },
        { status: response.status }
      );
    }

    const challenge = data.choices[0].message.content.trim();
    
    return NextResponse.json({ challenge });

  } catch (error: any) {
    console.error('Challenge generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Fehler beim Generieren' },
      { status: 500 }
    );
  }
}
