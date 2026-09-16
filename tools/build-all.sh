#!/usr/bin/env bash
# ---------------------------------------------------------------
# The full pipeline, in the order the pieces depend on each other.
#
#   ./tools/build-all.sh
#
# The build and the search index feed each other: the index is read from
# the built pages, and the built pages carry the four nearest neighbours the
# index worked out. So the pages are made, the index is taken over them, and
# they are made again with the neighbours folded in. gen_voice_index.py
# strips that block before reading a page, so the loop settles after one
# turn instead of chasing itself.
#
# Run tools/build.sh on its own while editing copy — it is a third of the
# time and the neighbours only go stale if a page's subject moved.
# ---------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."

echo "pass 1 — pages"
bash tools/build.sh | tail -3
echo
echo "index — over the pages just written"
python3 tools/gen_voice_index.py
echo
echo "pass 2 — pages, with the neighbours folded in"
bash tools/build.sh | tail -3
