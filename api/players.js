// api/players.js
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  try {
    const season = 2025;

    const sportIds = [
      { id: 1,  level: 'MLB' },
      { id: 11, level: 'AAA' },
      { id: 12, level: 'AA'  },
      { id: 13, level: 'A+'  },
    ];

    const allPlayers = [];

    for (const sport of sportIds) {
      const categories = [
        { cat: 'battingAverage',       group: 'hitting'  },
        { cat: 'onBasePlusSlugging',   group: 'hitting'  },
        { cat: 'homeRuns',             group: 'hitting'  },
        { cat: 'earnedRunAverage',     group: 'pitching' },
        { cat: 'strikeoutsPer9Inn',    group: 'pitching' },
      ];

      for (const { cat, group } of categories) {
        const url = `https://statsapi.mlb.com/api/v1/stats/leaders?leaderCategories=${cat}&season=${season}&sportId=${sport.id}&limit=20&statGroup=${group}&statType=season`;
        const res2 = await fetch(url);
        if (!res2.ok) continue;
        const data = await res2.json();

        for (const catObj of (data.leagueLeaders || [])) {
          for (const leader of (catObj.leaders || [])) {
            const p = leader.person;
            if (!p?.id) continue;
            const val = parseFloat(leader.value) || null;
            const isPit = group === 'pitching';

            const entry = {
              id:    p.id,
              name:  p.fullName,
              team:  leader.team?.abbreviation || leader.team?.name?.slice(0,3).toUpperCase() || '?',
              level: sport.level,
              isPit,
              avg:  null, ops: null, hr: null,
              era:  null, k9: null,
            };

            if (cat === 'battingAverage')     entry.avg = val;
            if (cat === 'onBasePlusSlugging') entry.ops = val;
            if (cat === 'homeRuns')           entry.hr  = val;
            if (cat === 'earnedRunAverage')   entry.era = val;
            if (cat === 'strikeoutsPer9Inn')  entry.k9  = val;

            pushOrMerge(allPlayers, entry);
          }
        }
      }
    }

    const scored = allPlayers.map(p => {
      let score = 50;
      if (!p.isPit) {
        if (p.avg !== null) score += Math.min(30, Math.round((p.avg - 0.250) * 300));
        if (p.ops !== null) score += Math.min(20, Math.round((p.ops - 0.700) * 40));
        if (p.hr  !== null) score += Math.min(10, p.hr);
      } else {
        if (p.era !== null) score += Math.min(30, Math.round((4.50 - p.era) * 10));
        if (p.k9  !== null) score += Math.min(10, Math.round((p.k9  - 8.0)  * 2));
      }
      score = Math.max(0, Math.min(99, score));
      const trendDir = score >= 80 ? 'hot' : score >= 65 ? 'warm' : 'cool';
      return { ...p, trendScore: score, trendDir };
    })
    .filter(p => p.trendScore >= 55)
    .sort((a, b) => b.trendScore - a.trendScore)
    .slice(0, 60);

    res.status(200).json({ players: scored, fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

function pushOrMerge(arr, player) {
  const existing = arr.find(p => p.id === player.id);
  if (existing) {
    Object.assign(existing, player);
  } else {
    arr.push(player);
  }
}
