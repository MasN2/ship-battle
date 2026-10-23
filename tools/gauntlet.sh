#!/usr/bin/env bash
# Grandmaster (with optional settings) against every benchmark opponent.
#   bash tools/gauntlet.sh ['{"depth":30}'] [games=100]
# Prints one line per opponent: grandmaster's wins / games and median winning turn.
cd "$(dirname "$0")/.."
CFG="${1:-{\}}"
N="${2:-100}"
total=0; won=0
for opp in normal alice alice-red econ pol:spend pol:smart pol:econ pol:mine pol:big; do
  out=$(node tools/tourney.js gm "$opp" "$N" --a "$CFG" 2>/dev/null)
  w=$(echo "$out" | sed -n 's/^A wins \([0-9]*\).*/\1/p')
  med=$(echo "$out" | sed -n 's/^turns: A wins median \([0-9-]*\).*/\1/p')
  ms=$(echo "$out" | sed -n 's/^think time per turn: A \([0-9.]*\)ms.*/\1/p')
  printf "%-10s %4s/%s  median win turn %-4s  %sms/turn\n" "$opp" "$w" "$N" "$med" "$ms"
  total=$((total + N)); won=$((won + w))
done
echo "overall $won/$total"
