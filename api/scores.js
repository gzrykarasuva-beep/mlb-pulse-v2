// api/scores.js
// MLB Stats API からその日の試合スコアを取得して返す中継関数

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  try {
    // 日付パラメータ（なければ今日）
    const date = req.query.date || getTodayEST();

    const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&gameType=R&hydrate=linescore,team`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`MLB API error: ${response.status}`);

    const data = await response.json();
    const games = [];

    for (const dateObj of (data.dates || [])) {
      for (const game of (dateObj.games || [])) {
        const away = game.teams?.away;
        const home = game.teams?.home;
        const ls   = game.linescore;

        games.push({
          gamePk:   game.gamePk,
          status:   game.status?.abstractGameState,   // "Live" | "Final" | "Preview"
          detailStatus: game.status?.detailState || game.status?.statusCode,
          inning:   ls?.currentInning     || null,
          inningHalf: ls?.inningHalf      || null,
          away: {
            abbr:  away?.team?.abbreviation || '',
            name:  away?.team?.teamName     || '',
            score: away?.score              ?? null,
            wins:  away?.leagueRecord?.wins   || 0,
            losses:away?.leagueRecord?.losses || 0,
          },
          home: {
            abbr:  home?.team?.abbreviation || '',
            name:  home?.team?.teamName     || '',
            score: home?.score              ?? null,
            wins:  home?.leagueRecord?.wins   || 0,
            losses:home?.leagueRecord?.losses || 0,
          },
        });
      }
    }

    res.status(200).json({ date, games, fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function getTodayEST() {
  const now = new Date();
  // EST = UTC-5（夏時間 EDT = UTC-4）
  const offset = -5 * 60;
  const est = new Date(now.getTime() + (now.getTimezoneOffset() + offset) * 60000);
  return est.toISOString().slice(0, 10);
}
