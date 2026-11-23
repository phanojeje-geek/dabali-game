// Vercel Serverless Function: /api/game-config
// Serves dynamic game configuration (levels, sponsors, announcements) to Dabali Game and Admin Dashboard

let inMemoryConfig = null;

export default async function handler(req, res) {
  // Enable CORS so both jeux.kev-in.site and admin.kev-in.site can communicate seamlessly
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const DEFAULT_CONFIG = {
    version: "1.0.0",
    updatedAt: new Date().toISOString(),
    announcement: {
      enabled: true,
      text: "Bienvenue sur Dabali Game ! Nouveau tournoi du Garbaman ouvert à Abidjan !",
      badge: "Événement"
    },
    ads: [
      {
        id: "ad-1",
        partner: "Garba Palace Abidjan",
        text: "Le meilleur Garba chaud de Cocody ! Commandez direct sur WhatsApp avec -15%",
        code: "GARBA15",
        link: "https://wa.me/2250707070707",
        bannerUrl: "assets/splash_chef.png",
        frequency: 3,
        enabled: true
      }
    ],
    customLevels: []
  };

  if (req.method === 'GET') {
    const config = inMemoryConfig || DEFAULT_CONFIG;
    return res.status(200).json(config);
  }

  if (req.method === 'POST') {
    try {
      const adminKey = req.headers['x-admin-key'] || req.headers['authorization'];
      // Security check: Simple default admin secret key (customizable in admin dashboard)
      const validSecret = process.env.ADMIN_SECRET_KEY || "dabali2026admin";
      
      if (adminKey && adminKey.replace(/^Bearer\s+/i, '') !== validSecret) {
        return res.status(401).json({ error: "Non autorisé : clé admin invalide." });
      }

      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!body) {
        return res.status(400).json({ error: "Corps de requête invalide." });
      }

      inMemoryConfig = {
        ...DEFAULT_CONFIG,
        ...body,
        updatedAt: new Date().toISOString()
      };

      return res.status(200).json({ 
        success: true, 
        message: "Configuration mise à jour avec succès !", 
        config: inMemoryConfig 
      });
    } catch (e) {
      return res.status(500).json({ error: e.message || "Erreur interne" });
    }
  }

  return res.status(405).json({ error: "Méthode non autorisée" });
}
