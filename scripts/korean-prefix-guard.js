// Korean Prefix Guard — JS-Slash-Runner (Tavern Helper) script
//
// Turns plain Korean lorebook keywords into a regex that only matches when the
// keyword is NOT glued to a preceding Hangul syllable:
//   릴  ->  /(?<![가-힣])릴/i
// so "릴이", "릴보다" still trigger, but "하릴없이", "빠트릴" do not.
//
// UI: a shield icon next to the floating QR button (#qrqs-cont), or above the
// input box if that container doesn't exist. Tapping it opens a small menu:
//   [한글 키워드 앞막기]   convert keywords in the current lorebooks
//   [앞막기 되돌리기]      revert converted keywords back to plain text
//
// Target lorebooks: global + current character (primary/additional) + current chat.

const PW = window.parent;
const D = PW.document;
const notify = PW.toastr;

const IDS = { cont: 'kpg-cont', fab: 'kpg-fab', menu: 'kpg-menu', style: 'kpg-style' };

// ---------- keyword transform ----------
const GUARD_PREFIX = '(?<![가-힣])';
const STARTS_WITH_HANGUL = /^[가-힣]/;
const REGEX_SPECIAL = /[.*+?^${}()|[\]\\/]/g;

const escapeRegex = s => s.replace(REGEX_SPECIAL, '\\$&');
const unescapeRegex = s => s.replace(/\\(.)/g, '$1');

/** plain Korean key -> guarded RegExp; anything else is returned unchanged */
function guardKey(key) {
  if (typeof key !== 'string') return key; // already a regex key
  const k = key.trim();
  if (!STARTS_WITH_HANGUL.test(k)) return key;
  return new RegExp(GUARD_PREFIX + escapeRegex(k), 'i');
}

/** guarded RegExp -> plain key; anything else is returned unchanged */
function unguardKey(key) {
  if (!(key instanceof RegExp)) return key;
  if (!key.source.startsWith(GUARD_PREFIX)) return key;
  const body = key.source.slice(GUARD_PREFIX.length);
  // only revert if the rest is a plain escaped literal (no regex syntax of its own)
  if (/(^|[^\\])[.*+?^${}()|[\]]/.test(body)) return key;
  return unescapeRegex(body);
}

function getTargetWorldbooks() {
  const names = new Set(getGlobalWorldbookNames());
  try {
    const char = getCharWorldbookNames('current');
    if (char.primary) names.add(char.primary);
    char.additional.forEach(n => names.add(n));
  } catch (e) {
    // no character selected (e.g. group chat) — skip
  }
  const chat = getChatWorldbookName('current');
  if (chat) names.add(chat);
  return [...names].filter(Boolean);
}

let busy = false;
async function transformAll(mapKey, label) {
  if (busy) return;
  busy = true;
  try {
    const books = getTargetWorldbooks();
    if (books.length === 0) {
      notify.warning('현재 켜져 있는 로어북이 없어요.', label);
      return;
    }

    let changed = 0;
    for (const book of books) {
      await updateWorldbookWith(
        book,
        worldbook =>
          worldbook.map(entry => {
            const mapList = list =>
              list.map(key => {
                const next = mapKey(key);
                if (next !== key) changed++;
                return next;
              });
            return {
              ...entry,
              strategy: {
                ...entry.strategy,
                keys: mapList(entry.strategy.keys),
                keys_secondary: {
                  ...entry.strategy.keys_secondary,
                  keys: mapList(entry.strategy.keys_secondary.keys),
                },
              },
            };
          }),
        { render: 'immediate' },
      );
    }

    notify.success(`키워드 ${changed}개 변경\n로어북: ${books.join(', ')}`, label);
  } catch (e) {
    console.error('[한글 키워드 앞막기]', e);
    notify.error(String(e?.message ?? e), label);
  } finally {
    busy = false;
  }
}

// ---------- UI (injected into the main ST page) ----------
[IDS.cont, IDS.style].forEach(id => D.getElementById(id)?.remove());

