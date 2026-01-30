import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json();

    if (!prompt || !prompt.trim()) {
      return NextResponse.json(
        { error: 'Prompt ist erforderlich' },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API-Key nicht konfiguriert' },
        { status: 500 }
      );
    }

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: prompt,
        n: 1,
        size: '1024x1024',
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      return NextResponse.json(
        { error: data.error?.message || 'DALL-E API Fehler' },
        { status: response.status }
      );
    }

    const imageUrl = data.data[0].url;
    
    return NextResponse.json({ imageUrl });

  } catch (error: any) {
    console.error('Image generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Fehler beim Generieren' },
      { status: 500 }
    );
  }
}
