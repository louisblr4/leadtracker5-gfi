export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { nom, spe, soc, linkedin, mode } = req.body;
  if (!nom) return res.status(400).json({ error: 'Nom requis' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Clé API non configurée' });

  const liInfo = linkedin ? `\n- LinkedIn : ${linkedin}` : '';

  const prompt = mode === 'prospects'
    ? `Tu es un expert en prospection pour un GFI genevois spécialisé plan 1e.

Recherche sur LinkedIn et le web les profils médicaux genevois que cette personne pourrait introduire.

Réponds UNIQUEMENT avec un tableau JSON valide, sans aucun texte avant ou après, sans balises markdown, sans backticks. Juste le tableau JSON brut.

Format exact attendu:
[{"nom":"Exemple","role":"Médecin","spe":"Cardiologie","soc":"HUG","linkedin":null,"force":"moyen","raison":"Explication"}]

3 à 5 entrées maximum.

Contact:
- Nom: ${nom}
- Rôle: ${spe || 'Non précisé'}
- Localisation: Genève${liInfo}`
    : `Tu es un expert en prospection pour un GFI genevois spécialisé plan 1e.

Recherche des connexions professionnelles probables pour ce profil médical genevois.

Réponds UNIQUEMENT avec un tableau JSON valide, sans aucun texte avant ou après, sans balises markdown, sans backticks. Juste le tableau JSON brut.

Format exact attendu:
[{"nom":"Exemple","role":"Poste","type_lien":"Connexion LinkedIn","force":"moyen","senio":"senior","raison":"Explication"}]

3 à 5 entrées maximum.

Profil:
- Nom: ${nom}
- Spécialité: ${spe || 'Non précisé'}
- Cabinet: ${soc || 'Non précisé'}
- Canton: Genève${liInfo}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1500,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    // Assemble all text blocks
    const fullText = data.content
      .filter(i => i.type === 'text')
      .map(i => i.text)
      .join('\n')
      .trim();

    // Try multiple extraction strategies
    let connexions = null;

    // Strategy 1: direct parse
    try { connexions = JSON.parse(fullText); } catch(e) {}

    // Strategy 2: extract array with regex
    if (!connexions) {
      const match = fullText.match(/\[[\s\S]*\]/);
      if (match) {
        try { connexions = JSON.parse(match[0]); } catch(e) {}
      }
    }

    // Strategy 3: strip markdown and retry
    if (!connexions) {
      const clean = fullText.replace(/```json/g, '').replace(/```/g, '').trim();
      try { connexions = JSON.parse(clean); } catch(e) {}
      if (!connexions) {
        const match2 = clean.match(/\[[\s\S]*\]/);
        if (match2) {
          try { connexions = JSON.parse(match2[0]); } catch(e) {}
        }
      }
    }

    if (!connexions || !Array.isArray(connexions)) {
      return res.status(500).json({ error: 'Réponse invalide de l\'IA', raw: fullText.slice(0, 200) });
    }

    return res.status(200).json({ connexions });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erreur serveur' });
  }
}
