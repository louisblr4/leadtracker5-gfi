export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { nom, spe, soc, linkedin, mode } = req.body;
  if (!nom) return res.status(400).json({ error: 'Nom requis' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Clé API non configurée sur le serveur' });

  const liInfo = linkedin ? `\n- LinkedIn : ${linkedin}` : '';

  const prompt = mode === 'prospects'
    ? `Tu es un expert en prospection pour un GFI genevois spécialisé plan 1e (prévoyance sur-obligatoire).

Ce contact connaît probablement des médecins ou professionnels de santé genevois qui pourraient être intéressés par un plan LPP sur-obligatoire.

Recherche sur LinkedIn et le web les profils que cette personne pourrait introduire, et retourne UNIQUEMENT un tableau JSON (sans markdown, sans backticks) avec 3 à 5 prospects potentiels.

Chaque prospect doit avoir :
- nom : nom complet
- role : poste et institution
- spe : spécialité médicale ou secteur
- soc : cabinet ou clinique
- linkedin : URL LinkedIn si trouvable, sinon null
- force : "fort" | "moyen" | "faible" (force probable de l'introduction)
- raison : une phrase expliquant pourquoi ce contact peut introduire cette personne

Contact connu :
- Nom : ${nom}
- Rôle : ${spe || 'Non précisé'}
- Localisation : Genève, Suisse${liInfo}

Retourne uniquement le tableau JSON.`
    : `Tu es un expert en prospection pour un GFI genevois spécialisé plan 1e.

Recherche des connexions professionnelles probables pour ce profil et retourne UNIQUEMENT un tableau JSON (sans markdown, sans backticks) avec 4 à 6 connexions.

Chaque connexion : nom, role, type_lien, force ("fort"|"moyen"|"faible"), senio ("partner"|"senior"|"junior"), raison.

Profil :
- Nom : ${nom}
- Spécialité : ${spe || 'Non précisé'}
- Cabinet : ${soc || 'Non précisé'}
- Canton : Genève${liInfo}

Retourne uniquement le tableau JSON.`;

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

    const fullText = data.content.map(i => (i.type === 'text' ? i.text : '')).filter(Boolean).join('\n');
    const clean = fullText.replace(/```json|```/g, '').trim();
    const arrMatch = clean.match(/\[[\s\S]*\]/);
    if (!arrMatch) return res.status(500).json({ error: 'Réponse invalide de l\'IA' });

    const connexions = JSON.parse(arrMatch[0]);
    return res.status(200).json({ connexions });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erreur serveur' });
  }
}
