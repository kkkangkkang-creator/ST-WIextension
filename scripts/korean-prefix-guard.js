// Korean Prefix Guard — JS-Slash-Runner (Tavern Helper) script
//
// Turns plain Korean lorebook keywords into a regex that only matches when the
// keyword is NOT glued to a preceding Hangul syllable:
//   릴  ->  /(?<![가-힣])릴/i
// so "릴이", "릴보다" still trigger, but "하릴없이", "빠트릴" do not.
//
// Buttons (shown in the Tavern Helper script button bar):
//   [한글 키워드 앞막기]   convert keywords in the current lorebooks
//   [앞막기 되돌리기]      revert converted keywords back to plain text
//
// Target lorebooks: global + current character (primary/additional) + current chat.

const BTN_APPLY = '한글 키워드 앞막기';
const BTN_UNDO = '앞막기 되돌리기';

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

async function transformAll(mapKey, label) {
  const books = getTargetWorldbooks();
  if (books.length === 0) {
    toastr.warning('현재 켜져 있는 로어북이 없어요.');
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

  toastr.success(`${label}: 키워드 ${changed}개 변경 (로어북 ${books.length}개: ${books.join(', ')})`);
}

eventOn(getButtonEvent(BTN_APPLY), () => transformAll(guardKey, '앞막기 적용'));
eventOn(getButtonEvent(BTN_UNDO), () => transformAll(unguardKey, '앞막기 되돌리기'));

appendInexistentScriptButtons([
  { name: BTN_APPLY, visible: true },
  { name: BTN_UNDO, visible: true },
]);
