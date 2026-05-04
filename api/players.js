// api/players.js
// MLB Stats API から選手の直近成績を取得してトレンドスコアを計算して返す

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  try {
    const season = new Date().getFullYear();

    // MLB + マイナー（sportId: 1=MLB, 11=AAA, 12=AA, 13=A+）
    const sportIds = [
      { id: 1,  level: 'MLB' },
      { id: 11, level: 'AAA' },
      { id: 12, level: 'AA'  },
      { id: 13, level: 'A+'  },
    ];

    const allPlayers = [];

    for (const sport of sportIds) {
      // 打者：打率・OPS・HR上位
      const batUrl = `https://statsapi.mlb.com/api/v1/stats/leaders?leaderCategories=battingAverage,onBasePlusSlugging,homeRuns&season=${season}&sportId=${sport.id}&limit=20&statGroup=hitting&statType=season`;
      // 投手：ERA・奪三振上位
      const pitUrl = `https://statsapi.mlb.com/api/v1/stats/leaders?leaderCategories=earnedRunAverage,strikeoutsPer9Inn&season=${season}&sportId=${sport.id}&limit=20&statGroup=pitching&statType=season`;

      const [batRes, pitRes] = await Promise.all([
        fetch(batUrl),
        fetch(pitUrl),
      ]);

      if (batRes.ok) {
        const batData = await batRes.json();
        for (const cat of (batData.leagueLeaders || [])) {
          for (const leader of (cat.leaders || [])) {
            const p = leader.person;
            const s = leader.stat;
            if (!p?.id) continue;
            pushOrMerge(allPlayers, {
              id:       p.id,
              name:     p.fullName,
              team:     leader.team?.abbreviation || '?',
              org:      leader.team?.abbreviation || '?',
              pos:      leader.position?.abbreviation || 'OF',
              level:    sport.level,
              age:      null,
              isPit:    false,
              avg:      s.avg       ? parseFloat(s.avg)  : null,
              ops:      s.ops       ? parseFloat(s.ops)  : null,
              hr:       s.homeRuns  ?? null,
              rbi:      s.rbi       ?? null,
              sb:       s.stolenBases ?? null,
            });
          }
        }
      }

      if (pitRes.ok) {
        const pitData = await pitRes.json();
        for (const cat of (pitData.leagueLeaders || [])) {
          for (const leader of (cat.leaders || [])) {
            const p = leader.person;
            const s = leader.stat;
            if (!p?.id) continue;
            pushOrMerge(allPlayers, {
              id:       p.id,
              name:     p.fullName,
              team:     leader.team?.abbreviation || '?',
              org:      leader.team?.abbreviation || '?',
              pos:      leader.position?.abbreviation || 'SP',
              level:    sport.level,
              age:      null,
              isPit:    true,
              era:      s.era  ? parseFloat(s.era)  : null,
              whip:     s.whip ? parseFloat(s.whip) : null,
              k9:       s.strikeoutsPer9Inn ? parseFloat(s.strikeoutsPer9Inn) : null,
              ip:       s.inningsPitched ? parseFloat(s.inningsPitched) : null,
              wins:     s.wins ?? null,
            });
          }
        }
      }
    }

    // トレンドスコア計算（簡易版：成績の優秀さをスコア化）
    const scored = allPlayers.map(p => {
      let score = 50;
      if (!p.isPit) {
        if (p.avg  !== null) score += Math.min(30, Math.round((p.avg  - 0.250) * 300));
        if (p.ops  !== null) score += Math.min(20, Math.round((p.ops  - 0.700) * 40));
        if (p.hr   !== null) score += Math.min(10, p.hr);
      } else {
        if (p.era  !== null) score += Math.min(30, Math.round((4.50 - p.era)  * 10));
        if (p.whip !== null) score += Math.min(20, Math.round((1.40 - p.whip) * 30));
        if (p.k9   !== null) score += Math.min(10, Math.round((p.k9  - 8.0)   * 2));
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
}

function pushOrMerge(arr, player) {
  const existing = arr.find(p => p.id === player.id);
  if (existing) {
    Object.assign(existing, player);
  } else {
    arr.push(player);
  }
}
