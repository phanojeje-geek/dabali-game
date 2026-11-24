// Vercel Serverless Function: /api/feedback
// Collects player ratings, feedback, and bug reports

const SUPABASE_URL = process.env.SUPABASE_URL || "https://owiwogingjiumfiyawbk.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// In-memory fallback storage
let localFeedbacks = [
  {
    id: "sample-1",
    player_name: "Kouassi",
    rating: 5,
    category: "avis",
    message: "Le jeu est trop doux dé ! Les combos d'Abidjan sont mortels !",
    level_reached: 12,
    status: "traité",
    created_at: new Date(Date.now() - 3600000 * 4).toISOString()
  },
  {
    id: "sample-2",
    player_name: "Awa B.",
    rating: 4,
    category: "suggestion",
    message: "Est-ce qu'on peut ajouter un son de djembé quand on gagne ?",
    level_reached: 4,
    status: "nouveau",
    created_at: new Date(Date.now() - 3600000 * 2).toISOString()
  }
];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Admin-Key, X-Supabase-Key");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // GET: List feedbacks
  if (req.method === "GET") {
    const key = req.headers["x-supabase-key"] || SUPABASE_KEY;
    if (key) {
      try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/feedbacks?select=*&order=created_at.desc&limit=100`, {
          headers: {
            "apikey": key,
            "Authorization": `Bearer ${key}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          return res.status(200).json({ source: "supabase", feedbacks: data });
        }
      } catch (e) {
        console.warn("Supabase fetch error, fallback to local:", e.message);
      }
    }
    return res.status(200).json({ source: "local", feedbacks: localFeedbacks });
  }

  // POST: Submit new feedback
  if (req.method === "POST") {
    try {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      if (!body) return res.status(400).json({ error: "Corps de requête manquant." });

      const playerName = (body.playerName || body.player_name || "Joueur Anonyme").trim().slice(0, 50);
      const rating = Math.min(5, Math.max(1, parseInt(body.rating) || 5));
      const category = ["suggestion", "bug", "avis"].includes(body.category) ? body.category : "avis";
      const message = (body.message || "").trim().slice(0, 1000);
      const level = Math.max(1, parseInt(body.level) || 1);

      if (!message) {
        return res.status(400).json({ error: "Le message ne peut pas être vide." });
      }

      const newFeedback = {
        id: "fb-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
        player_name: playerName,
        rating,
        category,
        message,
        level_reached: level,
        status: "nouveau",
        created_at: new Date().toISOString()
      };

      const key = req.headers["x-supabase-key"] || SUPABASE_KEY;
      if (key) {
        try {
          const response = await fetch(`${SUPABASE_URL}/rest/v1/feedbacks`, {
            method: "POST",
            headers: {
              "apikey": key,
              "Authorization": `Bearer ${key}`,
              "Content-Type": "application/json",
              "Prefer": "return=representation"
            },
            body: JSON.stringify({
              player_name: playerName,
              rating,
              category,
              message,
              level: level,
              status: "nouveau"
            })
          });
          if (response.ok) {
            const data = await response.json();
            return res.status(201).json({ success: true, saved: "supabase", feedback: data[0] || newFeedback });
          }
        } catch (e) {
          console.warn("Supabase insert error, saving to local fallback:", e.message);
        }
      }

      // Fallback save
      localFeedbacks.unshift(newFeedback);
      if (localFeedbacks.length > 200) localFeedbacks.pop();

      return res.status(201).json({ success: true, saved: "local", feedback: newFeedback });
    } catch (e) {
      return res.status(500).json({ error: e.message || "Erreur serveur" });
    }
  }

  // PATCH: Update feedback status (e.g., mark as 'traité')
  if (req.method === "PATCH") {
    try {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const { id, status } = body || {};
      if (!id) return res.status(400).json({ error: "ID manquant." });

      const key = req.headers["x-supabase-key"] || SUPABASE_KEY;
      if (key) {
        try {
          const response = await fetch(`${SUPABASE_URL}/rest/v1/feedbacks?id=eq.${id}`, {
            method: "PATCH",
            headers: {
              "apikey": key,
              "Authorization": `Bearer ${key}`,
              "Content-Type": "application/json",
              "Prefer": "return=representation"
            },
            body: JSON.stringify({ status: status || "traité" })
          });
          if (response.ok) {
            const data = await response.json();
            return res.status(200).json({ success: true, updated: "supabase", feedback: data[0] });
          }
        } catch (e) {
          console.warn("Supabase patch failed:", e.message);
        }
      }

      const fb = localFeedbacks.find(f => f.id === id);
      if (fb) {
        fb.status = status || "traité";
        return res.status(200).json({ success: true, updated: "local", feedback: fb });
      }
      return res.status(404).json({ error: "Avis non trouvé." });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // DELETE: Remove feedback
  if (req.method === "DELETE") {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const id = url.searchParams.get("id");
      if (!id) return res.status(400).json({ error: "ID manquant." });

      const key = req.headers["x-supabase-key"] || SUPABASE_KEY;
      if (key) {
        try {
          const response = await fetch(`${SUPABASE_URL}/rest/v1/feedbacks?id=eq.${id}`, {
            method: "DELETE",
            headers: {
              "apikey": key,
              "Authorization": `Bearer ${key}`
            }
          });
          if (response.ok) {
            return res.status(200).json({ success: true, deleted: "supabase" });
          }
        } catch (e) {
          console.warn("Supabase delete failed:", e.message);
        }
      }

      localFeedbacks = localFeedbacks.filter(f => f.id !== id);
      return res.status(200).json({ success: true, deleted: "local" });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: "Méthode non autorisée" });
}