const style = D.createElement('style');
style.id = IDS.style;
style.textContent = `
#${IDS.cont}{position:relative!important;display:flex!important;align-items:center!important;}
#${IDS.cont}.kpg-alone{position:absolute!important;top:0!important;left:4px!important;transform:translateY(calc(-100% - 4px))!important;z-index:1000!important;}
#${IDS.fab}{background:transparent!important;border:none!important;padding:4px 7px!important;cursor:pointer!important;font-size:19px!important;line-height:1!important;color:inherit!important;opacity:.85;-webkit-tap-highlight-color:transparent;touch-action:manipulation;}
#${IDS.menu}{position:absolute!important;bottom:calc(100% + 6px)!important;left:0!important;min-width:180px!important;background:#fff!important;border:1px solid #d8dce6!important;border-radius:12px!important;box-shadow:0 10px 30px rgba(15,23,42,.18)!important;z-index:1001!important;padding:6px!important;display:flex!important;flex-direction:column!important;gap:4px!important;}
#${IDS.menu}.kpg-hide{display:none!important;}
#${IDS.menu} .kpg-title{font-size:11px;color:#94a3b8!important;padding:2px 6px 4px;}
#${IDS.menu} button{all:unset;display:block;padding:9px 10px;border-radius:8px;background:#f4f6fa;color:#1e293b!important;font-size:13px;cursor:pointer;touch-action:manipulation;}
#${IDS.menu} button:active{background:#e2e8f0;}
`;
D.head.appendChild(style);

const cont = D.createElement('div');
cont.id = IDS.cont;
cont.innerHTML = `
  <button id="${IDS.fab}" title="한글 키워드 앞막기"><i class="fa-solid fa-shield-halved"></i></button>
  <div id="${IDS.menu}" class="kpg-hide">
    <div class="kpg-title">현재 켜진 로어북 대상</div>
    <button data-act="apply">한글 키워드 앞막기</button>
    <button data-act="undo">앞막기 되돌리기</button>
  </div>`;
const fab = cont.querySelector(`#${IDS.fab}`);
const menu = cont.querySelector(`#${IDS.menu}`);

const closeMenu = () => menu.classList.add('kpg-hide');
fab.addEventListener('click', e => {
  e.stopPropagation();
  menu.classList.toggle('kpg-hide');
  // keep the menu on screen: open toward the left if it would overflow the right edge
  menu.style.setProperty('left', '0', 'important');
  menu.style.setProperty('right', 'auto', 'important');
  if (menu.getBoundingClientRect().right > PW.innerWidth - 4) {
    menu.style.setProperty('left', 'auto', 'important');
    menu.style.setProperty('right', '0', 'important');
  }
});
menu.addEventListener('click', e => {
  e.stopPropagation();
  const act = e.target?.dataset?.act;
  if (!act) return;
  closeMenu();
  if (act === 'apply') transformAll(guardKey, '앞막기 적용');
  if (act === 'undo') transformAll(unguardKey, '앞막기 되돌리기');
});
const onDocClick = e => {
  if (!cont.contains(e.target)) closeMenu();
};
D.addEventListener('click', onDocClick, true);

/** Put the icon next to the floating QR button, or above the input box. */
function place() {
  const qr = D.getElementById('qrqs-cont');
  if (qr) {
    if (cont.parentElement !== qr) {
      cont.classList.remove('kpg-alone');
      qr.insertBefore(cont, qr.firstChild);
    }
    return true;
  }
  const sf = D.getElementById('send_form');
  if (!sf) return false;
  if (cont.parentElement !== sf) {
    if (PW.getComputedStyle(sf).position === 'static') sf.style.position = 'relative';
    cont.classList.add('kpg-alone');
    sf.appendChild(cont);
  }
  return true;
}

let observer = null;
let placeTimer = null;
function start(tries = 0) {
  if (!place()) {
    if (tries < 20) setTimeout(() => start(tries + 1), 500);
    return;
  }
  const sf = D.getElementById('send_form');
  if (sf && !observer) {
    // re-place when the QR container is added/removed
    observer = new PW.MutationObserver(() => {
      clearTimeout(placeTimer);
      placeTimer = setTimeout(place, 80);
    });
    observer.observe(sf, { childList: true });
  }
}
start();

// remove everything from the ST page when the script is disabled/reloaded
$(window).on('pagehide', () => {
  observer?.disconnect();
  clearTimeout(placeTimer);
  D.removeEventListener('click', onDocClick, true);
  cont.remove();
  style.remove();
});
