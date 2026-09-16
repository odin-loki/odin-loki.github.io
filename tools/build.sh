#!/usr/bin/env bash
# ---------------------------------------------------------------
# Imortek static site builder.
# Wraps each body in src/pages/*.html with the shared head/header/footer
# and writes the result to the repo root for GitHub Pages.
#
#   ./tools/build.sh
#
# Edit src/pages/*.html — never the generated files at the root.
# ---------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."

SITE_URL="https://imortek.com.au"
KS_URL="https://www.kickstarter.com/projects/1070199318/secure-operating-system-based-on-hbsd"
BUILT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Escape the five XML/HTML metacharacters. Titles and descriptions carry
# ampersands ("SGF & Algebraic Autopsy"), and a bare & in markup is invalid
# even where browsers forgive it.
esc() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' -e 's/"/\&quot;/g'; }

# Escape for a JSON string literal. HTML entities are *not* decoded inside a
# <script> element, so esc() is the wrong tool for the JSON-LD blocks — it would
# put a literal "&amp;" into the data. "<" becomes < so no value can ever
# close the script tag early.
jesc() {
  printf '%s' "$1" \
    | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/</\\u003C/g' -e 's/>/\\u003E/g'
}

# The leading segment of a title, i.e. everything before the first " — " or " | ":
#   "ParanoidBSD — a capability-secured C++23 operating system | Imortek" -> "ParanoidBSD"
# Breadcrumbs and entity names want a name, not a sentence.
short_name() {
  local t="${1%% | *}"
  printf '%s' "${t%% — *}"
}

# The segment after the dash: "ARIA — nonce-free AEAD | Imortek Research" -> "nonce-free AEAD".
sub_name() {
  local t="${1%% | *}"
  [[ "$t" == *" — "* ]] && t="${t#* — }"
  printf '%s' "$t"
}

# The title with only the site suffix removed:
#   "ARIA — nonce-free AEAD | Imortek Research" -> "ARIA — nonce-free AEAD"
# An article headline wants the whole descriptive title, not just its first word.
page_name() { printf '%s' "${1%% | *}"; }

# ---------------------------------------------------------------
# Locales.
#
# English is the source and stays at the root, so every URL that has ever been
# published or linked to keeps working. Each other locale is a parallel tree at
# /<code>/, carrying the fifteen pages a visitor actually navigates. The
# forty-six research ledgers are not translated: every figure in them is a
# claim somebody can check, and a claim that survives translation intact is
# not something this site can promise, so they stay in English and say so.
# ---------------------------------------------------------------
CORE_PAGES=" index pbsd cypha retdec mathscript aegis sentinel cellai chess kickstarter beta research licensing about 404 "

