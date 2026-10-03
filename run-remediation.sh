set -u
cd "/Users/peng/Documents/ChatGPT/【新版】云学堂LXP复刻项目/yunxuetang-permission-spike"
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
E=evidence/raw/round2-remediation-91683df
[ "$(git rev-parse HEAD)" = 91683df702182724dbe9025afa5726606ba3d340 ] || { echo "停止：HEAD 不对"; exit 2; }
[ -z "$(git status --porcelain)" ] || { echo "停止：工作区不干净"; exit 2; }
docker --context colima-yxt-permission exec yxt-pg pg_isready -U spike -d permission_spike > "$E/pg-ready.txt" 2>&1 || { echo "停止：PG 未就绪"; exit 2; }
docker --context colima-yxt-permission exec yxt-pg psql -U spike -d permission_spike -X -A -t -c 'SHOW track_commit_timestamp' > "$E/track-commit-timestamp-check.txt" 2>&1
for w in hot cold; do
  [ ! -e "$E/$w" ] || { echo "停止：$E/$w 已存在"; exit 2; }
  echo "开始 $w 窗口（约 13 分钟）"; date -u +%FT%TZ > "$E/$w-start-utc.txt"
  bash tools/run-native-window.sh "$E/$w" candidate "$w" > "$E/$w-run.out" 2>&1; echo $? > "$E/$w-script-exit.txt"
  date -u +%FT%TZ > "$E/$w-end-utc.txt"
  if [ -f "$E/$w/incomplete.txt" ] || [ ! -f "$E/$w/runner-exit.txt" ]; then echo "停止：$w 窗口未完整执行，见 $E/$w-run.out"; exit 3; fi
  echo "$w 窗口结束，脚本退出码 $(cat "$E/$w-script-exit.txt")（0 为门禁通过，1 为门禁未通过）"
done
echo "开始回归"; date -u +%FT%TZ > "$E/regression-start-utc.txt"
bash tools/run-native-regressions.sh "$E/regression" > "$E/regression-run.out" 2>&1; echo $? > "$E/regression-script-exit.txt"
date -u +%FT%TZ > "$E/regression-end-utc.txt"
python3 tools/summarize-native-regressions.py "$E/regression" "$E/regression-summary" > "$E/regression-summary-run.out" 2>&1; echo $? > "$E/regression-summary-exit.txt"
docker --context colima-yxt-permission ps -a > "$E/final-docker-ps.txt"
git rev-parse HEAD > "$E/final-head.txt"; git status --porcelain > "$E/final-git-status.txt"
echo "全部完成，回归脚本退出码 $(cat "$E/regression-script-exit.txt")"
