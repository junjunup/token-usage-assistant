#!/bin/sh
# Token 用量助手 · Claude Code status-line helper for macOS (T18.3). Plain /bin/sh and the system curl, so the app's
# own binary never has to run as Node (Electron's RunAsNode fuse is off). Fail-open and metadata-only:
# - Claude Code's status-line input goes unchanged over the loopback address to the assistant, which keeps only the
#   whitelisted fields (version, session id, project folder, quota windows). Nothing is written to disk here and no
#   error is ever printed.
# - The token is read by curl from collector.header (-H @file), so it never shows in the process list.
# - "--installed <command>": run from Claude Code's own settings (T13.1). The statusLine command that was there before
#   runs with the same input and its output comes first; an offline assistant then adds nothing.
# Usage: /bin/sh StatusLine.sh [--installed [previous command]]
exec 2>/dev/null
dir=$(dirname "$0")
installed=0
previous=''
if [ "${1-}" = '--installed' ]; then
  installed=1
  previous=${2-}
fi
input=$(head -c 1000001)
size=$(printf '%s' "$input" | wc -c | tr -d ' ')
ok=0
line=''
port=$(sed -n 's/.*"port"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$dir/collector.json" | head -n 1)
case $port in
  [0-9][0-9][0-9][0-9] | [0-9][0-9][0-9][0-9][0-9]) ;;
  *) port='' ;;
esac
if [ "$size" -le 1000000 ] && [ -n "$port" ] && [ "$port" -ge 1024 ] && [ "$port" -le 65535 ] &&
  [ -f "$dir/collector.header" ]; then
  # -q first: the user's ~/.curlrc is not read. No proxy, http only, one second at most.
  if line=$(printf '%s' "$input" | curl -q -s -f -m 1 --connect-timeout 1 --noproxy '*' --proto '=http' \
    -H @"$dir/collector.header" -H 'Content-Type: application/json' -H 'Expect:' --data-binary @- \
    "http://127.0.0.1:$port/statusline"); then
    ok=1
    # The assistant sends one short line; control characters are dropped all the same.
    line=$(printf '%s' "$line" | LC_ALL=C tr -d '\000-\037\177' | head -c 800)
  else
    line=''
  fi
fi
chained=''
if [ -n "$previous" ]; then
  chained=$(printf '%s' "$input" | /bin/sh -c "$previous" | head -c 4000)
fi
if [ -n "$line" ]; then
  ours=$line
elif [ -n "$previous" ]; then
  ours=''
elif [ "$ok" = 1 ]; then
  ours='Token usage: local collector'
elif [ "$installed" = 1 ]; then
  ours=''
else
  ours='Token usage: collector offline'
fi
if [ -n "$chained" ] && [ -n "$ours" ]; then
  printf '%s\n%s' "$chained" "$ours"
else
  printf '%s%s' "$chained" "$ours"
fi
exit 0
