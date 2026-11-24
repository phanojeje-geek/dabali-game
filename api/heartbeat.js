// Vercel Serverless Function: /api/heartbeat
// Tracks live player sessions for real-time concurrent player stats

const activeSessions = new Map();

// Helper to purge inactive sessions (> 3 minutes)
function purgeStaleSessions() {
  const cutoff = Date.now() - (3 * 60 * 1000);
  for (const [id, session] of activeSessions.entries()) {
    if (session.lastSeen < cutoff) {
      activeSessions.delete(id);
    }
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  purgeStaleSessions();

  if (req.method === "POST") {
    try {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
      const sessionId = body.sessionId || req.headers["x-session-id"] || "anon-" + Math.random().toString(36).slice(2, 9);
      const playerName = (body.playerName || "Joueur").trim().slice(0, 40);
      const level = Math.max(1, parseInt(body.level) || 1);

      const existing = activeSessions.get(sessionId);
      activeSessions.set(sessionId, {
        sessionId,
        playerName,
        level,
        firstSeen: existing ? existing.firstSeen : Date.now(),
        lastSeen: Date.now()
      });

      return res.status(200).json({
        success: true,
        onlineCount: activeSessions.size
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // GET: return live count and active players list
  const sessionsList = Array.from(activeSessions.values()).map(s => ({
    sessionId: s.sessionId,
    playerName: s.playerName,
    level: s.level,
    activeMinutes: Math.max(1, Math.round((Date.now() - s.firstSeen) / 60000)),
    lastSeenSecondsAgo: Math.max(0, Math.round((Date.now() - s.lastSeen) / 1000))
  }));

  return res.status(200).json({
    onlineCount: activeSessions.size,
    sessions: sessionsList
  });
}