mapfile -t LOC_ROWS < <(python3 -c '
import json
for l in json.load(open("tools/locales.json", encoding="utf-8"))["locales"]:
    print("\t".join([l["code"], l["endonym"], l["dir"], l["speech"],
                     l["hreflang"], l["name"], l["tag"]]))
')

# The catalogue for the locale currently being built. Keys are flat dotted
# strings; a missing key falls through to the key itself, which is loud enough
# to notice in a page and harmless enough not to break one.
declare -A T=()
load_locale() {
  local code="$1" k v
  T=()
  while IFS=$'\t' read -r k v; do T["$k"]="$v"; done < <(
    python3 -c '
import json, sys
d = json.load(open("assets/i18n/%s.json" % sys.argv[1], encoding="utf-8"))
for k, v in d.items():
    print("%s\t%s" % (k, v.replace("\n", " ")))
' "$code")
}
t()  { printf '%s' "${T[$1]-$1}"; }

# The subset of the catalogue that only the browser can use: text that comes
# into being when something is clicked, spoken or found. Inlined into the head
# of a localised page so it is set before any deferred script runs and no page
# ever flashes English. English pages get nothing — the defaults in
# assets/js/i18n.js already are English.
# English text -> its translation, for the strings that live in this file
# rather than in a page body: titles and meta descriptions.
declare -A SEG=()
load_segments() {
  local code="$1" k v
  SEG=()
  [[ "$code" == "en" ]] && return
  while IFS=$'\t' read -r k v; do SEG["$k"]="$v"; done < <(
    python3 -c '
import json, os, sys
code = sys.argv[1]
en = json.load(open("src/i18n/segments.en.json", encoding="utf-8"))
p  = "src/i18n/segments.%s.json" % code
tr = json.load(open(p, encoding="utf-8")) if os.path.exists(p) else {}
for k, v in en.items():
    if k in tr and tr[k]:
        print("%s\t%s" % (v.replace("\n", " "), tr[k].replace("\n", " ")))
' "$code")
}
seg() { printf '%s' "${SEG[$1]-$1}"; }

LC_RUNTIME=""
load_runtime() {
  local code="$1"
  if [[ "$code" == "en" ]]; then LC_RUNTIME=""; return; fi
  LC_RUNTIME="<script>window.__IMORTEK_I18N=$(python3 -c '
import json, sys
d = json.load(open("assets/i18n/%s.json" % sys.argv[1], encoding="utf-8"))
keep = ("lang.", "tools.", "search.", "related.", "voice.", "gloss.", "gh.")
out = {k: v for k, v in d.items() if k.startswith(keep)}
print(json.dumps(out, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003C"))
' "$code");</script>"
}
te() { esc "${T[$1]-$1}"; }

# A site path in the locale being built. Only the core pages exist per locale;
# research articles and assets stay at the root and are linked there.
u() {
  local path="$1"
  [[ -z "$LC_PREFIX" ]] && { printf '%s' "$path"; return; }
  local slug="${path#/}"; slug="${slug%.html}"
  [[ "$path" == "/" ]] && slug="index"
  if [[ "$CORE_PAGES" == *" $slug "* ]]; then
    printf '%s%s' "$LC_PREFIX" "$path"
  else
    printf '%s' "$path"
  fi
}

# Repository behind each product page — emitted as schema.org codeRepository so
# the page and its source are understood as the same thing.
declare -A REPOS=(
  [pbsd]=ParanoidBSD      [cypha]=Cypha           [chess]=Cypha
  [retdec]=RetDec-Decompiler [mathscript]=MathScript [aegis]=ANONYMOUS
  [sentinel]=SENTINEL     [cellai]=CellAI
)

# The language selector. Rendered server-side as a plain list of links, so it
# works with JavaScript off, a crawler can follow it to every translation, and
# a screen reader meets a normal menu rather than a widget. Each row is labelled
# in its own language and carries its own lang/dir, which is what makes a
# browser pick the right font for 中文 next to اردو in the same list.
emit_langsel() {
  local slug="$1" row lcode lendo ldir lspeech lhref lname lpre lurl cur
  printf '<div class="langsel">\n'
  printf '  <button class="langsel__btn" type="button" aria-expanded="false" aria-haspopup="true" aria-controls="langsel-menu" aria-label="%s: %s">\n' \
    "$(te lang.label)" "$(esc "$LC_ENDONYM")"
  printf '    <svg class="langsel__globe" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="M3 12h18M12 3c2.6 2.6 2.6 15.4 0 18M12 3c-2.6 2.6-2.6 15.4 0 18" stroke="currentColor" stroke-width="1.6"/></svg>\n'
  printf '    <span class="langsel__cur">%s</span>\n' "$(esc "$LC_ENDONYM")"
  printf '    <span class="langsel__caret" aria-hidden="true"></span>\n'
  printf '  </button>\n'
  printf '  <div class="langsel__menu" id="langsel-menu" role="menu" aria-label="%s">\n' "$(te lang.choose)"
  for row in "${LOC_ROWS[@]}"; do
    IFS=$'\t' read -r lcode lendo ldir lspeech lhref lname _ltag <<< "$row"
    lpre=""; [[ "$lcode" != "en" ]] && lpre="/$lcode"
    # A page that exists in that locale, or that locale's homepage if it does
    # not. Sending somebody to a translated homepage is honest; sending them to
    # a URL that 404s is not.
    if [[ "$CORE_PAGES" == *" $slug "* && "$slug" != "404" && "$slug" != "index" ]]; then
      lurl="$lpre/$slug.html"
    else
      lurl="$lpre/"
    fi
    cur=""
    [[ "$lcode" == "$LC_CODE" ]] && cur=' class="is-current" aria-current="true"'
    printf '    <a role="menuitem" href="%s" data-lang="%s" data-endonym="%s" hreflang="%s" lang="%s" dir="%s"%s><span class="langsel__endo">%s</span><span class="langsel__name">%s</span></a>\n' \
      "$lurl" "$lcode" "$(esc "$lendo")" "$lhref" "$lhref" "$ldir" "$cur" "$(esc "$lendo")" "$(esc "$lname")"
  done
  printf '  </div>\n'
  printf '</div>\n'
}

emit_head() {
  local title="$1" desc="$2" slug="$3" extra_css="$4" og_type="$5" keywords="$6"
  local raw_title="$title" raw_desc="$desc"
  local runtime_i18n="$LC_RUNTIME"

  # og:locale:alternate tells a share card which other languages exist. Only
  # for pages that really are translated.
  local og_alt="" arow acode aog
  if [[ "$CORE_PAGES" == *" $slug "* && "$slug" != "404" ]]; then
    for arow in "${LOC_ROWS[@]}"; do
      IFS=$'\t' read -r acode _ae _ad aog _ah _an _at <<< "$arow"
      [[ "$acode" == "$LC_CODE" ]] && continue
      og_alt+="
<meta property=\"og:locale:alternate\" content=\"${aog//-/_}\">"
    done
  fi
  title="$(esc "$title")"
  desc="$(esc "$desc")"
  local canon="$SITE_URL$LC_PREFIX/"
  [[ "$slug" != "index" ]] && canon="$SITE_URL$LC_PREFIX/$slug.html"

  # hreflang. Only the pages that genuinely exist in more than one language get
  # alternates — pointing hreflang at a page that is not actually translated is
  # worse than saying nothing, because it promises a reader a language the page
  # does not speak. x-default is English, which is where an unmatched reader
  # should land.
  local alts="" row lcode lhref
  if [[ "$CORE_PAGES" == *" $slug "* && "$slug" != "404" ]]; then
    for row in "${LOC_ROWS[@]}"; do
      IFS=$'\t' read -r lcode _lendo _ldir _lspeech lhref _lname _ltag <<< "$row"
      local lpre=""; [[ "$lcode" != "en" ]] && lpre="/$lcode"
      local lurl="$SITE_URL$lpre/"
      [[ "$slug" != "index" ]] && lurl="$SITE_URL$lpre/$slug.html"
      alts+="<link rel=\"alternate\" hreflang=\"$lhref\" href=\"$lurl\">
"
    done
    local durl="$SITE_URL/"
    [[ "$slug" != "index" ]] && durl="$SITE_URL/$slug.html"
    alts+="<link rel=\"alternate\" hreflang=\"x-default\" href=\"$durl\">"
  fi

  # Per-page social card by convention: assets/img/og-<slug>.jpg overrides the
  # site-wide card if it exists.
  local og_img="$SITE_URL/assets/img/og.png"
  local og_base="${slug##*/}"
  if [[ -f "assets/img/og-${og_base}.jpg" ]]; then
    og_img="$SITE_URL/assets/img/og-${og_base}.jpg"
  fi

  # Crawler directives. The 404 is the one page that must never be indexed.
  # Everywhere else asks for the largest preview Google is willing to show,
  # which is what turns a result into a card instead of a line of blue text.
  local robots="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
  [[ "$slug" == "404" ]] && robots="noindex, follow"

  local kw_tag=""
  [[ -n "$keywords" ]] && kw_tag="<meta name=\"keywords\" content=\"$(esc "$keywords")\">"

  # Articles say who wrote them in the Open Graph namespace as well as in JSON-LD.
  local article_meta=""
  if [[ "$og_type" == "article" ]]; then
    article_meta="<meta property=\"article:author\" content=\"Odin Loch\">
<meta property=\"article:publisher\" content=\"$SITE_URL/\">
<meta property=\"article:section\" content=\"Research\">"
  fi

  # ---------------------------------------------------------------
  # Structured data. One @graph per page, with stable @ids so the
  # organisation, the person and the site are recognised as the same
  # entities across all 60 pages rather than 60 unrelated copies.
  # ---------------------------------------------------------------
  local jt jd jshort
  jt="$(jesc "$raw_title")"
  jd="$(jesc "$raw_desc")"
  jshort="$(jesc "$(short_name "$raw_title")")"
  local jname
  jname="$(jesc "$(page_name "$raw_title")")"

  # Research articles are navigated through the shelf, so their trail says so.
  local crumbs
  if [[ "$slug" == "index" ]]; then
    crumbs='{"@type":"ListItem","position":1,"name":"'"$(jesc "$(t nav.home)")"'","item":"'"$SITE_URL$LC_PREFIX"'/"}'
  elif [[ "$slug" == research/* ]]; then
    crumbs='{"@type":"ListItem","position":1,"name":"'"$(jesc "$(t nav.home)")"'","item":"'"$SITE_URL$LC_PREFIX"'/"},'
    crumbs+='{"@type":"ListItem","position":2,"name":"'"$(jesc "$(t nav.research)")"'","item":"'"$SITE_URL$LC_PREFIX"'/research.html"},'
    crumbs+='{"@type":"ListItem","position":3,"name":"'"$jshort"'","item":"'"$canon"'"}'
  else
    crumbs='{"@type":"ListItem","position":1,"name":"'"$(jesc "$(t nav.home)")"'","item":"'"$SITE_URL$LC_PREFIX"'/"},'
    crumbs+='{"@type":"ListItem","position":2,"name":"'"$jshort"'","item":"'"$canon"'"}'
  fi

  local page_type="WebPage"
  case "$slug" in
    about)    page_type="AboutPage" ;;
    research) page_type="CollectionPage" ;;
  esac

  # Whatever the page is actually about, beyond being a page.
  local entity=""
  if [[ "$og_type" == "product" ]]; then
    local repo="${REPOS[$slug]:-}" same=""
    [[ -n "$repo" ]] && same=',"codeRepository":"https://github.com/odin-loki/'"$repo"'","sameAs":["https://github.com/odin-loki/'"$repo"'"]'
    entity=',{"@type":"SoftwareApplication","@id":"'"$canon"'#software"'
    entity+=',"name":"'"$jshort"'","description":"'"$jd"'","url":"'"$canon"'"'
    entity+=',"applicationCategory":"DeveloperApplication"'
    entity+=',"operatingSystem":"Linux, FreeBSD, macOS, Windows"'
    entity+=',"license":"https://www.gnu.org/licenses/agpl-3.0.en.html"'
    entity+=',"author":{"@id":"'"$SITE_URL"'/#odin-loch"}'
    entity+=',"publisher":{"@id":"'"$SITE_URL"'/#organization"}'"$same"'}'
  elif [[ "$og_type" == "article" ]]; then
    entity=',{"@type":"TechArticle","@id":"'"$canon"'#article"'
    entity+=',"headline":"'"$jname"'","description":"'"$jd"'","url":"'"$canon"'"'
    entity+=',"mainEntityOfPage":{"@id":"'"$canon"'#webpage"}'
    entity+=',"image":"'"$og_img"'","inLanguage":"'"$LC_TAG"'","isAccessibleForFree":true'
    entity+=',"license":"https://www.gnu.org/licenses/agpl-3.0.en.html"'
    entity+=',"author":{"@id":"'"$SITE_URL"'/#odin-loch"}'
    entity+=',"publisher":{"@id":"'"$SITE_URL"'/#organization"}}'
  fi

  local ld
  ld='{"@context":"https://schema.org","@graph":['
  ld+='{"@type":"Organization","@id":"'"$SITE_URL"'/#organization","name":"Imortek"'
  ld+=',"alternateName":"Imortek Research & Systems","url":"'"$SITE_URL"'/"'
  ld+=',"logo":{"@type":"ImageObject","url":"'"$SITE_URL"'/assets/img/mark.svg"}'
  ld+=',"description":"Independent research and systems software by Odin Loch. Source-available under AGPL-3.0+ with a tiered commercial licence."'
  ld+=',"founder":{"@id":"'"$SITE_URL"'/#odin-loch"}'
  ld+=',"address":{"@type":"PostalAddress","addressLocality":"Sydney","addressRegion":"NSW","addressCountry":"AU"}'
  ld+=',"sameAs":["https://github.com/odin-loki","'"$KS_URL"'"]},'
  ld+='{"@type":"Person","@id":"'"$SITE_URL"'/#odin-loch","name":"Odin Loch"'
  ld+=',"url":"'"$SITE_URL"'/about.html"'
  ld+=',"jobTitle":"Independent systems engineer and researcher"'
  ld+=',"worksFor":{"@id":"'"$SITE_URL"'/#organization"}'
  ld+=',"sameAs":["https://github.com/odin-loki"]},'
  ld+='{"@type":"WebSite","@id":"'"$SITE_URL"'/#website","url":"'"$SITE_URL"'/"'
  ld+=',"name":"Imortek","inLanguage":"'"$LC_TAG"'"'
  ld+=',"publisher":{"@id":"'"$SITE_URL"'/#organization"}},'
  ld+='{"@type":"'"$page_type"'","@id":"'"$canon"'#webpage","url":"'"$canon"'"'
  ld+=',"name":"'"$jt"'","description":"'"$jd"'","inLanguage":"'"$LC_TAG"'"'
  ld+=',"isPartOf":{"@id":"'"$SITE_URL"'/#website"}'
  ld+=',"primaryImageOfPage":{"@type":"ImageObject","url":"'"$og_img"'","width":1200,"height":630}'
  ld+=',"breadcrumb":{"@id":"'"$canon"'#breadcrumb"}'
  ld+=',"publisher":{"@id":"'"$SITE_URL"'/#organization"}},'
  ld+='{"@type":"BreadcrumbList","@id":"'"$canon"'#breadcrumb","itemListElement":['"$crumbs"']}'
  ld+="$entity"
  ld+=']}'

  cat <<HEAD
<!DOCTYPE html>
<html lang="$LC_TAG" dir="$LC_DIR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>$title</title>
<meta name="description" content="$desc">
$kw_tag
<meta name="author" content="Odin Loch — Imortek">
<meta name="robots" content="$robots">
<meta name="theme-color" content="#06080b">
<meta name="color-scheme" content="dark">
<link rel="canonical" href="$canon">
$alts

<meta name="imortek:locale" content="$LC_CODE">
<meta name="imortek:speech" content="$LC_SPEECH">
<meta name="imortek:prefix" content="$LC_PREFIX">
$runtime_i18n

<meta property="og:site_name" content="Imortek">
<meta property="og:type" content="$og_type">
<meta property="og:locale" content="$LC_OG">$og_alt
<meta property="og:title" content="$title">
<meta property="og:description" content="$desc">
<meta property="og:url" content="$canon">
<meta property="og:image" content="$og_img">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="$title">
$article_meta
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="$title">
<meta name="twitter:description" content="$desc">
<meta name="twitter:image" content="$og_img">
<meta name="twitter:image:alt" content="$title">

<script type="application/ld+json">$ld</script>

<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/img/mark.svg">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;family=JetBrains+Mono:wght@400;500;600&amp;display=swap">
<link rel="stylesheet" href="/assets/css/main.css">
$extra_css
</head>
<body>
<a class="skip-link" href="#main">$(te site.skip)</a>
<div class="progress-bar" aria-hidden="true"></div>

<header class="site-header">
  <div class="wrap">
    <nav class="nav" aria-label="Primary">
      <a class="brand" href="$(u /)">
        <svg class="brand__mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <defs>
            <linearGradient id="bg1" x1="0" y1="0" x2="32" y2="32">
              <stop offset="0%" stop-color="#5eead4"/><stop offset="100%" stop-color="#a78bfa"/>
            </linearGradient>
          </defs>
          <path d="M16 2.5 28.5 9v14L16 29.5 3.5 23V9z" stroke="url(#bg1)" stroke-width="1.6" fill="rgba(94,234,212,.06)"/>
          <path d="M16 9.5 22.5 13v6L16 22.5 9.5 19v-6z" fill="url(#bg1)" opacity=".9"/>
          <circle cx="16" cy="16" r="1.9" fill="#06080b"/>
        </svg>
        <span>Imortek</span>
        <span class="brand__sub">$(te site.tagline)</span>
      </a>

      <button class="nav__toggle" aria-expanded="false" aria-controls="nav-links" aria-label="$(te nav.toggle)">
        <span></span>
      </button>

      <div class="nav__links" id="nav-links">
        <div class="nav__group">
          <a class="nav__link" href="$(u /)#products" aria-haspopup="true">$(te nav.products)</a>
          <div class="nav__menu">
            <a href="$(u /pbsd.html)"><strong>$(te menu.pbsd.name)</strong><span>$(te menu.pbsd.desc)</span></a>
            <a href="$(u /cypha.html)"><strong>$(te menu.cypha.name)</strong><span>$(te menu.cypha.desc)</span></a>
            <a href="$(u /chess.html)"><strong>$(te menu.chess.name)</strong><span>$(te menu.chess.desc)</span></a>
            <a href="$(u /retdec.html)"><strong>$(te menu.retdec.name)</strong><span>$(te menu.retdec.desc)</span></a>
            <a href="$(u /mathscript.html)"><strong>$(te menu.mathscript.name)</strong><span>$(te menu.mathscript.desc)</span></a>
            <a href="$(u /aegis.html)"><strong>$(te menu.aegis.name)</strong><span>$(te menu.aegis.desc)</span></a>
            <a href="$(u /sentinel.html)"><strong>$(te menu.sentinel.name)</strong><span>$(te menu.sentinel.desc)</span></a>
            <a href="$(u /cellai.html)"><strong>$(te menu.cellai.name)</strong><span>$(te menu.cellai.desc)</span></a>
            <a href="$(u /beta.html)"><strong>$(te menu.beta.name)</strong><span>$(te menu.beta.desc)</span></a>
          </div>
        </div>
        <a class="nav__link" href="$(u /research.html)">$(te nav.research)</a>
        <a class="nav__link" href="$(u /licensing.html)">$(te nav.licensing)</a>
        <a class="nav__link" href="$(u /about.html)">$(te nav.about)</a>
        <a class="nav__link" href="#" data-search aria-label="$(te search.aria)">$(te nav.search)</a>
        <a class="nav__link nav__link--extra" href="$(u /beta.html)">$(te nav.beta)</a>
        <a class="nav__link nav__link--extra" href="$(u /kickstarter.html)">$(te nav.kickstarter)</a>
        <a class="btn btn--fund btn--sm nav__cta" href="$(u /kickstarter.html)">$(te nav.cta)</a>
      </div>

$(emit_langsel "$slug")
    </nav>
  </div>
</header>

<main id="main">
HEAD
}

emit_foot() {
  local extra_js="$1"

  # What this page's demos say, in this language. Inlined rather than fetched:
  # a demo writes its first status line while it starts up, so a fetch would
  # arrive after the reader had already seen English. Only the demos this page
  # loads are included, so the licence chooser's forty-eight strings never ride
  # along with the chess board.
  local demo_i18n="" demo_names
  # Most pages carry no demo at all, and grep says so by exiting 1 — which
  # under set -e ends the build. || true is the whole fix.
  demo_names="$(printf '%s' "$extra_js" \
    | grep -oE '/assets/js/(demos|chess)/[a-z0-9-]+\.js' \
    | sed -e 's|.*/||' -e 's|\.js$||' | tr '\n' ' ' || true)"
  if [[ -n "$LC_PREFIX" && -n "$demo_names" ]]; then
    demo_i18n="$(python3 tools/i18n_demos.py blob "$LC_CODE" $demo_names)"
  fi

  cat <<FOOT
</main>

<footer class="site-footer">
  <div class="wrap">
    <div class="footer__grid">
      <div class="footer__col">
        <a class="brand" href="$(u /)" style="margin-bottom:14px">
          <svg class="brand__mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <defs><linearGradient id="fg1" x1="0" y1="0" x2="32" y2="32">
              <stop offset="0%" stop-color="#5eead4"/><stop offset="100%" stop-color="#a78bfa"/>
            </linearGradient></defs>
            <path d="M16 2.5 28.5 9v14L16 29.5 3.5 23V9z" stroke="url(#fg1)" stroke-width="1.6" fill="rgba(94,234,212,.06)"/>
            <path d="M16 9.5 22.5 13v6L16 22.5 9.5 19v-6z" fill="url(#fg1)" opacity=".9"/>
            <circle cx="16" cy="16" r="1.9" fill="#06080b"/>
          </svg>
          <span>Imortek</span>
        </a>
        <p class="small muted" style="max-width:38ch">
          $(te footer.blurb)
        </p>
        <div class="badge-row" style="margin-top:16px">
          <span class="badge badge--teal">$(te badge.agpl)</span>
          <span class="badge">$(te badge.commercial)</span>
        </div>
      </div>

      <div class="footer__col">
        <h4>$(te footer.products)</h4>
        <ul>
          <li><a href="$(u /pbsd.html)">$(te menu.pbsd.name)</a></li>
          <li><a href="$(u /cypha.html)">$(te menu.cypha.name)</a></li>
          <li><a href="$(u /chess.html)">$(te menu.chess.name)</a></li>
          <li><a href="$(u /retdec.html)">$(te menu.retdec.name)</a></li>
          <li><a href="$(u /mathscript.html)">$(te menu.mathscript.name)</a></li>
          <li><a href="$(u /aegis.html)">$(te menu.aegis.name)</a></li>
          <li><a href="$(u /sentinel.html)">$(te menu.sentinel.name)</a></li>
          <li><a href="$(u /cellai.html)">$(te menu.cellai.name)</a></li>
        </ul>
      </div>

      <div class="footer__col">
        <h4>$(te footer.company)</h4>
        <ul>
          <li><a href="$(u /about.html)">$(te footer.about)</a></li>
          <li><a href="$(u /research.html)">$(te footer.researchShelf)</a></li>
          <li><a href="$(u /licensing.html)">$(te footer.licensing)</a></li>
          <li><a href="$(u /beta.html)">$(te footer.beta)</a></li>
          <li><a href="$(u /kickstarter.html)">$(te footer.kickstarter)</a></li>
          <li><a data-email data-subject="Commercial licence enquiry" href="#">$(te footer.commercial)</a></li>
        </ul>
      </div>

      <div class="footer__col">
        <h4>$(te footer.source)</h4>
        <ul>
          <li><a href="https://github.com/odin-loki" target="_blank" rel="noopener">$(te footer.github)</a></li>
          <li><a href="https://github.com/odin-loki/ParanoidBSD" target="_blank" rel="noopener">$(te footer.pbsdRepo)</a></li>
          <li><a href="https://github.com/odin-loki/Ideas" target="_blank" rel="noopener">$(te footer.ideas)</a></li>
          <li><a href="https://www.gnu.org/licenses/agpl-3.0.en.html" target="_blank" rel="noopener">$(te footer.agpl)</a></li>
          <li><a href="/sitemap.xml">$(te footer.sitemap)</a></li>
        </ul>
      </div>
    </div>

    <div class="footer__bottom">
      <span>&copy; 2025&ndash;<span data-year>2026</span> $(te footer.rights)</span>
      <span class="mono tiny">$(te footer.built) $BUILT &middot; $(te footer.notrackers)</span>
    </div>
  </div>
</footer>

<script src="/assets/js/i18n.js" defer></script>
<script src="/assets/js/site.js" defer></script>
<script src="/assets/js/dictionary.js" defer></script>
<script src="/assets/js/similar.js" defer></script>
<script src="/assets/js/voice.js" defer></script>
<script src="/assets/js/glossary.js" defer></script>
$demo_i18n
$extra_js
</body>
</html>
FOOT
}

# slug~title~description~extra_css~extra_js~og_type
PAGES=(
"index~Imortek — Secure systems, original AI, and honest engineering~Imortek builds ParanoidBSD, Cypha, RetDec Imortek, MathScript, AEGIS and SENTINEL — source-available systems software under AGPL-3.0+ with commercial licensing. By Odin Loch, Sydney.~~<script src=\"/assets/js/demos/lattice.js\" defer></script>~website"
"pbsd~ParanoidBSD — a capability-secured C++23 operating system | Imortek~ParanoidBSD (PBSD) ports HardenedBSD 15-STABLE to C++23 with KDE Plasma 6 and a capability/handle security nucleus. Explore the interactive security model.~~<script src=\"/assets/js/demos/capability.js\" defer></script>~product"
"cypha~Cypha — a first-principles AI architecture | Imortek~Cypha unifies classification, regression, latent sampling and generation in one type. Built from AIXI/MDL, information geometry, active inference and the information bottleneck. Try the live classifier.~~<script src=\"/assets/js/demos/cypha.js\" defer></script><script src=\"/assets/js/demos/cypha-wasm.js\" defer></script>~product"
"retdec~RetDec Imortek — specification-extraction decompiler | Imortek~A decompiler that recovers algorithms, concurrency patterns and serialization formats from binaries — not just pseudocode. Qt 6 GUI, optional offline neural refinement.~~<script src=\"/assets/js/demos/retdec.js\" defer></script><script src=\"/assets/js/demos/retdec-wasm.js\" defer></script>~product"
"mathscript~MathScript — C++23 computer algebra and numerics | Imortek~Dense and sparse linear algebra, ODE/PDE/FEM, statistics, optimisation and a symbolic CAS in one C++23 library with in-tree BLAS/LAPACK. Try the live plotter.~~<script src=\"/assets/js/demos/mathscript.js\" defer></script><script src=\"/assets/js/demos/mathscript-wasm.js\" defer></script>~product"
"aegis~AEGIS — metadata-hiding transport for consortiums | Imortek~Traffic-analysis resistant transport that hides who talks to whom, when, and how much. Constant-rate mixnet plus a bulk plane. Run the live correlation attack.~~<script src=\"/assets/js/demos/aegis.js\" defer></script>~product"
"sentinel~SENTINEL — crime analytics and investigative leads | Imortek~A C++23 / Qt 6 analyst tool: Poisson and Hawkes models, DBSCAN series detection, KDE hotspots and Rossmo geographic profiling, with full provenance. Try the live hotspot model.~~<script src=\"/assets/js/demos/sentinel.js\" defer></script><script src=\"/assets/js/demos/sentinel-wasm.js\" defer></script>~product"
"cellai~Cell AI — a reaction-diffusion sequence model | Imortek~A deliberately non-transformer architecture: partition dynamics, in-forward Hebbian/BCM plasticity, spectral PDE. An honest research log. Run the live simulation.~~<script src=\"/assets/js/demos/cellai.js\" defer></script>~product"
"chess~Play chess against Cypha | Imortek~Cypha distilled from a real chess engine: 26,568 positions labelled with the engine's own search evaluations. Held-out R2 0.866. Play it in your browser.~~<script src=\"/assets/js/chess/engine.js\" defer></script><script src=\"/assets/js/chess/features.js\" defer></script><script src=\"/assets/js/chess/cypha.js\" defer></script><script src=\"/assets/js/demos/chess.js\" defer></script>~product"
"kickstarter~Back ParanoidBSD — the PBSD Kickstarter is live | Imortek~The ParanoidBSD Kickstarter is live until 12 November 2026 — AUD 10,000, all-or-nothing, funding the compute that finishes the HardenedBSD-to-C++23 port.~~<script src=\"/assets/js/demos/funding.js\" defer></script>~website"
"beta~Become a beta tester — try the software early | Imortek~Seven programs open for beta testing: a secure operating system, a small self-learning AI, a decompiler, a maths toolkit, a private transport, crime analytics and an AI experiment. Free, no NDA.~~~website"
"research~Research shelf — cryptography, AI, physics, materials | Imortek~Odin Loch's R&D shelf: design documents and proofs of concept across cryptography, AI, tracking, mathematics, physics, materials and policy. Honestly labelled.~~<script src=\"/assets/js/demos/research.js\" defer></script>~website"
"licensing~Licensing — AGPL-3.0+ and commercial terms | Imortek~Free under AGPL-3.0+ for personal use, charity, education and organisations under AUD 50,000/yr. Tiered commercial licence above that. Work out which applies to you.~~<script src=\"/assets/js/demos/licence.js\" defer></script>~website"
"about~About Imortek and Odin Loch | Imortek~A one-person research and systems engineering practice in Sydney, Australia. What Imortek is, how it works, and how to get in touch.~~~profile"
"research/aria-aead~ARIA — nonce-free AEAD | Imortek Research~Authenticated encryption that derives the nonce from the message and session key instead of transmitting it, making sender/receiver drift structurally impossible.~~~article"
"research/compression~Izaac, GRIA & NMP — compression | Imortek Research~Shared-PRF coordination, graded reversibility, and neural networks treated as measurable compression operators — unified under one information-theoretic vocabulary.~~~article"
"research/uhpm~UHPM — unified hash-predictive memory | Imortek~Locality-sensitive-hash memory and hierarchical predictive coding unified under a single free-energy functional, reporting a 289× query-latency speedup over full attention at 100K tokens.~~~article"
"research/neural-decompiler~Neural Decompiler — research | Imortek~An encoder–decoder Transformer with hierarchical memory and a load-balanced mixture of experts, reframing assembly-to-source recovery as a sequence modelling problem.~~~article"
"research/modelling-aes~Modelling AES — two negative results | Imortek~A paired study attacking AES-128 from both directions with neural networks, reporting that neither works — and quantifying exactly how far short each falls.~~~article"
"research/gf2-algebra~GF(2) algebra — seven papers | Imortek Research~From an exhaustive enumeration of all 16 binary operations to permutation polynomials, circuit optimisation and differentiable logic gates — including a uniqueness theorem for AND.~~~article"
"research/asset-tracking~ARIA-INTEL — multi-source tracking | Imortek~A PMBM random-finite-set tracker with pattern-of-life modelling, eight tradecraft detectors and Bayesian threat scoring — 2,363 lines, NumPy and SciPy only, 28 ms per scan.~~~article"
"research/filtering~GH-SR-IMM — heavy-tailed tracking | Imortek~A heavy-tailed multi-target tracker that decouples outlier robustness from manoeuvre handling, reporting a 51.6% average GOSPA improvement.~~<script src=\"/assets/js/demos/filtering.js\" defer></script>~article"
"research/physics~NLFGN-UFT — non-local gravity | Imortek Research~A variational non-local gravity programme keeping causal messaging at speeds ≤ c, plus an essay arguing superluminal recession is an interpretational split, not a failure of ΛCDM.~~~article"
"research/carbide~HX-70 GradePlex — HRC 40–70 tooling | Imortek~A functionally-graded carbide substrate, a five-layer coating stack, and a forge-to-machine supply chain — targeting the gap between where conventional inserts fail and where CBN geometries exist.~~~article"
"research/economics~EREM & SPX — energy wealth, market risk | Imortek~Two lines: recasting national wealth into physical energy units to break the circular dependency on monetary institutions, and five models converging on a 2028–2029 window for a gamma unwind.~~~article"
"research/fungal~Fungal Network Algorithm | Imortek Research~A bio-inspired self-organising network where edges and weights are the consequence of input history rather than the storage medium, growing and pruning by purely local rules.~~~article"
"research/nn-shortcuts~SGF & Algebraic Autopsy | Imortek Research~Every efficient deep-learning technique reduced to one primitive — an online sufficient statistic on a curved manifold — plus a post-hoc diagnostic that reads a trained network’s implicit algebra off its weights.~~~article"
"research/usg~USG — composable statistical generation | Imortek~Generators shown to form a mathematical category under composition, with hash-based context compression that breaks the state-explosion ceiling that capped n-gram and HMM methods at three to five tokens.~~~article"
"research/scheduler~Statistical Scheduler | Imortek Research~Fairness from a statistical CFS variant, placement quality from a contextual bandit, load balance from a PID loop — with formal guarantees for each and sub-millisecond measured placement latency.~~~article"
"research/ashby~Ashby Optimiser — multi-scale search | Imortek~N isolated search units at geometrically spaced radii, round-robin scheduled, with homeostatic restarts on stagnation — benchmarked honestly against random search and a (1+1)-ES.~~~article"
"research/vdj~VDJ algorithm — immune-inspired recognition | Imortek~V(D)J recombination abstracted into five modules for one-shot learning and combinatorial generation, profiled to the millisecond and the kilobyte for embedded deployment.~~~article"
"research/electromechanical~Babbage, Antikythera & TDC algorithms | Imortek~Babbage’s difference engine, the Antikythera mechanism’s epicyclic gearing, and the WWII Torpedo Data Computer — each reconstructed as a benchmarked algorithm rather than a museum piece.~~~article"
"research/izaac-protocols~Izaac protocol suite — shared randomness | Imortek~A compact shared cryptographic state σ acts as a free broadcast channel — and twelve concrete protocols, from Byzantine consensus to coordinated differential privacy, are derived from that one observation.~~~article"
"research/lcrp~LCRP — logarithmic complexity reduction | Imortek~A survey-and-framework paper arguing that a small set of mechanisms — divide and conquer, tree representation, information-theoretic limits — accounts for most quadratic-to-log-linear reductions across seven fields.~~~article"
"research/boolean-dimensions~Boolean dimensional emergence, n = 3 to 8 | Imortek~A dimension-by-dimension census of Boolean function space from three to eight variables, tracking the fraction of genuinely irreducible functions from roughly a quarter to a virtual ceiling.~~~article"
"research/veritas~VERITAS — proof-backed meta-learning | Imortek~Nine theorems over binary pattern spaces, with PAC and ALT guarantees checked at runtime rather than argued offline — and a composition result showing the guarantees add.~~~article"
"research/primes~Prime meta-pattern from NN weights | Imortek~Six MLPs trained to classify primes across five orders of magnitude, interpreted from weights alone — they rediscover trial division on the 6k±1 lattice, and then lose to it by 30–80×.~~<script src=\"/assets/js/demos/primes.js\" defer></script>~article"
"research/qgo~Quantum Graph Optimisation — QAOA pipeline | Imortek~Five auditable layers — spectral compression, Chebyshev encoding, simulated QAOA, noise-weighted ranking, spectral lift-back — each with a named verification function and an explicit error term.~~~article"
"research/ucdw~UCDW — hybrid metal bonding | Imortek Research~Electrochemical ion migration, thermal diffusion and ultrasonic assistance combined in an ionic-liquid substrate, spanning 77% to 99% of parent-metal strength across five operating regimes.~~~article"
"research/diamond-battery~Diamond battery designs, Series A–D | Imortek~Four design series extrapolating the 2024 Bristol/UKAEA carbon-14 diamond cell toward utility scale, with the 400,000-tonne spent-fuel inventory as the feedstock argument.~~~article"
"research/qdmp~QDMP — room-temperature diamond qubits | Imortek~Engineered NV-centre arrays in a metamaterial diamond lattice, proposed as a structured thought experiment — with seven named scientific barriers assessed against the current literature.~~~article"
"research/hybrid-components~Discrete-continuous hybrid components | Imortek~Memristors, Josephson junctions, GMR and phase-change elements simulated across six phases — with a self-audit that found and published seven bugs in its own framework.~~~article"
"research/ausdike~AusDike — injection-moulded flood levee | Imortek~An open-bottom self-ballasting levee panel taken from concept to tooling quote — 28 simulations, a buckling-governed wall, and one adverse finding the programme did not bury.~~~article"
"research/noise-generator~100 W wideband noise generator | Imortek~One SystemVerilog file supervising a Chua-circuit analogue core, a four-band PA chain, supply DAC, thermal ADC and a sub-microsecond hard-protection state machine.~~~article"
"research/rngs~Four RNG families — a portfolio | Imortek~Transcendental-constant DAG, Boolean LCG, dual-attractor chaos and counter-rotating turbulence — four generators with genuinely different failure modes, benchmarked separately.~~~article"
"research/nqd~Neural Quantum Dust — two-tier interface | Imortek~Quantum nanodiamond sensors at single-neuron proximity, read optically by ultrasound-powered CMOS motes that backscatter to a wearable array — no wires through the skull.~~~article"
"research/math-survey~Thirteen domains of modern mathematics | Imortek~A research-grade survey of number theory through financial mathematics — foundational theory, landmark results of the past decade, open problems, and the cross-domain connections between them.~~~article"
"research/battle-sim~Combat models — a reading map | Imortek~A short survey of modern mathematical combat models — Hughes-style discrete salvos, extended Lanchester formulations, Markov-state battle models — with their equations and their caveats.~~~article"
"research/cpu~Heterogeneous many-core CPU sketch | Imortek~A heterogeneous many-core architecture discussion paired with a SystemVerilog sketch that moves operating-system primitives — context switch, syscall dispatch, page-fault handling — into hardware.~~~article"
"research/future-cpp~Future C++ — a language design brainstorm | Imortek~A long design conversation about a compiled language with C++ syntax and modern guarantees — which opens by arguing modern C++ already covers most of the wishlist, then works out what is left.~~~article"
"research/pharma~Depot drug delivery + speculative compounds | Imortek~A genuine pharmaceutics playbook — PLGA tuning bands, phase-inversion gels, Higuchi release kinetics, ICH Q8 framing — paired with invented compounds that the folder banner-flags as fiction on every page.~~~article"
"research/hsa~HSA protocol — speculative human enhancement | Imortek~A three-phase genetic-modification programme written as engineering speculation, with tiered evidentiary disclaimers, a cumulative adverse-event table, and an opening banner declaring it theoretical and worldbuilding only.~~~article"
"research/weapons-defence~Defence portfolio — one simulator, 30 platforms | Imortek~Thirty-plus platform folders in defence-engineering register, with the unusual discipline that every ballistic, thermal and lifecycle figure is generated by a single shared physics engine and cited back to it.~~~article"
"research/weapons-police~Law-enforcement equipment prospectuses | Imortek~Body armour at a third the mass of the incumbent and a reduced-energy service pistol, both run through the same shared physics engine as the defence portfolio and both costed as procurement cases.~~~article"
"research/threat-assessments~Open-source threat assessment briefs | Imortek~Hypothetical intelligence briefs on identity-replacement tradecraft, neurological interference and an explosive mixture — written from open sources in the register such documents actually use.~~~article"
"research/ucn~UCN — a complete constitutional design | Imortek~Eight numbered papers covering constitution, economy, defence, IP, drug policy and foreign relations — every claim sourced, every incompatibility with current law acknowledged in the roadmap.~~~article"
"research/ucn-ais~UCN AI families — in-universe systems | Imortek~Any Purpose Networks, General Purpose Networks, Signal AI and two learning primitives — worldbuilding artefacts written in the register of a mathematical-foundations paper.~~~article"
"research/un-reform~UN enforcement architecture proposal | Imortek~A standing UN Defence Force under an elected Security Commissioner, argued from Charter articles and treaty law, with a closing section on why it probably will not be adopted.~~~article"
"research/hemp-harmony~Hemp Harmony — cosmeceutical formulation | Imortek~A three-phase botanical cosmeceutical with every ingredient class substantiated from peer-reviewed clinical, in-vitro and ethnobotanical evidence rather than asserted.~~~article"
"research/cocktails~Bar operations as a design problem | Imortek~Four native-botanical bases driving every infusion, syrup and bitters on the menu, with explicit timings, batch ratios, QC checkpoints and shift rhythms.~~~article"
"404~Page not found | Imortek~That page does not exist. Head back to the Imortek homepage.~~~website"
)

# Search keywords, per page. Google itself has ignored <meta name="keywords">
# since 2009 — these are here for the engines and site-search tools that still
# read it, and as a one-line statement of what each page is about. The tags that
# actually move Google are the JSON-LD graph and the robots directives above.
# Research articles are not listed: there are 46 of them and their titles
# already say what they are, so keywords are derived from the title instead.
declare -A KEYWORDS=(
  [index]="Imortek, Odin Loch, ParanoidBSD, Cypha, secure operating system, C++23, systems software, AGPL-3.0, independent research, Sydney Australia"
  [pbsd]="ParanoidBSD, PBSD, HardenedBSD, FreeBSD, C++23 modules, capability security, memory safety, secure operating system, KDE Plasma 6, kernel port, Capsicum"
  [cypha]="Cypha, AI architecture, online classifier, latent sampling, information bottleneck, active inference, AIXI, minimum description length, random Fourier features"
  [chess]="Cypha chess, chess engine, distilled model, browser chess, alpha-beta search, machine learning chess, 0x88 engine"
  [retdec]="RetDec Imortek, decompiler, reverse engineering, binary analysis, algorithm recovery, specification extraction, Qt 6"
  [mathscript]="MathScript, C++23, computer algebra, CAS, linear algebra, BLAS, LAPACK, ODE, PDE, FEM, numerical methods"
  [aegis]="AEGIS, metadata-hiding transport, traffic analysis resistance, mixnet, constant-rate shaping, anonymity, privacy engineering"
  [sentinel]="SENTINEL, crime analytics, Hawkes process, DBSCAN, KDE hotspots, Rossmo geographic profiling, investigative leads, Qt 6"
  [cellai]="Cell AI, reaction-diffusion, Gray-Scott, sequence model, Hebbian plasticity, BCM rule, non-transformer architecture"
  [kickstarter]="ParanoidBSD Kickstarter, PBSD crowdfunding, secure operating system Kickstarter, HardenedBSD C++23 port, memory-safe operating system, back ParanoidBSD, Odin Loch"
  [beta]="beta testing, beta testers wanted, early access software, try before release, open source beta, Imortek beta, software testing volunteers"
  [research]="Imortek research, Odin Loch, cryptography research, AI research, physics, materials science, mathematics, policy, design documents"
  [licensing]="AGPL-3.0, commercial licence, dual licensing, source available, open source licence, Imortek licensing"
  [about]="Imortek, Odin Loch, about, Sydney Australia, systems engineering, independent research, contact"
)


count=0
for lrow in "${LOC_ROWS[@]}"; do
  IFS=$'\t' read -r LC_CODE LC_ENDONYM LC_DIR LC_SPEECH LC_HREF LC_NAME LC_TAG <<< "$lrow"
  LC_PREFIX=""
  [[ "$LC_CODE" != "en" ]] && LC_PREFIX="/$LC_CODE"
  LC_OG="${LC_SPEECH//-/_}"
  load_locale   "$LC_CODE"
  load_runtime  "$LC_CODE"
  load_segments "$LC_CODE"
  [[ -n "$LC_PREFIX" ]] && mkdir -p ".$LC_PREFIX"

  lcount=0 lbytes=0
  for row in "${PAGES[@]}"; do
    IFS='~' read -r slug rawtitle rawdesc extra_css extra_js og_type <<< "$row"
    # Only the core pages exist in a translated tree. A research ledger has one
    # language and its URL says so.
    [[ -n "$LC_PREFIX" && "$CORE_PAGES" != *" $slug "* ]] && continue

    body="src/pages/$slug.html"
    if [[ ! -f "$body" ]]; then
      echo "  ! missing $body — skipped"
      continue
    fi
    out=".$LC_PREFIX/$slug.html"; out="${out#./}"
    mkdir -p "$(dirname "$out")"

    title="$(seg "$rawtitle")"
    desc="$(seg "$rawdesc")"
    keywords="$(seg "${KEYWORDS[$slug]:-}")"
    if [[ -z "$keywords" && "$slug" == research/* ]]; then
      keywords="$(short_name "$rawtitle"), $(sub_name "$rawtitle"), Imortek research, Odin Loch"
    fi

    # How much of this page is genuinely in this language. Below the bar the
    # page says so out loud, because a reader who finds half a page in English
    # deserves to be told rather than left wondering.
    notice=""
    if [[ -n "$LC_PREFIX" ]]; then
      cov="$(python3 tools/i18n_segments.py cover "$slug" "$LC_CODE")"
      if [[ "$cov" -lt 92 ]]; then
        notice="<div class=\"wrap\"><p class=\"i18n-note\" role=\"note\">$(te notice.partial)</p></div>"
      fi
      if [[ "$slug" == "research" ]]; then
        notice+="<div class=\"wrap\"><p class=\"i18n-note\" role=\"note\">$(te notice.englishOnly)</p></div>"
      fi
    fi

    { emit_head "$title" "$desc" "$slug" "$extra_css" "$og_type" "$keywords"
      [[ -n "$notice" ]] && printf '%s\n' "$notice"
      if [[ -z "$LC_PREFIX" ]]; then
        cat "$body"
      else
        python3 tools/i18n_segments.py apply "$slug" "$LC_CODE"
      fi
      emit_foot "$extra_js"
    } > "$out"
    count=$((count+1)); lcount=$((lcount+1))
    lbytes=$((lbytes + $(wc -c < "$out")))
  done
  printf '  %-2s %-11s %3d pages  %6d KB\n' "$LC_CODE" "$LC_NAME" "$lcount" "$((lbytes/1024))"
done

# Back to English for everything generated after the page loop.
LC_CODE=en LC_PREFIX="" LC_DIR=ltr LC_TAG=en-AU LC_SPEECH=en-AU LC_OG=en_AU
load_locale en

# Sitemap — generated from PAGES so it can never drift from what was built.
# Priority is by role: home, the flagship and the campaign, then products and the
# shelf index, then the standing pages, then individual research articles.
{
  printf '<?xml version="1.0" encoding="UTF-8"?>\n'
  printf '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n'
  printf '        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
  for row in "${PAGES[@]}"; do
    IFS='~' read -r slug _title _desc _css _js og_type <<< "$row"
    [[ -f "$slug.html" ]] || continue
    case "$slug" in
      404)                 continue ;;
      index)               loc=""            ; pri="1.0" ; freq="weekly"  ;;
      pbsd|kickstarter|beta) loc="$slug.html" ; pri="0.9" ; freq="weekly"  ;;
      research)            loc="$slug.html"  ; pri="0.8" ; freq="weekly"  ;;
      research/*)          loc="$slug.html"  ; pri="0.6" ; freq="monthly" ;;
      *)
        if [[ "$og_type" == "product" ]]; then
          loc="$slug.html" ; pri="0.8" ; freq="weekly"
        else
          loc="$slug.html" ; pri="0.7" ; freq="monthly"
        fi ;;
    esac
    # A page that exists in ten languages is ONE page with ten addresses, not
    # ten pages. Google wants every one of them listed, and each entry has to
    # name the whole set — including itself — or the cluster is ignored.
    alt=""
    if [[ "$CORE_PAGES" == *" $slug "* && "$slug" != "404" ]]; then
      for lrow in "${LOC_ROWS[@]}"; do
        IFS=$'\t' read -r lcode _e _d _s lhref _n _t <<< "$lrow"
        lpre=""; [[ "$lcode" != "en" ]] && lpre="/$lcode"
        lloc="$lpre/"
        [[ "$slug" != "index" ]] && lloc="$lpre/$slug.html"
        alt+="    <xhtml:link rel=\"alternate\" hreflang=\"$lhref\" href=\"$SITE_URL$lloc\"/>"$'\n' 
      done
      dloc="/"
      [[ "$slug" != "index" ]] && dloc="/$slug.html"
      alt+="    <xhtml:link rel=\"alternate\" hreflang=\"x-default\" href=\"$SITE_URL$dloc\"/>"$'\n' 
    fi

    for lrow in "${LOC_ROWS[@]}"; do
      IFS=$'\t' read -r lcode _e _d _s _h _n _t <<< "$lrow"
      lpre=""; [[ "$lcode" != "en" ]] && lpre="${lcode}/"
      # Only English carries the research shelf itself.
      [[ -n "$lpre" && "$CORE_PAGES" != *" $slug "* ]] && continue
      [[ -f "${lpre}${loc:-index.html}" ]] || continue
      printf '  <url>\n'
      printf '    <loc>https://imortek.com.au/%s%s</loc>\n' "$lpre" "$loc"
      printf '    <lastmod>%s</lastmod>\n' "${BUILT%%T*}"
      printf '    <changefreq>%s</changefreq>\n' "$freq"
      printf '    <priority>%s</priority>\n' "$pri"
      [[ -n "$alt" ]] && printf '%s' "$alt"
      printf '  </url>\n'
    done
  done
  printf '</urlset>\n'
} > sitemap.xml
echo "  sitemap: $(grep -c '<loc>' sitemap.xml) URLs, $(grep -c 'xhtml:link' sitemap.xml) alternates"

# Video manifest — the site only requests clips that actually exist here.
mkdir -p assets/video
{
  printf '['
  first=1
  for f in assets/video/*.mp4; do
    [[ -e "$f" ]] || continue
    name="$(basename "$f" .mp4)"
    [[ $first -eq 1 ]] || printf ','
    printf '"%s"' "$name"
    first=0
  done
  printf ']'
} > assets/video/manifest.json
echo "  video manifest: $(cat assets/video/manifest.json)"

echo "Built $count pages at $BUILT"
