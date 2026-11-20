/* ==========================================================================
   우리 가족 기록장
   - 모든 기록은 이 기기의 localStorage 에 자동 저장됩니다.
   - 날씨: Open-Meteo (키 없이 쓰는 공개 API). 연결이 안 되면 "날씨 연결 필요"만 표시합니다.
   - 여러 기기 동기화: 설정에서 Firebase Realtime DB 또는 Supabase REST 주소를 넣으면 켜집니다.
   ========================================================================== */
(function () {
  'use strict';

  var TZ = 'Asia/Seoul';
  var STORE_KEY = 'family-diary-v1';
  var WEATHER_CACHE = 'family-diary-weather-v1';

  /* ======================= 작은 도우미 ======================= */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function uid(prefix) { return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  var ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(v) { return String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, function (c) { return ESC_MAP[c]; }); }
  function num(v) { return Number(v || 0).toLocaleString('ko-KR'); }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

  var DOW = ['일', '월', '화', '수', '목', '금', '토'];

  function todayKey() {
    var parts;
    try {
      parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    } catch (e) { parts = null; }
    if (parts) {
      var o = {};
      parts.forEach(function (p) { o[p.type] = p.value; });
      if (o.year && o.month && o.day) return o.year + '-' + o.month + '-' + o.day;
    }
    var d = new Date();
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }
  function parseKey(k) {
    var a = String(k || '').split('-');
    return new Date(Number(a[0]) || 1970, (Number(a[1]) || 1) - 1, Number(a[2]) || 1, 12, 0, 0);
  }
  function keyOf(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function addDays(k, n) { var d = parseKey(k); d.setDate(d.getDate() + n); return keyOf(d); }
  function dowOf(k) { return parseKey(k).getDay(); }
  function weekStart(k) { var d = parseKey(k); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return keyOf(d); }
  function monthKey(k) { return String(k).slice(0, 7); }
  function dateLabel(k) { var d = parseKey(k); return (d.getMonth() + 1) + '월 ' + d.getDate() + '일'; }
  function fullDateLabel(k) { var d = parseKey(k); return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + DOW[d.getDay()] + '요일'; }

  /* 이름 뒤에 붙는 조사 (예준이 / 지우가) */
  function josa(name, pair) {
    var s = String(name || '');
    if (!s) return s;
    var code = s.charCodeAt(s.length - 1);
    if (code < 0xAC00 || code > 0xD7A3) return s + pair.charAt(0);
    var hasJong = (code - 0xAC00) % 28 !== 0;
    return s + (hasJong ? pair.charAt(0) : pair.charAt(1));
  }

  /* ======================= 캐릭터 아이콘 (직접 그린 SVG) ======================= */
  var ICONS = {
    bear: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="16" cy="19" r="7.5" fill="#E9C9A5"/><circle cx="48" cy="19" r="7.5" fill="#E9C9A5"/><circle cx="16" cy="19" r="3.4" fill="#F8DCBE"/><circle cx="48" cy="19" r="3.4" fill="#F8DCBE"/><circle cx="32" cy="35" r="19" fill="#F7E3CB"/><ellipse cx="32" cy="41.5" rx="7.4" ry="5.2" fill="#FBEEDD"/><circle cx="25" cy="32" r="2.4" fill="#4A3B33"/><circle cx="39" cy="32" r="2.4" fill="#4A3B33"/><ellipse cx="32" cy="38.6" rx="2.9" ry="2.1" fill="#D9A883"/><path d="M32 40.8v2.2M32 43c-1.4 1.5-3.3 1.3-4.3.1M32 43c1.4 1.5 3.3 1.3 4.3.1" stroke="#4A3B33" stroke-width="1.6" fill="none" stroke-linecap="round"/><circle cx="19" cy="39.5" r="3.1" fill="#F6B5C0" opacity=".78"/><circle cx="45" cy="39.5" r="3.1" fill="#F6B5C0" opacity=".78"/></svg>',
    rabbit: '<svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="24" cy="15.5" rx="5.6" ry="12" fill="#FDE7EF"/><ellipse cx="40" cy="15.5" rx="5.6" ry="12" fill="#FDE7EF"/><ellipse cx="24" cy="15.5" rx="2.7" ry="8" fill="#FBCFDE"/><ellipse cx="40" cy="15.5" rx="2.7" ry="8" fill="#FBCFDE"/><circle cx="32" cy="38" r="17.5" fill="#FFF6FA"/><circle cx="25.6" cy="36" r="2.3" fill="#5A4740"/><circle cx="38.4" cy="36" r="2.3" fill="#5A4740"/><path d="M32 39.6l-1.9 1.6h3.8z" fill="#F19CB6"/><path d="M30.6 42.4c.9 1.3 2.9 1.3 3.8 0" stroke="#5A4740" stroke-width="1.5" fill="none" stroke-linecap="round"/><circle cx="20" cy="42.5" r="3" fill="#F9B6C8" opacity=".82"/><circle cx="44" cy="42.5" r="3" fill="#F9B6C8" opacity=".82"/></svg>',
    cat: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M15 27L16.5 12.5 29 20.5z" fill="#F6D7B0"/><path d="M49 27L47.5 12.5 35 20.5z" fill="#F6D7B0"/><path d="M18.4 23.6l.8-6.4 5.6 3.8z" fill="#F7BFC9"/><path d="M45.6 23.6l-.8-6.4-5.6 3.8z" fill="#F7BFC9"/><circle cx="32" cy="36" r="18" fill="#FCEBD6"/><circle cx="25.4" cy="34" r="2.3" fill="#5A4740"/><circle cx="38.6" cy="34" r="2.3" fill="#5A4740"/><path d="M32 38.4l-2 1.6h4z" fill="#F19CB6"/><path d="M32 40c0 1.6 1.3 2.4 2.6 1.9M32 40c0 1.6-1.3 2.4-2.6 1.9" stroke="#5A4740" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M14 34.5h5M14 38.5h5M50 34.5h-5M50 38.5h-5" stroke="#D9BFA0" stroke-width="1.3" stroke-linecap="round"/><circle cx="20.5" cy="41" r="2.9" fill="#F7BFC9" opacity=".8"/><circle cx="43.5" cy="41" r="2.9" fill="#F7BFC9" opacity=".8"/></svg>',
    chick: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M30 12c1.5-3 4-4.6 6.4-4.4-1 2.4-1.2 4.4-.4 6.2" fill="#FBD561"/><circle cx="32" cy="35" r="19" fill="#FDE9A6"/><circle cx="25.6" cy="32" r="2.3" fill="#5A4740"/><circle cx="38.4" cy="32" r="2.3" fill="#5A4740"/><path d="M32 37.4l-4.4 2.2 4.4 2.4 4.4-2.4z" fill="#F4A54E"/><circle cx="19.6" cy="39.4" r="3" fill="#F8B3AC" opacity=".8"/><circle cx="44.4" cy="39.4" r="3" fill="#F8B3AC" opacity=".8"/><ellipse cx="32" cy="40" rx="7" ry="6" fill="#FDF3C9"/></svg>',
    dog: '<svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="13.5" cy="34" rx="7" ry="13" fill="#D8B392" transform="rotate(-12 13.5 34)"/><ellipse cx="50.5" cy="34" rx="7" ry="13" fill="#D8B392" transform="rotate(12 50.5 34)"/><circle cx="32" cy="34" r="18.5" fill="#F3DFC4"/><circle cx="25.4" cy="31" r="2.3" fill="#4A3B33"/><circle cx="38.6" cy="31" r="2.3" fill="#4A3B33"/><ellipse cx="32" cy="38" rx="6.6" ry="4.6" fill="#FCF1E0"/><ellipse cx="32" cy="36.4" rx="2.8" ry="2.1" fill="#5A4740"/><path d="M32 38.6v2.2M32 40.8c-.9 1-2.4.9-3.1 0M32 40.8c.9 1 2.4.9 3.1 0" stroke="#5A4740" stroke-width="1.5" fill="none" stroke-linecap="round"/><circle cx="19.8" cy="38.5" r="2.9" fill="#F2AE9E" opacity=".7"/><circle cx="44.2" cy="38.5" r="2.9" fill="#F2AE9E" opacity=".7"/></svg>',
    fox: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 28L15.5 11 28 20z" fill="#F0A774"/><path d="M50 28L48.5 11 36 20z" fill="#F0A774"/><circle cx="32" cy="35" r="18" fill="#F8C79B"/><path d="M14 34c0 9 8 14 18 14s18-5 18-14c0-4-8-6-18-6s-18 2-18 6z" fill="#FDF4EA"/><circle cx="25" cy="31.5" r="2.3" fill="#4A3B33"/><circle cx="39" cy="31.5" r="2.3" fill="#4A3B33"/><ellipse cx="32" cy="39.4" rx="3" ry="2.4" fill="#4A3B33"/><path d="M32 41.8v1.8M32 43.6c-.9.9-2.2.8-2.9 0M32 43.6c.9.9 2.2.8 2.9 0" stroke="#4A3B33" stroke-width="1.5" fill="none" stroke-linecap="round"/><circle cx="19" cy="38" r="2.8" fill="#F5A9A0" opacity=".7"/><circle cx="45" cy="38" r="2.8" fill="#F5A9A0" opacity=".7"/></svg>',
    penguin: '<svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="36" rx="18" ry="19" fill="#5B6E91"/><ellipse cx="32" cy="38" rx="12" ry="14" fill="#FFFFFF"/><circle cx="25.8" cy="31" r="2.2" fill="#3B4A66"/><circle cx="38.2" cy="31" r="2.2" fill="#3B4A66"/><path d="M32 36.5l-3.6 2.4 3.6 2.3 3.6-2.3z" fill="#F2A64B"/><ellipse cx="19" cy="43" rx="3.6" ry="5" fill="#4C5F82" transform="rotate(20 19 43)"/><ellipse cx="45" cy="43" rx="3.6" ry="5" fill="#4C5F82" transform="rotate(-20 45 43)"/><circle cx="22" cy="39" r="2.6" fill="#F5A2B4" opacity=".75"/><circle cx="42" cy="39" r="2.6" fill="#F5A2B4" opacity=".75"/></svg>',
    panda: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="15.5" cy="18" r="8" fill="#4A4040"/><circle cx="48.5" cy="18" r="8" fill="#4A4040"/><circle cx="32" cy="35" r="19" fill="#FFFFFF"/><ellipse cx="24.6" cy="31" rx="5" ry="5.6" fill="#4A4040" transform="rotate(-14 24.6 31)"/><ellipse cx="39.4" cy="31" rx="5" ry="5.6" fill="#4A4040" transform="rotate(14 39.4 31)"/><circle cx="24.8" cy="31" r="2.1" fill="#fff"/><circle cx="39.2" cy="31" r="2.1" fill="#fff"/><ellipse cx="32" cy="40" rx="2.7" ry="2" fill="#4A4040"/><path d="M32 42v1.8M32 43.8c-.9.9-2.1.8-2.8 0M32 43.8c.9.9 2.1.8 2.8 0" stroke="#4A4040" stroke-width="1.5" fill="none" stroke-linecap="round"/><circle cx="18.5" cy="39.5" r="3" fill="#F7B9C4" opacity=".8"/><circle cx="45.5" cy="39.5" r="3" fill="#F7B9C4" opacity=".8"/></svg>'
  };
  var ICON_NAMES = { bear: '곰', rabbit: '토끼', cat: '고양이', chick: '병아리', dog: '강아지', fox: '여우', penguin: '펭귄', panda: '판다' };
  var COLOR_NAMES = { mint: '민트', pink: '분홍', sky: '하늘', butter: '버터', lilac: '라일락' };

  function icon(name) { return ICONS[name] || ICONS.bear; }

  var SVG_GEAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.1"/><path d="M19.3 14.9a1.6 1.6 0 0 0 .3 1.8l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a1.9 1.9 0 1 1-3.8 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a1.9 1.9 0 1 1 0-3.8h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a1.9 1.9 0 1 1 2.7-2.7l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5V3a1.9 1.9 0 1 1 3.8 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1h.2a1.9 1.9 0 1 1 0 3.8h-.1a1.6 1.6 0 0 0-1.5 1z"/></svg>';
  var SVG_SHARE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 16.5L16.5 7.5"/><path d="M10 7.5h6.5V14"/></svg>';
  var SVG_STAR = '<svg class="m-star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.6 5.3 5.9.85-4.25 4.15 1 5.85L12 16.6l-5.25 2.7 1-5.85L3.5 9.35l5.9-.85z" fill="#F4C244"/></svg>';

  /* ======================= 상태 ======================= */
  var DEFAULT_MISSIONS = [
    { id: 'ms1', emoji: '🥕', text: '함께 저녁 준비하기' },
    { id: 'ms2', emoji: '💌', text: '서로에게 고마운 말 한마디 하기' },
    { id: 'ms3', emoji: '🚶', text: '가족과 10분 산책하기' },
    { id: 'ms4', emoji: '📚', text: '함께 책 읽기' },
    { id: 'ms5', emoji: '🧺', text: '거실 정리하기' },
    { id: 'ms6', emoji: '🍚', text: '오늘 고마웠던 일 말하며 밥 먹기' },
    { id: 'ms7', emoji: '📷', text: '가족 사진 한 장 찍기' },
    { id: 'ms8', emoji: '🎲', text: '가족이 좋아하는 놀이 10분 하기' }
  ];

  var REGION_PRESETS = [
    { name: '고양시 일산동구', lat: 37.6584, lon: 126.7710 },
    { name: '고양시 덕양구', lat: 37.6370, lon: 126.8320 },
    { name: '서울', lat: 37.5665, lon: 126.9780 },
    { name: '인천', lat: 37.4563, lon: 126.7052 },
    { name: '부산', lat: 35.1796, lon: 129.0756 },
    { name: '대구', lat: 35.8714, lon: 128.6014 },
    { name: '대전', lat: 36.3504, lon: 127.3845 },
    { name: '광주', lat: 35.1595, lon: 126.8526 },
    { name: '수원', lat: 37.2636, lon: 127.0286 },
    { name: '성남', lat: 37.4200, lon: 127.1265 },
    { name: '평택', lat: 36.9921, lon: 127.1129 },
    { name: '김포', lat: 37.6156, lon: 126.7156 },
    { name: '파주', lat: 37.7599, lon: 126.7800 }
  ];

  function baseSettings() {
    return {
      title: '우리 가족 기록장',
      greeting: '오늘도 함께 기록해요',
      region: '고양시 일산동구',
      lat: 37.6584,
      lon: 126.7710,
      stampMemberId: 'm_yjun',
      stampThreshold: 1,
      sound: true,
      notify: false,
      pinHash: null,
      pinSalt: null,
      sync: { provider: 'none', url: '', key: '', room: 'cho-family', table: 'family_records' }
    };
  }

  function mkTask(memberId, title, repeat, done, day) {
    return {
      id: uid('tk'), memberId: memberId, title: title,
      repeat: repeat, date: repeat === 'once' ? (day || todayKey()) : null,
      done: done || [], createdAt: Date.now()
    };
  }
  function mkStudy(memberId, title, amount, reward, repeat, done, day) {
    return {
      id: uid('st'), memberId: memberId, title: title, amount: amount || '',
      reward: Number(reward) || 0, repeat: repeat || 'daily',
      date: repeat === 'once' ? (day || todayKey()) : null,
      done: done || [], createdAt: Date.now()
    };
  }

  function sampleState() {
    var t = todayKey();
    var y = addDays(t, -1);
    var members = [
      { id: 'm_yjun', name: '예준', role: 'child', icon: 'bear', color: 'mint' },
      { id: 'm_mom', name: '엄마', role: 'parent', icon: 'rabbit', color: 'pink' },
      { id: 'm_dad', name: '아빠', role: 'parent', icon: 'cat', color: 'sky' }
    ];
    var tasks = [
      mkTask('m_yjun', '책 30분 읽기', 'daily', [y, t]),
      mkTask('m_yjun', '양치 3번 하기', 'daily', []),
      mkTask('m_yjun', '내일 준비물 챙기기', 'once', [], t),
      mkTask('m_mom', '설거지 정리하기', 'daily', [t]),
      mkTask('m_mom', '운동 20분 하기', 'daily', []),
      mkTask('m_dad', '분리수거 내놓기', 'daily', []),
      mkTask('m_dad', '예준이 학습 챙기기', 'once', [t], t)
    ];
    var studies = [
      mkStudy('m_yjun', '받아쓰기 연습', '10문제', 100, 'daily', [t]),
      mkStudy('m_yjun', '퀴즈신문', '1장', 100, 'daily', [t]),
      mkStudy('m_yjun', '구몬국어', '4장', 100, 'daily', []),
      mkStudy('m_yjun', '구몬수학', '4장', 100, 'daily', []),
      mkStudy('m_yjun', '책 읽기', '하루분량', 100, 'daily', [y]),
      mkStudy('m_mom', '독서', '20분', 0, 'daily', [t]),
      mkStudy('m_dad', '자격증 공부', '30분', 0, 'daily', [])
    ];
    var rewards = [];
    studies.forEach(function (s) {
      if (Number(s.reward) > 0) {
        s.done.forEach(function (d) {
          rewards.push({
            id: uid('rw'), memberId: s.memberId, studyId: s.id, date: d,
            amount: Number(s.reward), title: s.title, auto: true, createdAt: Date.now()
          });
        });
      }
    });
    var missionByDate = {};
    missionByDate[t] = 'ms1';
    return {
      v: 1,
      updatedAt: Date.now(),
      isSample: true,
      settings: baseSettings(),
      members: members,
      tasks: tasks,
      studies: studies,
      rewards: rewards,
      missions: DEFAULT_MISSIONS.slice(0),
      missionByDate: missionByDate,
      missionDone: {}
    };
  }

  function emptyState() {
    var s = sampleState();
    s.isSample = false;
    s.tasks = [];
    s.studies = [];
    s.rewards = [];
    s.missionByDate = {};
    s.missionDone = {};
    return s;
  }

  function normalize(raw) {
    var s = raw && typeof raw === 'object' ? raw : {};
    var def = baseSettings();
    s.settings = Object.assign({}, def, s.settings || {});
    s.settings.sync = Object.assign({}, def.sync, (s.settings && s.settings.sync) || {});
    if (!Array.isArray(s.members) || s.members.length === 0) {
      s.members = [{ id: 'm_yjun', name: '예준', role: 'child', icon: 'bear', color: 'mint' }];
    }
    s.members = s.members.map(function (m) {
      return {
        id: m.id || uid('m'),
        name: m.name || '이름 없음',
        role: m.role === 'child' ? 'child' : 'parent',
        icon: ICONS[m.icon] ? m.icon : 'bear',
        color: ['mint', 'pink', 'sky', 'butter', 'lilac'].indexOf(m.color) >= 0 ? m.color : 'mint'
      };
    });
    s.tasks = Array.isArray(s.tasks) ? s.tasks.map(function (t) {
      return {
        id: t.id || uid('tk'), memberId: t.memberId, title: t.title || '할 일',
        repeat: t.repeat === 'once' ? 'once' : 'daily',
        date: t.repeat === 'once' ? (t.date || todayKey()) : null,
        done: Array.isArray(t.done) ? t.done.slice(0) : [],
        createdAt: t.createdAt || Date.now()
      };
    }) : [];
    s.studies = Array.isArray(s.studies) ? s.studies.map(function (t) {
      return {
        id: t.id || uid('st'), memberId: t.memberId, title: t.title || '공부',
        amount: t.amount || '', reward: Number(t.reward) || 0,
        repeat: t.repeat === 'once' ? 'once' : 'daily',
        date: t.repeat === 'once' ? (t.date || todayKey()) : null,
        done: Array.isArray(t.done) ? t.done.slice(0) : [],
        createdAt: t.createdAt || Date.now()
      };
    }) : [];
    s.rewards = Array.isArray(s.rewards) ? s.rewards.map(function (r) {
      return {
        id: r.id || uid('rw'), memberId: r.memberId, studyId: r.studyId || null,
        date: r.date || todayKey(), amount: Number(r.amount) || 0,
        title: r.title || '보상', auto: !!r.auto, createdAt: r.createdAt || Date.now()
      };
    }) : [];
    s.missions = Array.isArray(s.missions) && s.missions.length ? s.missions : DEFAULT_MISSIONS.slice(0);
    s.missionByDate = s.missionByDate && typeof s.missionByDate === 'object' ? s.missionByDate : {};
    s.missionDone = s.missionDone && typeof s.missionDone === 'object' ? s.missionDone : {};
    s.v = 1;
    s.updatedAt = Number(s.updatedAt) || Date.now();
    /* 설정이 가리키는 구성원이 사라졌으면 첫 구성원으로 */
    var ids = s.members.map(function (m) { return m.id; });
    if (ids.indexOf(s.settings.stampMemberId) === -1) s.settings.stampMemberId = ids[0];
    return s;
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return sampleState();
      return normalize(JSON.parse(raw));
    } catch (e) {
      return sampleState();
    }
  }

  var state = loadState();
  var ui = { ledgerFilter: 'all', calMonth: monthKey(todayKey()), currentDay: todayKey() };

  /* ======================= 파생 계산 ======================= */
  function memberById(id) {
    for (var i = 0; i < state.members.length; i++) if (state.members[i].id === id) return state.members[i];
    return null;
  }
  function visibleOn(item, day) {
    if (item.repeat === 'daily') return true;
    return item.date === day;
  }
  function tasksOf(memberId, day) {
    return state.tasks.filter(function (t) { return t.memberId === memberId && visibleOn(t, day); });
  }
  function studiesOf(memberId, day) {
    return state.studies.filter(function (s) { return s.memberId === memberId && visibleOn(s, day); });
  }
  function doneOn(item, day) { return item.done.indexOf(day) !== -1; }
  function countsFor(memberId, day) {
    var ts = tasksOf(memberId, day), ss = studiesOf(memberId, day);
    var tDone = ts.filter(function (t) { return doneOn(t, day); }).length;
    var sDone = ss.filter(function (s) { return doneOn(s, day); }).length;
    return {
      tTotal: ts.length, tDone: tDone, sTotal: ss.length, sDone: sDone,
      total: ts.length + ss.length, done: tDone + sDone
    };
  }
  function studyTotals(day) {
    var total = 0, done = 0;
    state.members.forEach(function (m) {
      var c = countsFor(m.id, day);
      total += c.sTotal; done += c.sDone;
    });
    return { total: total, done: done };
  }
  function starCount(memberId) {
    var n = 0;
    state.tasks.forEach(function (t) { if (t.memberId === memberId) n += t.done.length; });
    state.studies.forEach(function (s) { if (s.memberId === memberId) n += s.done.length; });
    return n;
  }
  function rewardTotal(memberId) {
    return state.rewards.reduce(function (sum, r) {
      return sum + (r.memberId === memberId ? Number(r.amount || 0) : 0);
    }, 0);
  }
  function completedCountOn(memberId, day) {
    var n = 0;
    state.tasks.forEach(function (t) { if (t.memberId === memberId && t.done.indexOf(day) !== -1) n++; });
    state.studies.forEach(function (s) { if (s.memberId === memberId && s.done.indexOf(day) !== -1) n++; });
    return n;
  }
  /* 도장: 실제 완료 기록에서 매번 다시 계산 (완료를 취소하면 도장도 사라짐) */
  function stampSet() {
    var mid = state.settings.stampMemberId;
    var threshold = clamp(Number(state.settings.stampThreshold) || 1, 1, 20);
    var days = {};
    state.tasks.forEach(function (t) { if (t.memberId === mid) t.done.forEach(function (d) { days[d] = true; }); });
    state.studies.forEach(function (s) { if (s.memberId === mid) s.done.forEach(function (d) { days[d] = true; }); });
    var out = {};
    Object.keys(days).forEach(function (d) {
      if (completedCountOn(mid, d) >= threshold) out[d] = true;
    });
    return out;
  }
  function streakCount(set) {
    var t = todayKey();
    var k = set[t] ? t : addDays(t, -1);
    var n = 0;
    while (set[k] && n < 5000) { n++; k = addDays(k, -1); }
    return n;
  }
  function monthStampCount(set, mk) {
    var n = 0;
    Object.keys(set).forEach(function (d) { if (monthKey(d) === mk) n++; });
    return n;
  }
  function missionToday() {
    var t = todayKey();
    var id = state.missionByDate[t];
    var found = null;
    state.missions.forEach(function (m) { if (m.id === id) found = m; });
    return found;
  }
  function missionDoneCount() { return Object.keys(state.missionDone).length; }
  function pickMission(excludeId) {
    var pool = state.missions.filter(function (m) { return m.id !== excludeId; });
    if (!pool.length) pool = state.missions;
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function ensureTodayMission() {
    var t = todayKey();
    if (!state.missionByDate[t] && state.missions.length) {
      var last = state.missionByDate[addDays(t, -1)];
      var pick = pickMission(last) || state.missions[0];
      state.missionByDate[t] = pick.id;
      save({ noSync: true });
    }
  }
  function ledgerList() {
    var list = state.rewards.slice(0);
    if (ui.ledgerFilter !== 'all') {
      list = list.filter(function (r) { return r.memberId === ui.ledgerFilter; });
    }
    list.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
    return list;
  }

  /* ======================= 저장 / 동기화 ======================= */
  var pushTimer = null;
  function save(opts) {
    opts = opts || {};
    state.updatedAt = Date.now();
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* 저장 공간 부족 등 */ }
    if (!opts.noSync) schedulePush();
    renderFoot();
  }
  function schedulePush() {
    if (!syncEnabled()) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(function () { pushRemote(); }, 1200);
  }

  var syncStatus = { state: 'local', at: 0, message: '' };
  function syncCfg() { return state.settings.sync ||
    { provider: 'none', url: '', key: '', room: 'cho-family', table: 'family_records' }; }
  function syncEnabled() { var c = syncCfg(); return c.provider !== 'none' && !!c.url; }

  function syncEndpoint() {
    var c = syncCfg();
    var base = String(c.url || '').replace(/\/+$/, '');
    var room = c.room || 'family';
    if (c.provider === 'firebase') {
      return { url: base + '/' + encodeURIComponent(room) + '.json', kind: 'firebase' };
    }
    var table = c.table || 'family_records';
    return {
      url: base + '/rest/v1/' + encodeURIComponent(table) + '?room=eq.' + encodeURIComponent(room) + '&select=*',
      kind: 'supabase', table: table, room: room
    };
  }

  function setSyncStatus(s, msg) {
    syncStatus.state = s;
    syncStatus.message = msg || '';
    syncStatus.at = Date.now();
    renderFoot();
  }

  function pushRemote() {
    if (!syncEnabled()) return;
    var ep = syncEndpoint();
    var cfg = syncCfg();
    var payload = JSON.parse(JSON.stringify(state));
    var headers = { 'Content-Type': 'application/json' };
    var url = ep.url;
    var opts = { method: 'PUT', headers: headers, body: JSON.stringify(payload) };
    if (ep.kind === 'firebase') {
      opts = { method: 'PUT', headers: headers, body: JSON.stringify(payload) };
    } else {
      headers.apikey = cfg.key || '';
      headers.Authorization = 'Bearer ' + (cfg.key || '');
      headers.Prefer = 'resolution=merge-duplicates,return=minimal';
      url = String(cfg.url || '').replace(/\/+$/, '') + '/rest/v1/' + encodeURIComponent(ep.table);
      opts = {
        method: 'POST', headers: headers,
        body: JSON.stringify({ room: ep.room, data: payload, updated_at: new Date(payload.updatedAt).toISOString() })
      };
    }
    setSyncStatus('wait');
    fetch(url, opts).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      setSyncStatus('ok');
    }).catch(function (err) {
      setSyncStatus('error', String(err && err.message ? err.message : err));
    });
  }

  function pullRemote(silent) {
    if (!syncEnabled()) return;
    var ep = syncEndpoint();
    var headers = {};
    if (ep.kind === 'supabase') {
      headers.apikey = syncCfg().key || '';
      headers.Authorization = 'Bearer ' + (syncCfg().key || '');
    }
    fetch(ep.url, { method: 'GET', headers: headers, cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (data) {
      var remote = null;
      if (ep.kind === 'firebase') remote = data;
      else if (Array.isArray(data) && data.length) remote = data[0].data;
      else if (data && data.data) remote = data.data;
      if (!remote || !remote.members) { setSyncStatus('ok'); return; }
      var rTime = Number(remote.updatedAt) || 0;
      if (rTime > Number(state.updatedAt || 0) + 800) {
        state = normalize(remote);
        try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* 무시 */ }
        render();
        setSyncStatus('ok');
        toast('다른 기기의 기록을 불러왔어요');
      } else {
        setSyncStatus('ok');
        if (Number(state.updatedAt || 0) > rTime + 800) pushRemote();
      }
    }).catch(function (err) {
      setSyncStatus('error', String(err && err.message ? err.message : err));
      if (!silent) toast('동기화하지 못했어요. 기록은 이 기기에 저장돼요');
    });
  }

  var syncPoll = null;
  function startSync() {
    if (syncPoll) { clearInterval(syncPoll); syncPoll = null; }
    if (!syncEnabled()) { syncStatus.state = 'local'; renderFoot(); return; }
    pullRemote(true);
    syncPoll = setInterval(function () {
      if (document.visibilityState === 'visible') pullRemote(true);
    }, 8000);
  }

  /* ======================= 날씨 ======================= */
  var weather = { status: 'idle', data: null, reason: '' };

  function weatherInfo(code) {
    var c = Number(code);
    if (c === 0) return { emoji: '☀️', text: '맑음' };
    if (c === 1) return { emoji: '🌤️', text: '대체로 맑음' };
    if (c === 2) return { emoji: '⛅️', text: '구름 조금' };
    if (c === 3) return { emoji: '☁️', text: '흐림' };
    if (c === 45 || c === 48) return { emoji: '🌫️', text: '안개' };
    if (c >= 51 && c <= 57) return { emoji: '🌦️', text: '이슬비' };
    if (c >= 61 && c <= 67) return { emoji: '🌧️', text: '비' };
    if (c >= 71 && c <= 77) return { emoji: '🌨️', text: '눈' };
    if (c >= 80 && c <= 82) return { emoji: '🌧️', text: '소나기' };
    if (c === 85 || c === 86) return { emoji: '❄️', text: '눈' };
    if (c >= 95) return { emoji: '⛈️', text: '천둥번개' };
    return { emoji: '🌥️', text: '구름' };
  }
  function pm10Grade(v) {
    if (v === null || v === undefined) return null;
    if (v <= 30) return { label: '미세먼지 좋음', cls: 'good' };
    if (v <= 80) return { label: '미세먼지 보통', cls: 'normal' };
    if (v <= 150) return { label: '미세먼지 나쁨', cls: 'bad' };
    return { label: '미세먼지 매우나쁨', cls: 'verybad' };
  }
  function pm25Grade(v) {
    if (v === null || v === undefined) return null;
    if (v <= 15) return { label: '초미세먼지 좋음', cls: 'good' };
    if (v <= 35) return { label: '초미세먼지 보통', cls: 'normal' };
    if (v <= 75) return { label: '초미세먼지 나쁨', cls: 'bad' };
    return { label: '초미세먼지 매우나쁨', cls: 'verybad' };
  }

  function cacheWeather() {
    try {
      localStorage.setItem(WEATHER_CACHE, JSON.stringify({
        at: Date.now(), lat: state.settings.lat, lon: state.settings.lon, data: weather.data
      }));
    } catch (e) { /* 무시 */ }
  }
  function readWeatherCache() {
    try {
      var raw = localStorage.getItem(WEATHER_CACHE);
      if (!raw) return null;
      var c = JSON.parse(raw);
      if (!c || !c.data) return null;
      if (Number(c.lat) !== Number(state.settings.lat) || Number(c.lon) !== Number(state.settings.lon)) return null;
      if (Date.now() - Number(c.at) > 20 * 60 * 1000) return null;
      return c;
    } catch (e) { return null; }
  }

  function fetchWeather(force) {
    if (!state.settings.lat || !state.settings.lon) {
      weather = { status: 'error', reason: 'region', data: null };
      renderWeather();
      return;
    }
    if (!navigator.onLine) {
      weather = { status: 'error', reason: 'offline', data: null };
      renderWeather();
      return;
    }
    if (!force) {
      var cached = readWeatherCache();
      if (cached) {
        weather = { status: 'ok', data: cached.data, reason: '' };
        renderWeather();
        return;
      }
    }
    weather = { status: 'loading', data: null, reason: '' };
    renderWeather();

    var lat = state.settings.lat, lon = state.settings.lon;
    var fc = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
      '&current=temperature_2m,weather_code&daily=temperature_2m_min,temperature_2m_max' +
      '&timezone=Asia%2FSeoul&forecast_days=1';
    var aq = 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + lat + '&longitude=' + lon +
      '&current=pm10,pm2_5&timezone=Asia%2FSeoul';

    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timerId = setTimeout(function () { if (ctrl) ctrl.abort(); }, 8000);
    var opt = ctrl ? { signal: ctrl.signal, cache: 'no-store' } : { cache: 'no-store' };

    var pWeather = fetch(fc, opt).then(function (r) {
      if (!r.ok) throw new Error('weather ' + r.status);
      return r.json();
    });
    var pAir = fetch(aq, opt).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });

    Promise.all([pWeather, pAir]).then(function (res) {
      clearTimeout(timerId);
      var d = res[0] || {};
      var cur = d.current || {};
      var daily = d.daily || {};
      var air = res[1] && res[1].current ? res[1].current : null;
      if (cur.temperature_2m === undefined || cur.temperature_2m === null) throw new Error('no data');
      weather = {
        status: 'ok',
        reason: '',
        data: {
          temp: Math.round(cur.temperature_2m),
          code: cur.weather_code,
          min: daily.temperature_2m_min ? Math.round(daily.temperature_2m_min[0]) : null,
          max: daily.temperature_2m_max ? Math.round(daily.temperature_2m_max[0]) : null,
          pm10: air ? air.pm10 : null,
          pm25: air ? air.pm2_5 : null,
          region: state.settings.region,
          at: Date.now()
        }
      };
      cacheWeather();
      renderWeather();
    }).catch(function () {
      clearTimeout(timerId);
      weather = { status: 'error', data: null, reason: 'fail' };
      renderWeather();
    });
  }

  function renderWeather() {
    var slot = $('#weather-slot');
    if (!slot) return;
    var region = state.settings.region || '지역 미설정';
    var html = '';

    if (weather.status === 'ok' && weather.data) {
      var d = weather.data;
      var info = weatherInfo(d.code);
      var g10 = pm10Grade(d.pm10);
      var g25 = pm25Grade(d.pm25);
      html += '<div class="card card--sky weather">';
      html += '<div class="w-main">';
      html += '<span class="w-emoji">' + info.emoji + '</span>';
      html += '<span class="w-temp">' + d.temp + '°</span>';
      html += '<span class="w-desc">' + info.text + '</span>';
      if (d.min !== null && d.max !== null) {
        html += '<span class="w-range">최저 <b>' + d.min + '°</b> · 최고 <b>' + d.max + '°</b></span>';
      }
      html += '</div>';
      html += '<div class="w-tags">';
      if (g10) html += '<span class="chip chip--' + g10.cls + '">' + g10.label + '</span>';
      if (g25) html += '<span class="chip chip--' + g25.cls + '">' + g25.label + '</span>';
      if (!g10 && !g25) html += '<span class="chip">미세먼지 정보 없음</span>';
      html += '<button class="w-region" data-action="open-settings">📍 ' + esc(region) + ' · 바꾸기</button>';
      html += '</div></div>';
    } else if (weather.status === 'loading') {
      html += '<div class="card card--sky weather"><div class="w-loading"><span class="spinner"></span>날씨를 확인하고 있어요</div></div>';
    } else {
      var note = '설정에서 지역을 확인하고 다시 불러와 주세요.';
      if (weather.reason === 'offline') note = '인터넷이 연결되면 다시 불러올 수 있어요.';
      if (weather.reason === 'region') note = '설정에서 사는 지역을 먼저 정해 주세요.';
      html += '<div class="card card--sky weather">';
      html += '<div class="weather-off">';
      html += '<span class="w-emoji">🌥️</span><span class="w-off-text">날씨 연결 필요</span>';
      html += '<button class="btn btn--sm" data-action="refresh-weather">다시 확인</button>';
      html += '<span class="w-off-note">' + esc(note) + ' 실제 날씨를 받아오지 못하면 숫자를 지어내지 않아요.</span>';
      html += '</div></div>';
    }
    slot.innerHTML = html;
  }

  /* ======================= 렌더링 ======================= */
  function render() {
    ui.currentDay = todayKey();
    ensureTodayMission();
    renderHeader();
    renderWeather();
    renderFamily();
    renderTasks();
    renderStudy();
    renderStamp();
    renderMission();
    renderSavings();
    renderFoot();
    paintTimer();
  }

  function renderHeader() {
    var s = state.settings;
    var t = todayKey();
    var words = String(s.title || '우리 가족 기록장').split(' ');
    var tail = words.length > 1 ? words.pop() : '';
    var head = words.join(' ');
    var titleHtml = (head ? esc(head) + ' ' : '') + (tail ? '<span class="pink">' + esc(tail) + '</span>' : '');

    var html = '<div class="topbar">';
    html += '<div class="brand">';
    html += '<div class="brand-row"><span class="brand-icon">' + ICONS.bear + '</span><h1>' + titleHtml + '</h1></div>';
    html += '<div class="date-line">' + fullDateLabel(t) + '</div>';
    html += '</div>';
    html += '<div class="top-actions">';
    html += '<button class="icon-btn" data-action="open-settings" aria-label="설정">' + SVG_GEAR + '</button>';
    html += '<button class="icon-btn" data-action="open-share" aria-label="가족과 공유">' + SVG_SHARE + '</button>';
    html += '</div></div>';
    html += '<div class="head-sub">';
    if (state.isSample) {
      html += '<span class="sample-badge" data-action="open-reset">✳️ 예시 데이터 · 눌러서 초기화</span>';
    } else {
      html += '<span></span>';
    }
    html += '<span class="greet-chip">✨ ' + esc(s.greeting) + '</span></div>';
    $('#header').innerHTML = html;
  }

  function renderFamily() {
    var t = todayKey();
    var html = '<div class="card card--mint family">';
    state.members.forEach(function (m) {
      var c = countsFor(m.id, t);
      var pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
      html += '<div class="member-card">';
      html += '<span class="avatar tint-' + m.color + '">' + icon(m.icon) + '</span>';
      html += '<div class="m-info">';
      html += '<div class="m-name">' + esc(m.name) + '<span class="role-tag">' + (m.role === 'child' ? '아이' : '보호자') + '</span></div>';
      html += '<div class="m-sub"><span>오늘 <b>' + c.done + '/' + c.total + '</b> 완료</span>';
      html += '<span>할 일 ' + c.tDone + '/' + c.tTotal + ' · 공부 ' + c.sDone + '/' + c.sTotal + '</span></div>';
      html += '<div class="m-bar"><i style="width:' + pct + '%"></i></div>';
      html += '</div>';
      html += '<div class="m-stats">';
      html += '<div class="m-stat">' + SVG_STAR + ' <b>' + num(starCount(m.id)) + '</b></div>';
      html += '<div class="m-stat m-stat--money">🐷 <b>' + num(rewardTotal(m.id)) + '원</b></div>';
      html += '</div></div>';
    });
    html += '<button class="add-inline" data-action="open-settings">+ 가족 구성원 관리</button>';
    html += '</div>';
    $('#family-slot').innerHTML = html;
  }

  function renderTasks() {
    var t = todayKey();
    var html = '<div class="card card--butter">';
    html += '<div class="sec-head">';
    html += '<div><div class="sec-title"><span class="emo">✅</span>오늘 할 일</div>';
    html += '<div class="sec-sub">' + state.members.map(function (m) { return esc(m.name); }).join(' · ') + '가 각자 할 일을 체크해요</div></div>';
    html += '<div class="sec-head-actions"><button class="btn btn--sm" data-action="add-task">+ 할 일 추가</button></div>';
    html += '</div>';

    state.members.forEach(function (m) {
      var c = countsFor(m.id, t);
      var list = tasksOf(m.id, t);
      html += '<div class="task-group">';
      html += '<div class="tg-head">';
      html += '<span class="avatar avatar--sm tint-' + m.color + '">' + icon(m.icon) + '</span>';
      html += '<div><div class="tg-name">' + esc(m.name) + '</div>';
      html += '<div class="tg-sub"><b>' + c.tDone + '</b>/' + c.tTotal + '개 완료</div></div>';
      html += '</div>';
      html += '<div class="tg-list">';
      if (!list.length) {
        html += '<div class="empty">아직 할 일이 없어요. 아래에서 추가해 보세요.</div>';
      }
      list.forEach(function (task) {
        var done = doneOn(task, t);
        html += '<div class="task-row' + (done ? ' done' : '') + '">';
        html += '<button class="check' + (done ? ' on' : '') + '" data-action="toggle-task" data-id="' + task.id + '" aria-label="완료 ' + (done ? '취소' : '표시') + '">✓</button>';
        html += '<div class="task-main"><div class="task-title">' + esc(task.title) + '</div>';
        html += '<div class="task-meta"><span class="tag' + (task.repeat === 'once' ? ' tag--once' : '') + '">' + (task.repeat === 'daily' ? '매일' : '오늘만') + '</span></div></div>';
        html += '<div class="task-actions">';
        html += '<button class="mini-btn" data-action="edit-task" data-id="' + task.id + '" aria-label="수정">✏️</button>';
        html += '<button class="mini-btn mini-btn--danger" data-action="del-task" data-id="' + task.id + '" aria-label="삭제">✕</button>';
        html += '</div></div>';
      });
      html += '</div>';
      html += '<button class="add-inline" data-action="add-task" data-id="' + m.id + '">+ ' + josa(m.name, '이가').replace(/[이가]$/, '') + ' 할 일 추가</button>';
      html += '</div>';
    });
    html += '</div>';
    $('#tasks-slot').innerHTML = html;
  }

  function renderStudy() {
    var t = todayKey();
    var totals = studyTotals(t);
    var pct = totals.total ? Math.round((totals.done / totals.total) * 100) : 0;

    var html = '<div class="card card--sky">';
    html += '<div class="sec-head">';
    html += '<div><div class="sec-title"><span class="emo">📚</span>오늘의 공부 플랜</div>';
    html += '<div class="sec-sub">항목마다 분량을 적고, 아이 항목에는 보상 금액을 정할 수 있어요. 고정 항목은 매일 아침 다시 올라와요.</div></div>';
    html += '<div class="sec-head-actions"><button class="btn btn--sm" data-action="add-study">+ 공부 추가</button></div>';
    html += '</div>';

    html += '<div class="progress-block"><div class="progress-top"><span class="label">전체 진행</span>';
    html += '<span class="count">' + totals.done + ' / ' + totals.total + ' 완료</span></div>';
    html += '<div class="progress"><i style="width:' + pct + '%"></i></div></div>';

    state.members.forEach(function (m) {
      var ss = studiesOf(m.id, t);
      if (!ss.length) return;
      var c = countsFor(m.id, t);
      var mp = c.sTotal ? Math.round((c.sDone / c.sTotal) * 100) : 0;
      html += '<div class="study-group">';
      html += '<div class="sg-head">';
      html += '<span class="avatar avatar--xs tint-' + m.color + '">' + icon(m.icon) + '</span>';
      html += '<div class="tg-name">' + esc(m.name) + '</div>';
      html += '<div class="sg-bar"><div class="progress progress--mini"><i style="width:' + mp + '%"></i></div></div>';
      html += '<div class="sg-count">' + c.sDone + '/' + c.sTotal + '</div>';
      html += '</div>';
      ss.forEach(function (s) {
        var done = doneOn(s, t);
        html += '<div class="study-row' + (done ? ' done' : '') + '">';
        html += '<button class="check check--sky' + (done ? ' on' : '') + '" data-action="toggle-study" data-id="' + s.id + '" aria-label="완료 ' + (done ? '취소' : '표시') + '">✓</button>';
        html += '<div class="task-main"><div class="task-title">' + esc(s.title) + '</div>';
        html += '<div class="task-meta">';
        if (s.amount) html += '<span class="tag tag--amount">' + esc(s.amount) + '</span>';
        if (Number(s.reward) > 0) html += '<span class="tag tag--reward">🐷 ' + num(s.reward) + '원</span>';
        html += '<span class="tag' + (s.repeat === 'once' ? ' tag--once' : '') + '">' + (s.repeat === 'daily' ? '📌 매일' : '오늘만') + '</span>';
        html += '</div></div>';
        html += '<div class="task-actions">';
        html += '<button class="mini-btn" data-action="edit-study" data-id="' + s.id + '" aria-label="수정">✏️</button>';
        html += '<button class="mini-btn mini-btn--danger" data-action="del-study" data-id="' + s.id + '" aria-label="삭제">✕</button>';
        html += '</div></div>';
      });
      html += '</div>';
    });

    html += timerHtml();
    html += '</div>';
    $('#study-slot').innerHTML = html;
  }

  function timerHtml() {
    var html = '<div class="timer" id="timer-box">';
    html += '<div class="timer-modes">';
    html += '<button class="timer-mode' + (timer.mode === 'down' ? ' on' : '') + '" data-action="timer-mode" data-id="down">⏳ 남은 시간</button>';
    html += '<button class="timer-mode' + (timer.mode === 'up' ? ' on' : '') + '" data-action="timer-mode" data-id="up">⏱️ 재는 시간</button>';
    html += '</div>';
    html += '<div class="timer-hint" id="timer-hint">' + timerHint() + '</div>';
    html += '<div class="timer-digits' + (timer.finished ? ' ended' : '') + '" id="timer-digits">' + timerDisplay() + '</div>';
    html += '<div class="timer-btns">';
    html += '<button class="btn btn--primary" data-action="timer-toggle" id="timer-primary">' + timerPrimaryLabel() + '</button>';
    html += '<button class="btn" data-action="timer-reset">↺ 초기화</button>';
    html += '</div>';
    if (timer.mode === 'down') {
      html += '<div class="timer-presets">';
      [10, 20, 30].forEach(function (m) {
        html += '<button class="preset' + (timer.minutes === m ? ' on' : '') + '" data-action="timer-preset" data-id="' + m + '">' + m + '분</button>';
      });
      html += '</div>';
      html += '<div class="custom-row"><input id="timer-custom" type="number" inputmode="numeric" min="1" max="180" placeholder="직접 입력" value="">';
      html += '<button class="btn btn--sm" data-action="timer-custom">분 맞추기</button></div>';
    } else {
      html += '<div class="timer-presets"><span class="help">재는 시간은 00:00부터 올라가요. 공부가 끝나면 일시정지를 눌러 시간을 확인해 보세요.</span></div>';
    }
    html += '</div>';
    return html;
  }

  function timerDisplay() {
    if (timer.mode === 'down') {
      var ms = timer.running ? Math.max(0, timer.endAt - Date.now()) : timer.remainMs;
      var sec = Math.ceil(ms / 1000);
      if (sec < 0) sec = 0;
      return p2(Math.floor(sec / 60)) + ':' + p2(sec % 60);
    }
    var e = timer.running ? timer.base + (Date.now() - timer.startAt) : timer.elapsedMs;
    var s = Math.floor(e / 1000);
    return p2(Math.floor(s / 60)) + ':' + p2(s % 60);
  }
  function timerHint() {
    if (timer.mode === 'down') {
      if (timer.running) return timer.minutes + '분 타이머가 돌아가고 있어요';
      if (timer.remainMs > 0 && timer.remainMs < timer.minutes * 60000) return '잠시 멈췄어요. 이어하기를 눌러 주세요';
      if (timer.finished) return '시간이 다 됐어요. 초기화를 누르면 다시 시작할 수 있어요';
      return timer.minutes + '분 · 시작을 눌러요';
    }
    if (timer.running) return '공부한 시간을 재는 중이에요';
    if (timer.elapsedMs > 0) return '잰 시간을 멈췄어요';
    return '시작을 누르면 00:00부터 올라가요';
  }
  function timerPrimaryLabel() {
    if (timer.running) return '⏸ 일시정지';
    if (timer.mode === 'down') {
      if (timer.finished || timer.remainMs <= 0) return '▶ 다시 시작';
      if (timer.remainMs < timer.minutes * 60000) return '▶ 이어하기';
      return '▶ 시작';
    }
    return timer.elapsedMs > 0 ? '▶ 이어하기' : '▶ 시작';
  }

  function renderStamp() {
    var s = state.settings;
    var child = memberById(s.stampMemberId) || state.members[0];
    var set = stampSet();
    var t = todayKey();
    var start = weekStart(t);
    var streak = streakCount(set);
    var monthCount = monthStampCount(set, monthKey(t));

    var html = '<div class="card card--pink stamp-card">';
    html += '<div class="sec-head">';
    html += '<div class="sec-title"><span class="avatar avatar--xs tint-' + child.color + '">' + icon(child.icon) + '</span>';
    html += josa(child.name, '이가') + ' 도장판</div>';
    html += '<span class="streak-chip">🔥 ' + streak + '일 연속</span>';
    html += '</div>';
    html += '<div class="sec-sub">' + esc(child.name) + '가 그날 할 일이나 공부를 ' + (Number(s.stampThreshold) || 1) + '개 이상 마치면 도장이 하나 찍혀요.</div>';

    html += '<div class="week">';
    for (var i = 0; i < 7; i++) {
      var dk = addDays(start, i);
      var isToday = dk === t;
      html += '<div class="day' + (isToday ? ' today' : '') + '">';
      html += '<div class="day-label">' + DOW[dowOf(dk)] + '</div>';
      html += '<div class="stamp-slot' + (set[dk] ? ' stamped' : '') + '">' + (set[dk] ? icon(child.icon) : '') + '</div>';
      html += '</div>';
    }
    html += '</div>';

    html += '<div class="stamp-foot">';
    html += '<span class="stamp-count">이번 달 <b>' + monthCount + '개</b>' + (set[t] ? ' · 오늘 찍음' : '') + '</span>';
    html += '<button class="btn" data-action="open-calendar">📅 달력 보기</button>';
    html += '</div>';
    html += '</div>';
    $('#stamp-slot').innerHTML = html;
  }

  function renderMission() {
    var t = todayKey();
    var m = missionToday();
    var total = missionDoneCount();
    var doneToday = !!(m && state.missionDone[t] === m.id);

    var html = '<div class="card card--butter">';
    html += '<div class="sec-head">';
    html += '<div class="sec-title"><span class="emo">🎲</span>오늘의 가족 미션</div>';
    html += '<span class="streak-chip">함께 ' + total + '번</span>';
    html += '</div>';
    if (m) {
      html += '<span class="mission-emoji">' + (m.emoji || '🎲') + '</span>';
      html += '<div class="mission-text">' + esc(m.text) + '</div>';
      if (doneToday) html += '<div class="mission-done-mark">✓ 오늘 함께 했어요 · ' + dateLabel(t) + '</div>';
      html += '<div class="mission-btns">';
      html += '<button class="btn btn--primary" data-action="mission-done">' + (doneToday ? '✓ 오늘 완료 · 취소' : '✓ 다 같이 했어요') + '</button>';
      html += '<button class="btn" data-action="mission-shuffle">🔄 다른 미션 뽑기</button>';
      html += '</div>';
    } else {
      html += '<div class="empty">미션이 아직 없어요. 미션을 추가해 보세요.</div>';
    }
    html += '<div class="mission-note"><span>가족이 다 함께 하는 가벼운 미션이에요. 하루에 한 번 가볍게 해 봐요.</span>';
    html += '<button class="link-btn" data-action="mission-manage">미션 관리</button></div>';
    html += '</div>';
    $('#mission-slot').innerHTML = html;
  }

  function renderSavings() {
    var total = 0;
    state.members.forEach(function (m) { total += rewardTotal(m.id); });
    var child = memberById(state.settings.stampMemberId) || state.members[0];
    var list = ledgerList();

    var html = '<div class="card card--lilac">';
    html += '<div class="sec-head">';
    html += '<div><div class="sec-title"><span class="emo">🐷</span>저금통과 기록</div>';
    html += '<div class="sec-sub">공부를 마치면 정한 금액이 저금통에 쌓여요. 실제 결제나 송금 없이 가족끼리 정한 약속을 적어 두는 곳이에요.</div></div>';
    html += '</div>';

    html += '<div class="piggy-top">';
    html += '<span class="piggy-total">' + num(total) + '원</span>';
    html += '<span class="piggy-sub">' + state.members.map(function (m) { return esc(m.name) + ' ' + num(rewardTotal(m.id)) + '원'; }).join(' · ') + '</span>';
    html += '</div>';

    html += '<div class="filter-row">';
    html += '<button class="filter' + (ui.ledgerFilter === 'all' ? ' on' : '') + '" data-action="ledger-filter" data-id="all">전체</button>';
    state.members.forEach(function (m) {
      html += '<button class="filter' + (ui.ledgerFilter === m.id ? ' on' : '') + '" data-action="ledger-filter" data-id="' + m.id + '">' + esc(m.name) + '</button>';
    });
    html += '<button class="filter filter--add" data-action="add-reward">+ 내역 추가</button>';
    html += '</div>';

    if (!list.length) {
      html += '<div class="empty">아직 보상 내역이 없어요.</div>';
    } else {
      html += '<div class="ledger">';
      list.slice(0, 60).forEach(function (r) {
        var m = memberById(r.memberId);
        html += '<div class="ledger-row">';
        html += '<span class="avatar avatar--xs tint-' + (m ? m.color : 'butter') + '">' + icon(m ? m.icon : 'bear') + '</span>';
        html += '<div class="ledger-main">';
        html += '<div class="ledger-title">' + esc(r.title) + '</div>';
        html += '<div class="ledger-sub">' + dateLabel(r.date) + ' · ' + esc(m ? m.name : '가족') + (r.auto ? ' · 공부 완료' : ' · 직접 적음') + '</div>';
        html += '</div>';
        html += '<span class="ledger-amount">' + num(r.amount) + '원</span>';
        html += '<div class="task-actions">';
        html += '<button class="mini-btn" data-action="edit-reward" data-id="' + r.id + '" aria-label="수정">✏️</button>';
        html += '<button class="mini-btn mini-btn--danger" data-action="del-reward" data-id="' + r.id + '" aria-label="삭제">✕</button>';
        html += '</div></div>';
      });
      html += '</div>';
      if (list.length > 60) html += '<div class="ledger-note">최근 60개만 보여요. 전체 내역은 내보내기로 확인할 수 있어요.</div>';
    }
    html += '<div class="ledger-note">보호자가 내역을 고치거나 직접 더할 수 있어요. 공부 완료를 취소하면 그 보상도 함께 사라져요.</div>';
    html += '</div>';
    $('#savings-slot').innerHTML = html;
  }

  function syncLabel() {
    if (!syncEnabled()) return { dot: '', text: '로컬 저장 모드 · 이 기기에만 기록돼요' };
    if (syncStatus.state === 'ok') return { dot: 'ok', text: '가족과 동기화됨 · ' + new Date().toTimeString().slice(0, 5) };
    if (syncStatus.state === 'wait') return { dot: 'wait', text: '동기화하는 중이에요' };
    if (syncStatus.state === 'error') return { dot: 'err', text: '동기화 오류 · 기록은 이 기기에 저장돼요' };
    return { dot: 'wait', text: '동기화 준비 중이에요' };
  }

  function renderFoot() {
    var slot = $('#foot-slot');
    if (!slot) return;
    var s = syncLabel();
    var html = '<div class="foot">';
    html += '<div><span class="sync-dot ' + s.dot + '"></span>' + esc(s.text) + '</div>';
    html += '<div>기록은 <b>이 기기</b>에 자동 저장돼요. 가족과 함께 쓰려면 설정에서 동기화를 연결해 주세요.</div>';
    html += '<div>저금통 금액은 실제 결제·송금이 없는 가족 약속 기록이에요.</div>';
    html += '</div>';
    slot.innerHTML = html;
  }

  /* ======================= 타이머 ======================= */
  var timer = { mode: 'down', minutes: 10, remainMs: 600000, elapsedMs: 0, running: false, endAt: 0, startAt: 0, base: 0, finished: false };
  var timerInterval = null;

  function paintTimer() {
    var digits = $('#timer-digits');
    if (!digits) return;
    digits.textContent = timerDisplay();
    digits.className = 'timer-digits' + (timer.finished ? ' ended' : '');
    var hint = $('#timer-hint');
    if (hint) hint.textContent = timerHint();
    var primary = $('#timer-primary');
    if (primary) primary.textContent = timerPrimaryLabel();
  }

  function startTimerTick() {
    if (timerInterval) return;
    timerInterval = setInterval(function () {
      if (timer.running) {
        if (timer.mode === 'down' && Date.now() >= timer.endAt) {
          finishTimer();
        } else {
          paintTimer();
        }
      }
    }, 200);
  }

  function timerToggle() {
    ensureAudio();
    if (timer.running) {
      if (timer.mode === 'down') timer.remainMs = Math.max(0, timer.endAt - Date.now());
      else timer.elapsedMs = timer.base + (Date.now() - timer.startAt);
      timer.running = false;
      renderStudy();
      paintTimer();
      return;
    }
    timer.finished = false;
    if (timer.mode === 'down') {
      if (timer.remainMs <= 0) timer.remainMs = timer.minutes * 60000;
      timer.endAt = Date.now() + timer.remainMs;
    } else {
      timer.base = timer.elapsedMs;
      timer.startAt = Date.now();
    }
    timer.running = true;
    startTimerTick();
    renderStudy();
    paintTimer();
  }

  function finishTimer() {
    timer.running = false;
    timer.remainMs = 0;
    timer.finished = true;
    timer.endAt = 0;
    renderStudy();
    paintTimer();
    toast('시간이 다 됐어요. 오늘 공부 잘 마쳤어요!');
    playBell();
    if (navigator.vibrate) { try { navigator.vibrate([180, 90, 180]); } catch (e) { /* 무시 */ } }
    if (state.settings.notify && typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
      try {
        new Notification('공부 타이머가 끝났어요', { body: '잠깐 쉬고 다음 할 일을 해 볼까요?', tag: 'family-diary-timer' });
      } catch (e) { /* 무시 */ }
    }
  }

  function resetTimer() {
    timer.running = false;
    timer.finished = false;
    if (timer.mode === 'down') timer.remainMs = timer.minutes * 60000;
    else timer.elapsedMs = 0;
    renderStudy();
    paintTimer();
  }

  var audioCtx = null;
  function ensureAudio() {
    if (audioCtx) return;
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    } catch (e) { audioCtx = null; }
  }
  function playBell() {
    if (!state.settings.sound) return;
    ensureAudio();
    if (!audioCtx) return;
    try {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var now = audioCtx.currentTime;
      [0, 0.24, 0.48].forEach(function (off, i) {
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = i === 2 ? 1046 : 784;
        gain.gain.setValueAtTime(0.0001, now + off);
        gain.gain.linearRampToValueAtTime(0.16, now + off + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + off + 0.42);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now + off);
        osc.stop(now + off + 0.45);
      });
    } catch (e) { /* 소리는 실패해도 괜찮아요 */ }
  }

  /* ======================= 토스트 / 모달 ======================= */
  function toast(msg) {
    var root = $('#toast-root');
    if (!root) return;
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(function () {
      el.className = 'toast out';
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 300);
    }, 2100);
  }

  function openModal(opts) {
    var root = $('#modal-root');
    var body = '<div class="modal-backdrop" data-action="modal-backdrop"><div class="modal" role="dialog" aria-modal="true">';
    body += '<div class="modal-head"><div class="modal-title">' + esc(opts.title || '');
    if (opts.sub) body += '<div class="modal-sub">' + esc(opts.sub) + '</div>';
    body += '</div><button class="modal-close" data-action="close-modal" aria-label="닫기">✕</button></div>';
    body += '<div id="modal-body">' + (opts.body || '') + '</div>';
    body += '</div></div>';
    root.innerHTML = body;
    document.body.classList.add('locked');
    if (opts.onMount) opts.onMount($('#modal-body'));
  }
  function closeModal() {
    $('#modal-root').innerHTML = '';
    document.body.classList.remove('locked');
  }
  function confirmDialog(opts) {
    return new Promise(function (resolve) {
      var body = '<p style="font-size:14px;color:#7E7168;line-height:1.6;margin-bottom:16px">' + esc(opts.message || '') + '</p>';
      body += '<div class="row-2"><button class="btn" data-confirm="no">' + esc(opts.cancel || '그만두기') + '</button>';
      body += '<button class="btn ' + (opts.danger ? 'btn--pink' : 'btn--primary') + '" data-confirm="yes">' + esc(opts.ok || '확인') + '</button></div>';
      openModal({
        title: opts.title || '한 번 더 확인해 주세요',
        body: body,
        onMount: function (root) {
          root.querySelector('[data-confirm="no"]').addEventListener('click', function () { closeModal(); resolve(false); });
          root.querySelector('[data-confirm="yes"]').addEventListener('click', function () { closeModal(); resolve(true); });
        }
      });
    });
  }

  /* ======================= 할 일 / 공부 폼 ======================= */
  function memberOptions(selected) {
    return state.members.map(function (m) {
      return '<option value="' + m.id + '"' + (m.id === selected ? ' selected' : '') + '>' + esc(m.name) + '</option>';
    }).join('');
  }

  function openTaskModal(opts) {
    opts = opts || {};
    var editing = opts.task || null;
    var memberId = editing ? editing.memberId : (opts.memberId || state.members[0].id);
    var repeat = editing ? editing.repeat : 'daily';
    var body = '<form class="form-grid" id="task-form">';
    body += '<div class="field"><label>누구 할 일인가요</label><select class="select" name="memberId">' + memberOptions(memberId) + '</select></div>';
    body += '<div class="field"><label>할 일</label><input class="input" name="title" maxlength="40" required placeholder="예) 책 30분 읽기" value="' + esc(editing ? editing.title : '') + '"></div>';
    body += '<div class="field"><label>반복</label><div class="seg" data-seg="repeat">';
    body += '<button type="button" class="seg-btn' + (repeat === 'daily' ? ' on' : '') + '" data-seg-value="daily">매일 반복</button>';
    body += '<button type="button" class="seg-btn' + (repeat === 'once' ? ' on' : '') + '" data-seg-value="once">오늘만</button>';
    body += '</div><input type="hidden" name="repeat" value="' + repeat + '"><div class="help">매일 반복은 날짜가 바뀌면 새로 다시 체크할 수 있어요. 지난 기록은 그대로 남아요.</div></div>';
    body += '<button class="btn btn--primary btn--wide" type="submit">' + (editing ? '수정하기' : '추가하기') + '</button>';
    body += '</form>';

    openModal({
      title: editing ? '할 일 수정' : '할 일 추가',
      body: body,
      onMount: function (root) {
        var form = root.querySelector('#task-form');
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var title = form.title.value.trim();
          if (!title) return;
          var data = {
            memberId: form.memberId.value,
            title: title,
            repeat: form.repeat.value
          };
          if (editing) {
            editing.memberId = data.memberId;
            editing.title = data.title;
            editing.repeat = data.repeat;
            if (data.repeat === 'once' && !editing.date) editing.date = todayKey();
            if (data.repeat === 'daily') editing.date = null;
          } else {
            state.tasks.push(mkTask(data.memberId, data.title, data.repeat, [], todayKey()));
            state.isSample = false;
          }
          save();
          render();
          closeModal();
          toast(editing ? '할 일을 고쳤어요' : '할 일을 추가했어요');
        });
        setTimeout(function () { var t = form.querySelector('input[name="title"]'); if (t) t.focus(); }, 120);
      }
    });
  }

  function openStudyModal(opts) {
    opts = opts || {};
    var editing = opts.study || null;
    var memberId = editing ? editing.memberId : (opts.memberId || state.settings.stampMemberId || state.members[0].id);
    var repeat = editing ? editing.repeat : 'daily';
    var body = '<form class="form-grid" id="study-form">';
    body += '<div class="field"><label>누구 공부인가요</label><select class="select" name="memberId">' + memberOptions(memberId) + '</select></div>';
    body += '<div class="field"><label>공부 항목</label><input class="input" name="title" maxlength="40" required placeholder="예) 받아쓰기 연습" value="' + esc(editing ? editing.title : '') + '"></div>';
    body += '<div class="row-2">';
    body += '<div class="field"><label>분량</label><input class="input" name="amount" maxlength="20" placeholder="예) 10문제, 1장" value="' + esc(editing ? editing.amount : '') + '"></div>';
    body += '<div class="field"><label>보상 금액 (원)</label><input class="input" name="reward" type="number" inputmode="numeric" min="0" step="10" placeholder="0" value="' + (editing && editing.reward ? editing.reward : '') + '"></div>';
    body += '</div>';
    body += '<div class="help">보상 금액은 아이 항목에만 넣으면 돼요. 완료하면 저금통에 한 번만 쌓이고, 취소하면 함께 사라져요.</div>';
    body += '<div class="field"><label>반복</label><div class="seg" data-seg="repeat">';
    body += '<button type="button" class="seg-btn' + (repeat === 'daily' ? ' on' : '') + '" data-seg-value="daily">📌 매일 고정</button>';
    body += '<button type="button" class="seg-btn' + (repeat === 'once' ? ' on' : '') + '" data-seg-value="once">오늘만</button>';
    body += '</div><input type="hidden" name="repeat" value="' + repeat + '"></div>';
    body += '<button class="btn btn--primary btn--wide" type="submit">' + (editing ? '수정하기' : '추가하기') + '</button>';
    body += '</form>';

    openModal({
      title: editing ? '공부 항목 수정' : '공부 추가',
      body: body,
      onMount: function (root) {
        var form = root.querySelector('#study-form');
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var title = form.title.value.trim();
          if (!title) return;
          var data = {
            memberId: form.memberId.value,
            title: title,
            amount: form.amount.value.trim(),
            reward: Math.max(0, parseInt(form.reward.value, 10) || 0),
            repeat: form.repeat.value
          };
          if (editing) {
            editing.memberId = data.memberId;
            editing.title = data.title;
            editing.amount = data.amount;
            editing.reward = data.reward;
            editing.repeat = data.repeat;
            editing.date = data.repeat === 'once' ? (editing.date || todayKey()) : null;
          } else {
            state.studies.push(mkStudy(data.memberId, data.title, data.amount, data.reward, data.repeat, [], todayKey()));
            state.isSample = false;
          }
          save();
          render();
          closeModal();
          toast(editing ? '공부 항목을 고쳤어요' : '공부 항목을 추가했어요');
        });
        setTimeout(function () { var t = form.querySelector('input[name="title"]'); if (t) t.focus(); }, 120);
      }
    });
  }

  /* ======================= 도장 달력 ======================= */
  function openCalendar() {
    var set = stampSet();
    var child = memberById(state.settings.stampMemberId) || state.members[0];
    openModal({
      title: josa(child.name, '이가') + ' 도장 달력',
      sub: '도장이 찍힌 날을 한눈에 볼 수 있어요.',
      body: '<div id="cal-wrap">' + calendarHtml(ui.calMonth, set, child) + '</div>',
      onMount: function (root) {
        root.addEventListener('click', function (e) {
          var btn = e.target.closest('[data-cal]');
          if (!btn) return;
          var d = btn.getAttribute('data-cal');
          var parts = ui.calMonth.split('-');
          var y = Number(parts[0]), m = Number(parts[1]);
          if (d === 'prev') { m--; if (m < 1) { m = 12; y--; } }
          if (d === 'next') { m++; if (m > 12) { m = 1; y++; } }
          ui.calMonth = y + '-' + p2(m);
          var wrap = root.querySelector('#cal-wrap');
          if (wrap) wrap.innerHTML = calendarHtml(ui.calMonth, stampSet(), child);
        });
      }
    });
  }

  function calendarHtml(mk, set, child) {
    var parts = mk.split('-');
    var y = Number(parts[0]), m = Number(parts[1]);
    var first = new Date(y, m - 1, 1, 12);
    var startWd = (first.getDay() + 6) % 7;
    var daysIn = new Date(y, m, 0).getDate();
    var t = todayKey();
    var count = 0;

    var html = '<div class="cal-head"><div class="cal-month">' + y + '년 ' + m + '월</div>';
    html += '<div class="cal-nav"><button class="mini-btn" data-cal="prev" aria-label="이전 달">◀</button>';
    html += '<button class="mini-btn" data-cal="next" aria-label="다음 달">▶</button></div></div>';

    html += '<div class="cal-grid">';
    ['월', '화', '수', '목', '금', '토', '일'].forEach(function (d) { html += '<div class="cal-dow">' + d + '</div>'; });
    for (var i = 0; i < startWd; i++) html += '<div class="cal-cell empty-cell"></div>';
    for (var d = 1; d <= daysIn; d++) {
      var dk = y + '-' + p2(m) + '-' + p2(d);
      var stamped = !!set[dk];
      if (stamped) count++;
      html += '<div class="cal-cell' + (stamped ? ' has' : '') + (dk === t ? ' today' : '') + '">';
      html += '<span>' + d + '</span>';
      if (stamped) html += '<span class="cal-icon">' + icon(child.icon) + '</span>';
      html += '</div>';
    }
    html += '</div>';
    html += '<div class="cal-summary">' + m + '월 도장 ' + count + '개 · 지금 ' + streakCount(set) + '일 연속</div>';
    html += '<div class="cal-legend"><span>🐾 도장이 찍힌 날</span><span>오늘은 분홍 테두리</span></div>';
    return html;
  }

  /* ======================= 미션 관리 ======================= */
  function openMissionManage() {
    openModal({
      title: '가족 미션 관리',
      sub: '우리 집에 맞는 미션을 더하거나 고칠 수 있어요.',
      body: missionManageHtml(),
      onMount: function (root) {
        bindMissionManage(root);
      }
    });
  }
  function missionManageHtml() {
    var html = '<div class="field" style="margin-bottom:12px"><label>새 미션 추가</label>';
    html += '<div class="row-2"><input class="input" id="new-mission-emoji" maxlength="4" placeholder="🥕" style="max-width:72px;text-align:center">';
    html += '<input class="input" id="new-mission-text" maxlength="40" placeholder="예) 함께 설거지하기"></div></div>';
    html += '<button class="btn btn--primary btn--wide" id="add-mission-btn">미션 추가</button>';
    html += '<div class="settings-section" style="margin-top:14px"><h3>📋 미션 목록</h3>';
    state.missions.forEach(function (m) {
      html += '<div class="member-edit" data-mission-row="' + m.id + '">';
      html += '<span style="font-size:20px;width:28px;text-align:center">' + (m.emoji || '🎲') + '</span>';
      html += '<div class="member-fields"><input type="text" data-mission-text="' + m.id + '" value="' + esc(m.text) + '" maxlength="40"></div>';
      html += '<button class="icon-del" data-mission-del="' + m.id + '" aria-label="삭제">✕</button>';
      html += '</div>';
    });
    html += '</div>';
    html += '<div class="help">미션은 하루에 하나씩 화면에 보여요. 다른 미션 뽑기를 누르면 목록에서 새로 골라요.</div>';
    return html;
  }
  function bindMissionManage(root) {
    var addBtn = root.querySelector('#add-mission-btn');
    if (addBtn) addBtn.addEventListener('click', function () {
      var textEl = root.querySelector('#new-mission-text');
      var emojiEl = root.querySelector('#new-mission-emoji');
      var text = textEl.value.trim();
      if (!text) { toast('미션 내용을 적어 주세요'); return; }
      state.missions.push({ id: uid('ms'), emoji: emojiEl.value.trim() || '🎲', text: text });
      save(); render();
      var body = $('#modal-body');
      if (body) { body.innerHTML = missionManageHtml(); bindMissionManage(body); }
      toast('미션을 추가했어요');
    });
    $$('[data-mission-text]', root).forEach(function (input) {
      input.addEventListener('change', function () {
        var m = null;
        state.missions.forEach(function (x) { if (x.id === input.getAttribute('data-mission-text')) m = x; });
        if (m && input.value.trim()) { m.text = input.value.trim(); save(); render(); }
      });
    });
    $$('[data-mission-del]', root).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-mission-del');
        if (state.missions.length <= 1) { toast('미션은 하나 이상 남겨 두어야 해요'); return; }
        state.missions = state.missions.filter(function (m) { return m.id !== id; });
        save(); render();
        var body = $('#modal-body');
        if (body) { body.innerHTML = missionManageHtml(); bindMissionManage(body); }
        toast('미션을 지웠어요');
      });
    });
  }

  /* ======================= 보상 내역 ======================= */
  function openRewardModal(opts) {
    opts = opts || {};
    var editing = opts.reward || null;
    var memberId = editing ? editing.memberId : (ui.ledgerFilter !== 'all' ? ui.ledgerFilter : state.settings.stampMemberId);
    var body = '<form class="form-grid" id="reward-form">';
    body += '<div class="field"><label>누구 기록인가요</label><select class="select" name="memberId">' + memberOptions(memberId) + '</select></div>';
    body += '<div class="field"><label>내용</label><input class="input" name="title" maxlength="40" required placeholder="예) 받아쓰기 연습" value="' + esc(editing ? editing.title : '') + '"></div>';
    body += '<div class="row-2">';
    body += '<div class="field"><label>날짜</label><input class="input" name="date" type="date" value="' + esc(editing ? editing.date : todayKey()) + '"></div>';
    body += '<div class="field"><label>금액 (원)</label><input class="input" name="amount" type="number" inputmode="numeric" min="0" step="10" required value="' + (editing ? editing.amount : '') + '"></div>';
    body += '</div>';
    body += '<div class="help">실제로 돈이 오가는 기록이 아니라, 가족끼리 정한 약속을 적어 두는 곳이에요.</div>';
    body += '<button class="btn btn--primary btn--wide" type="submit">' + (editing ? '수정하기' : '추가하기') + '</button>';
    body += '</form>';
    openModal({
      title: editing ? '보상 내역 수정' : '보상 내역 추가',
      body: body,
      onMount: function (root) {
        var form = root.querySelector('#reward-form');
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var data = {
            memberId: form.memberId.value,
            title: form.title.value.trim(),
            date: form.date.value || todayKey(),
            amount: Math.max(0, parseInt(form.amount.value, 10) || 0)
          };
          if (!data.title) return;
          if (editing) {
            editing.memberId = data.memberId;
            editing.title = data.title;
            editing.date = data.date;
            editing.amount = data.amount;
          } else {
            state.rewards.push({
              id: uid('rw'), memberId: data.memberId, studyId: null, date: data.date,
              amount: data.amount, title: data.title, auto: false, createdAt: Date.now()
            });
            state.isSample = false;
          }
          save(); render(); closeModal();
          toast(editing ? '내역을 고쳤어요' : '내역을 추가했어요');
        });
      }
    });
  }

  /* ======================= 설정 ======================= */
  function settingsBody() {
    var s = state.settings;
    var html = '';

    html += '<div class="settings-section"><h3>🏠 기록장</h3>';
    html += '<div class="field" style="margin-bottom:9px"><label>기록장 이름</label><input class="input" data-setting="title" maxlength="20" value="' + esc(s.title) + '"></div>';
    html += '<div class="field"><label>인사말</label><input class="input" data-setting="greeting" maxlength="30" value="' + esc(s.greeting) + '"></div>';
    html += '</div>';

    html += '<div class="settings-section"><h3>👨‍👩‍👦 가족 구성원</h3>';
    state.members.forEach(function (m) {
      html += '<div class="member-edit">';
      html += '<span class="avatar tint-' + m.color + '">' + icon(m.icon) + '</span>';
      html += '<div class="member-fields">';
      html += '<input type="text" data-member-name="' + m.id + '" maxlength="10" value="' + esc(m.name) + '">';
      html += '<div class="member-line">';
      html += '<select class="select" data-member-role="' + m.id + '">';
      html += '<option value="child"' + (m.role === 'child' ? ' selected' : '') + '>아이</option>';
      html += '<option value="parent"' + (m.role === 'parent' ? ' selected' : '') + '>보호자</option>';
      html += '</select>';
      html += '<select class="select" data-member-icon="' + m.id + '">';
      Object.keys(ICON_NAMES).forEach(function (k) {
        html += '<option value="' + k + '"' + (m.icon === k ? ' selected' : '') + '>' + ICON_NAMES[k] + '</option>';
      });
      html += '</select>';
      html += '<select class="select" data-member-color="' + m.id + '">';
      Object.keys(COLOR_NAMES).forEach(function (k) {
        html += '<option value="' + k + '"' + (m.color === k ? ' selected' : '') + '>' + COLOR_NAMES[k] + '</option>';
      });
      html += '</select>';
      html += '</div></div>';
      html += '<button class="icon-del" data-action="del-member" data-id="' + m.id + '" aria-label="구성원 삭제">✕</button>';
      html += '</div>';
    });
    html += '<button class="btn btn--sm btn--wide" data-action="add-member" style="margin-top:10px">+ 구성원 추가</button>';
    html += '</div>';

    html += '<div class="settings-section"><h3>🐾 칭찬 도장판</h3>';
    html += '<div class="row-2"><div class="field"><label>도장 대상</label><select class="select" data-setting="stampMemberId">';
    state.members.forEach(function (m) {
      html += '<option value="' + m.id + '"' + (s.stampMemberId === m.id ? ' selected' : '') + '>' + esc(m.name) + '</option>';
    });
    html += '</select></div>';
    html += '<div class="field"><label>도장 기준 (개)</label><input class="input" data-setting="stampThreshold" type="number" inputmode="numeric" min="1" max="20" value="' + (Number(s.stampThreshold) || 1) + '"></div></div>';
    html += '<div class="help">정한 개수 이상 할 일이나 공부를 마치면 그날 도장이 하나 찍혀요. 완료를 취소하면 도장도 다시 계산돼요.</div>';
    html += '</div>';

    html += '<div class="settings-section"><h3>🌤️ 날씨 지역</h3>';
    html += '<div class="field"><label>지역 이름</label><input class="input" id="region-input" maxlength="30" value="' + esc(s.region) + '" list="region-presets"></div>';
    html += '<datalist id="region-presets">';
    REGION_PRESETS.forEach(function (r) { html += '<option value="' + esc(r.name) + '"></option>'; });
    html += '</datalist>';
    html += '<button class="btn btn--sm btn--wide" data-action="save-region" style="margin-top:8px">이 지역으로 날씨 확인</button>';
    html += '<div class="help" style="margin-top:6px">지금 좌표: ' + (s.lat ? Number(s.lat).toFixed(3) + ', ' + Number(s.lon).toFixed(3) : '없음') + ' · Open-Meteo 무료 API를 써요. 연결이 안 되면 화면에는 "날씨 연결 필요"만 보여요.</div>';
    html += '</div>';

    html += '<div class="settings-section"><h3>⏰ 타이머 알림</h3>';
    html += '<label class="member-edit" style="border:0;padding:6px 0"><input type="checkbox" data-setting="sound"' + (s.sound ? ' checked' : '') + ' style="width:18px;height:18px;margin-right:8px"><span style="font-size:13.5px">끝날 때 알림음 재생</span></label>';
    html += '<label class="member-edit" style="border:0;padding:6px 0"><input type="checkbox" data-setting="notify"' + (s.notify ? ' checked' : '') + ' style="width:18px;height:18px;margin-right:8px"><span style="font-size:13.5px">다른 앱을 보고 있어도 화면 알림</span></label>';
    html += '</div>';

    html += '<div class="settings-section"><h3>🔒 가족 PIN 잠금</h3>';
    if (s.pinHash) {
      html += '<div class="help" style="margin-bottom:8px">PIN 잠금이 켜져 있어요. 기록장을 열 때 4자리를 물어봐요.</div>';
      html += '<div class="row-2"><button class="btn btn--sm" data-action="lock-now">지금 잠그기</button><button class="btn btn--sm btn--pink" data-action="clear-pin">PIN 해제</button></div>';
    } else {
      html += '<div class="field"><label>4자리 PIN</label><input class="input" id="pin-input" type="password" inputmode="numeric" maxlength="4" placeholder="숫자 4자리"></div>';
      html += '<button class="btn btn--sm btn--wide" data-action="set-pin" style="margin-top:8px">PIN 켜기</button>';
      html += '<div class="help" style="margin-top:6px">가족이 잠깐 확인하는 용도예요. 중요한 정보를 지키는 보안 장치는 아니에요.</div>';
    }
    html += '</div>';

    html += '<div class="settings-section"><h3>💾 기록 보관</h3>';
    html += '<div class="row-2" style="margin-bottom:8px"><button class="btn btn--sm" data-action="export-json">JSON 내보내기</button>';
    html += '<button class="btn btn--sm" data-action="import-json">불러오기</button></div>';
    html += '<div class="row-2"><button class="btn btn--sm" data-action="reset-sample">예시로 되돌리기</button>';
    html += '<button class="btn btn--sm btn--pink" data-action="reset-blank">기록 비우고 새로 시작</button></div>';
    html += '<div class="help" style="margin-top:8px">지우기 전에 내보내기로 백업해 두면 안전해요.</div>';
    html += '<input type="file" id="import-file" accept="application/json,.json" class="hidden">';
    html += '</div>';

    var sync = s.sync || {};
    html += '<div class="settings-section"><h3>📡 여러 기기 동기화</h3>';
    html += '<div class="field"><label>방식</label><select class="select" data-sync="provider">';
    html += '<option value="none"' + (sync.provider === 'none' ? ' selected' : '') + '>쓰지 않음 (이 기기에만 저장)</option>';
    html += '<option value="firebase"' + (sync.provider === 'firebase' ? ' selected' : '') + '>Firebase Realtime Database</option>';
    html += '<option value="supabase"' + (sync.provider === 'supabase' ? ' selected' : '') + '>Supabase REST</option>';
    html += '</select></div>';
    html += '<div class="field" style="margin-top:8px"><label>주소 (URL)</label><input class="input" data-sync="url" placeholder="https://내-데이터베이스.firebaseio.com" value="' + esc(sync.url || '') + '"></div>';
    html += '<div class="field" style="margin-top:8px"><label>가족 방 이름</label><input class="input" data-sync="room" maxlength="40" value="' + esc(sync.room || 'cho-family') + '"></div>';
    html += '<div class="field" style="margin-top:8px" data-sync-key-field><label>키 (Supabase만)</label><input class="input" data-sync="key" placeholder="anon key" value="' + esc(sync.key || '') + '"></div>';
    html += '<div class="row-2" style="margin-top:10px"><button class="btn btn--sm" data-action="sync-apply">연결하기</button>';
    html += '<button class="btn btn--sm" data-action="sync-off">해제</button></div>';
    html += '<div class="help" style="margin-top:8px">';
    html += '연결하지 않으면 이 기기에만 저장돼요. 연결하면 가족 휴대폰끼리 몇 초 안에 같은 기록을 주고받아요. ';
    html += 'Firebase는 Realtime Database 주소 뒤에 방 이름이 붙고, 규칙에서 읽기·쓰기를 허용해야 해요. ';
    html += '설정 방법과 Supabase 표 만드는 SQL은 함께 만든 README.md에 적어 두었어요.';
    html += '</div>';
    html += '</div>';

    return html;
  }

  function refreshSettings() {
    var body = $('#modal-body');
    if (!body) return;
    var modal = $('.modal');
    var top = modal ? modal.scrollTop : 0;
    body.innerHTML = settingsBody();
    if (modal) modal.scrollTop = top;
    bindSettings(body);
  }

  function openSettings() {
    openModal({
      title: '설정',
      sub: '우리 집에 맞게 바꾸고, 기록을 안전하게 보관할 수 있어요.',
      body: settingsBody(),
      onMount: function (root) { bindSettings(root); }
    });
  }

  function bindSettings(root) {
    $$('[data-setting]', root).forEach(function (el) {
      el.addEventListener('change', function () {
        var key = el.getAttribute('data-setting');
        var val = el.type === 'checkbox' ? el.checked : el.value;
        if (key === 'stampThreshold') val = clamp(parseInt(val, 10) || 1, 1, 20);
        if (key === 'notify' && val === true && typeof Notification !== 'undefined') {
          try { Notification.requestPermission(); } catch (e) { /* 무시 */ }
        }
        state.settings[key] = val;
        save(); render();
      });
    });
    $$('[data-member-name]', root).forEach(function (el) {
      el.addEventListener('change', function () {
        var m = memberById(el.getAttribute('data-member-name'));
        var v = el.value.trim();
        if (!m || !v) { el.value = m ? m.name : ''; return; }
        m.name = v; save(); render();
      });
    });
    $$('[data-member-role]', root).forEach(function (el) {
      el.addEventListener('change', function () {
        var m = memberById(el.getAttribute('data-member-role'));
        if (!m) return;
        m.role = el.value === 'child' ? 'child' : 'parent';
        save(); render();
      });
    });
    $$('[data-member-icon]', root).forEach(function (el) {
      el.addEventListener('change', function () {
        var m = memberById(el.getAttribute('data-member-icon'));
        if (!m) return;
        m.icon = ICONS[el.value] ? el.value : 'bear';
        save(); render(); refreshSettings();
      });
    });
    $$('[data-member-color]', root).forEach(function (el) {
      el.addEventListener('change', function () {
        var m = memberById(el.getAttribute('data-member-color'));
        if (!m) return;
        m.color = el.value;
        save(); render(); refreshSettings();
      });
    });
    $$('[data-sync]', root).forEach(function (el) {
      el.addEventListener('change', function () {
        var key = el.getAttribute('data-sync');
        state.settings.sync[key] = el.value;
        save({ noSync: true });
      });
    });
  }

  /* ======================= 공유 ======================= */
  function encodeState() {
    var json = JSON.stringify(state);
    var bytes;
    try { bytes = new TextEncoder().encode(json); }
    catch (e) {
      var arr = [];
      for (var i = 0; i < json.length; i++) {
        var c = json.charCodeAt(i);
        if (c < 128) arr.push(c);
        else { var enc = unescape(encodeURIComponent(json.charAt(i))); for (var j = 0; j < enc.length; j++) arr.push(enc.charCodeAt(j)); }
      }
      bytes = new Uint8Array(arr);
    }
    var bin = '';
    for (var k = 0; k < bytes.length; k++) bin += String.fromCharCode(bytes[k]);
    return btoa(bin).replace(/=+$/, '');
  }

  function decodeState(code) {
    var s = String(code || '').trim();
    if (!s) throw new Error('empty');
    if (s.indexOf('{') === 0) return JSON.parse(s);
    var b = s.replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    var bin = atob(b);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var json;
    try { json = new TextDecoder('utf-8').decode(bytes); }
    catch (e) { json = decodeURIComponent(escape(bin)); }
    return JSON.parse(json);
  }

  function shareUrl() {
    var base = location.href.split('#')[0];
    return base + '#data=' + encodeState();
  }

  function openShare() {
    var url = shareUrl();
    var code = url.split('#data=')[1] || '';
    var html = '';
    html += '<div class="settings-section"><h3>🔗 가족에게 보내기</h3>';
    html += '<div class="field"><label>공유 링크</label><input class="input" id="share-url" readonly value="' + esc(url) + '"></div>';
    html += '<button class="btn btn--primary btn--wide" data-action="copy-url" style="margin-top:8px">링크 복사</button>';
    html += '<div class="help" style="margin-top:8px">링크를 열면 지금까지의 기록을 그대로 볼 수 있어요. 휴대폰끼리 자동으로 함께 쓰려면 설정에서 동기화를 연결해 주세요.</div>';
    html += '</div>';

    html += '<div class="settings-section"><h3>📋 공유 코드</h3>';
    html += '<div class="field"><textarea class="textarea" id="share-code" readonly style="font-size:11px;height:88px">' + esc(code) + '</textarea></div>';
    html += '<button class="btn btn--sm btn--wide" data-action="copy-code" style="margin-top:8px">코드 복사</button>';
    html += '</div>';

    html += '<div class="settings-section"><h3>📥 코드로 불러오기</h3>';
    html += '<div class="field"><textarea class="textarea" id="import-code" placeholder="공유 코드를 붙여 넣어 주세요" style="font-size:12px"></textarea></div>';
    html += '<button class="btn btn--sm btn--wide" data-action="load-code" style="margin-top:8px">이 코드 불러오기</button>';
    html += '<div class="help" style="margin-top:8px">불러오면 이 기기의 기록이 코드 내용으로 바뀌어요. 먼저 내보내기로 백업해 두는 것을 권해요.</div>';
    html += '</div>';

    openModal({ title: '가족과 공유', sub: '링크나 코드로 지금 기록을 그대로 보낼 수 있어요.', body: html });
  }

  /* ======================= 잠금 ======================= */
  function hashPin(pin, salt) {
    var str = String(salt || '') + ':' + String(pin || '');
    var h = 5381;
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36) + '-' + String(pin || '').length;
  }
  var lockInput = '';

  function showLock() {
    if (!state.settings.pinHash) return;
    lockInput = '';
    $('#lock-screen').classList.remove('hidden');
    $('#lock-screen').setAttribute('aria-hidden', 'false');
    $('#lock-icon').innerHTML = icon((memberById(state.settings.stampMemberId) || state.members[0]).icon);
    paintPin();
    $('#lock-err').textContent = '';
  }
  function hideLock() {
    $('#lock-screen').classList.add('hidden');
    $('#lock-screen').setAttribute('aria-hidden', 'true');
  }
  function paintPin() {
    $$('#pin-box .pin-dot').forEach(function (dot, i) {
      dot.className = 'pin-dot' + (i < lockInput.length ? ' filled' : '');
    });
  }
  function submitPin() {
    if (lockInput.length !== 4) {
      $('#lock-err').textContent = '4자리를 모두 눌러 주세요';
      return;
    }
    if (hashPin(lockInput, state.settings.pinSalt) === state.settings.pinHash) {
      lockInput = '';
      paintPin();
      hideLock();
      toast('기록장을 열었어요');
    } else {
      var box = $('#pin-box');
      box.classList.add('shake');
      setTimeout(function () { box.classList.remove('shake'); }, 340);
      $('#lock-err').textContent = 'PIN이 맞지 않아요. 다시 눌러 주세요';
      lockInput = '';
      paintPin();
    }
  }

  /* ======================= 동작 처리 ======================= */
  function findTask(id) {
    var out = null;
    state.tasks.forEach(function (t) { if (t.id === id) out = t; });
    return out;
  }
  function findStudy(id) {
    var out = null;
    state.studies.forEach(function (s) { if (s.id === id) out = s; });
    return out;
  }

  function toggleTask(id) {
    var task = findTask(id);
    if (!task) return;
    var day = todayKey();
    var hadStamp = !!stampSet()[day];
    var idx = task.done.indexOf(day);
    if (idx === -1) task.done.push(day);
    else task.done.splice(idx, 1);
    save();
    render();
    var hasStamp = !!stampSet()[day];
    if (idx === -1) toast('완료로 표시했어요');
    else if (hadStamp && !hasStamp) toast('완료를 취소했어요. 오늘 도장도 함께 정리했어요');
    else toast('완료를 취소했어요');
  }

  function toggleStudy(id) {
    var study = findStudy(id);
    if (!study) return;
    var day = todayKey();
    var hadStamp = !!stampSet()[day];
    var idx = study.done.indexOf(day);
    if (idx === -1) {
      study.done.push(day);
      if (Number(study.reward) > 0) {
        var exists = state.rewards.some(function (r) {
          return r.studyId === study.id && r.date === day && r.memberId === study.memberId;
        });
        if (!exists) {
          state.rewards.push({
            id: uid('rw'), memberId: study.memberId, studyId: study.id, date: day,
            amount: Number(study.reward), title: study.title, auto: true, createdAt: Date.now()
          });
        }
      }
    } else {
      study.done.splice(idx, 1);
      state.rewards = state.rewards.filter(function (r) {
        return !(r.auto && r.studyId === study.id && r.date === day);
      });
    }
    save();
    render();
    var hasStamp = !!stampSet()[day];
    if (idx === -1) {
      toast(Number(study.reward) > 0 ? '공부 완료! 저금통에 ' + num(study.reward) + '원을 적었어요' : '공부 완료로 표시했어요');
    } else if (hadStamp && !hasStamp) {
      toast('완료를 취소했어요. 보상과 오늘 도장도 함께 정리했어요');
    } else {
      toast('완료를 취소했어요. 보상도 함께 되돌렸어요');
    }
  }

  function deleteTask(id) {
    var task = findTask(id);
    if (!task) return;
    confirmDialog({
      title: '할 일을 지울까요?',
      message: '“' + task.title + '”을(를) 지우면 이 할 일의 완료 기록도 함께 사라져요.',
      ok: '지우기', danger: true
    }).then(function (ok) {
      if (!ok) return;
      state.tasks = state.tasks.filter(function (t) { return t.id !== id; });
      save(); render(); toast('할 일을 지웠어요');
    });
  }

  function deleteStudy(id) {
    var study = findStudy(id);
    if (!study) return;
    confirmDialog({
      title: '공부 항목을 지울까요?',
      message: '“' + study.title + '”을(를) 지우면 완료 기록과 보상 내역도 함께 사라져요.',
      ok: '지우기', danger: true
    }).then(function (ok) {
      if (!ok) return;
      state.studies = state.studies.filter(function (s) { return s.id !== id; });
      state.rewards = state.rewards.filter(function (r) { return r.studyId !== id; });
      save(); render(); toast('공부 항목을 지웠어요');
    });
  }
  function deleteReward(id) {
    var rw = null;
    state.rewards.forEach(function (r) { if (r.id === id) rw = r; });
    if (!rw) return;
    confirmDialog({
      title: '내역을 지울까요?',
      message: '“' + rw.title + '” ' + num(rw.amount) + '원 내역을 지워요. 공부 완료 표시는 그대로 남아요.',
      ok: '지우기', danger: true
    }).then(function (ok) {
      if (!ok) return;
      state.rewards = state.rewards.filter(function (r) { return r.id !== id; });
      save(); render(); toast('내역을 지웠어요');
    });
  }

  function addMember() {
    var colors = ['mint', 'pink', 'sky', 'butter', 'lilac'];
    var icons = Object.keys(ICONS);
    state.members.push({
      id: uid('m'),
      name: '새 구성원',
      role: 'parent',
      icon: icons[state.members.length % icons.length],
      color: colors[state.members.length % colors.length]
    });
    save(); render(); refreshSettings();
    toast('구성원을 추가했어요. 이름을 바꿔 주세요');
  }

  function deleteMember(id) {
    if (state.members.length <= 1) { toast('구성원은 한 명 이상 있어야 해요'); return; }
    var m = memberById(id);
    if (!m) return;
    confirmDialog({
      title: m.name + ' 님을 지울까요?',
      message: '이 구성원의 할 일, 공부, 보상 기록이 모두 함께 사라져요.',
      ok: '지우기', danger: true
    }).then(function (ok) {
      if (!ok) return;
      state.members = state.members.filter(function (x) { return x.id !== id; });
      state.tasks = state.tasks.filter(function (t) { return t.memberId !== id; });
      state.studies = state.studies.filter(function (s) { return s.memberId !== id; });
      state.rewards = state.rewards.filter(function (r) { return r.memberId !== id; });
      if (state.settings.stampMemberId === id) state.settings.stampMemberId = state.members[0].id;
      if (ui.ledgerFilter === id) ui.ledgerFilter = 'all';
      save(); render();
      openSettings();
      toast('구성원을 정리했어요');
    });
  }

  function saveRegion() {
    var input = $('#region-input');
    if (!input) return;
    var name = input.value.trim();
    if (!name) { toast('지역 이름을 적어 주세요'); return; }
    var preset = null;
    REGION_PRESETS.forEach(function (p) { if (p.name === name) preset = p; });
    state.settings.region = name;
    if (preset) {
      state.settings.lat = preset.lat;
      state.settings.lon = preset.lon;
      save(); render(); fetchWeather(true);
      toast(name + ' 날씨를 확인할게요');
      return;
    }
    toast('지역을 찾는 중이에요');
    var url = 'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(name) + '&count=1&language=ko&format=json';
    fetch(url, { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (data) {
      var hit = data && data.results && data.results[0];
      if (!hit) throw new Error('not found');
      state.settings.region = hit.name + (hit.admin1 && hit.admin1 !== hit.name ? ' ' + hit.admin1 : '');
      state.settings.lat = hit.latitude;
      state.settings.lon = hit.longitude;
      save(); render(); fetchWeather(true);
      toast(state.settings.region + ' 날씨를 확인할게요');
    }).catch(function () {
      state.settings.lat = null;
      state.settings.lon = null;
      weather = { status: 'error', data: null, reason: 'region' };
      save(); render();
      toast('지역을 찾지 못했어요. 다른 이름으로 시도해 주세요');
    });
  }

  function exportJson() {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '우리-가족-기록장-' + todayKey() + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 400);
    toast('기록을 파일로 내보냈어요');
  }

  function importJsonFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(String(reader.result));
        if (!data || !Array.isArray(data.members)) throw new Error('bad');
        confirmDialog({
          title: '이 파일로 바꿀까요?',
          message: '지금 이 기기의 기록이 파일 내용으로 바뀌어요.',
          ok: '불러오기'
        }).then(function (ok) {
          if (!ok) return;
          state = normalize(data);
          save({ noSync: true });
          render(); refreshSettings();
          toast('기록을 불러왔어요');
        });
      } catch (e) {
        toast('파일을 읽지 못했어요. 내보낸 JSON 파일인지 확인해 주세요');
      }
    };
    reader.readAsText(file);
  }

  function resetSample() {
    confirmDialog({
      title: '예시 데이터로 되돌릴까요?',
      message: '지금 기록이 모두 지워지고 처음 예시 화면으로 돌아가요.',
      ok: '되돌리기', danger: true
    }).then(function (ok) {
      if (!ok) return;
      state = sampleState();
      save({ noSync: true });
      render(); refreshSettings();
      toast('예시 데이터로 되돌렸어요');
    });
  }

  function resetBlank() {
    confirmDialog({
      title: '기록을 비우고 새로 시작할까요?',
      message: '할 일, 공부, 보상, 미션 기록이 모두 지워져요. 가족 구성원과 설정은 그대로 남아요.',
      ok: '비우기', danger: true
    }).then(function (ok) {
      if (!ok) return;
      state = emptyState();
      save({ noSync: true });
      ui.ledgerFilter = 'all';
      render(); refreshSettings();
      toast('새 기록장을 시작해요');
    });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('복사했어요'); }).catch(function () { fallbackCopy(text); });
    } else {
      fallbackCopy(text);
    }
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast('복사했어요'); }
    catch (e) { toast('복사하지 못했어요. 길게 눌러 복사해 주세요'); }
    document.body.removeChild(ta);
  }

  function applyCode(code) {
    try {
      var data = decodeState(code);
      if (!data || !Array.isArray(data.members)) throw new Error('bad');
      confirmDialog({
        title: '이 코드로 바꿀까요?',
        message: '지금 이 기기의 기록이 코드 내용으로 바뀌어요.',
        ok: '불러오기'
      }).then(function (ok) {
        if (!ok) return;
        state = normalize(data);
        state.updatedAt = Date.now();
        save({ noSync: true });
        render(); closeModal();
        toast('기록을 불러왔어요');
      });
    } catch (e) {
      toast('코드를 읽지 못했어요. 다시 확인해 주세요');
    }
  }

  /* ======================= 동기화 설정 동작 ======================= */
  function applySync() {
    var cfg = state.settings.sync;
    if (cfg.provider !== 'none' && !String(cfg.url || '').trim()) {
      toast('주소를 먼저 적어 주세요');
      return;
    }
    if (cfg.provider === 'supabase' && !String(cfg.key || '').trim()) {
      toast('Supabase 키를 적어 주세요');
      return;
    }
    save({ noSync: true });
    startSync();
    if (syncEnabled()) {
      setSyncStatus('wait');
      pushRemote();
      toast('동기화를 시작했어요');
    } else {
      toast('동기화를 쓰지 않아요. 기록은 이 기기에만 저장돼요');
    }
    refreshSettings();
  }
  function clearSync() {
    state.settings.sync = { provider: 'none', url: '', key: '', room: state.settings.sync.room, table: state.settings.sync.table };
    save({ noSync: true });
    if (syncPoll) { clearInterval(syncPoll); syncPoll = null; }
    setSyncStatus('local');
    renderFoot();
    refreshSettings();
    toast('동기화를 해제했어요');
  }

  /* ======================= 이벤트 ======================= */
  document.addEventListener('click', function (e) {
    var pinBtn = e.target.closest ? e.target.closest('[data-pin]') : null;
    if (pinBtn) {
      var v = pinBtn.getAttribute('data-pin');
      if (v === 'del') lockInput = lockInput.slice(0, -1);
      else if (v === 'ok') { submitPin(); return; }
      else if (lockInput.length < 4) lockInput += v;
      paintPin();
      $('#lock-err').textContent = '';
      if (lockInput.length === 4) setTimeout(submitPin, 120);
      return;
    }

    var segBtn = e.target.closest ? e.target.closest('[data-seg-value]') : null;
    if (segBtn) {
      var seg = segBtn.closest('.seg');
      $$('.seg-btn', seg).forEach(function (b) { b.classList.remove('on'); });
      segBtn.classList.add('on');
      var hidden = seg.parentNode.querySelector('input[name="repeat"]');
      if (hidden) hidden.value = segBtn.getAttribute('data-seg-value');
      return;
    }

    var el = e.target.closest ? e.target.closest('[data-action]') : null;
    if (!el) return;
    var action = el.getAttribute('data-action');
    var id = el.getAttribute('data-id');

    switch (action) {
      case 'modal-backdrop':
        if (e.target === el) closeModal();
        break;
      case 'close-modal': closeModal(); break;
      case 'open-settings': openSettings(); break;
      case 'open-share': openShare(); break;
      case 'open-reset': openResetMenu(); break;

      case 'add-task': openTaskModal({ memberId: id || null }); break;
      case 'edit-task': openTaskModal({ task: findTask(id) }); break;
      case 'del-task': deleteTask(id); break;
      case 'toggle-task': toggleTask(id); break;

      case 'add-study': openStudyModal(); break;
      case 'edit-study': openStudyModal({ study: findStudy(id) }); break;
      case 'del-study': deleteStudy(id); break;
      case 'toggle-study': toggleStudy(id); break;

      case 'timer-mode':
        timer.running = false;
        timer.finished = false;
        timer.mode = id === 'up' ? 'up' : 'down';
        if (timer.mode === 'down') timer.remainMs = timer.minutes * 60000;
        else timer.elapsedMs = 0;
        renderStudy(); paintTimer();
        break;
      case 'timer-toggle': timerToggle(); break;
      case 'timer-reset': resetTimer(); break;
      case 'timer-preset':
        timer.minutes = clamp(parseInt(id, 10) || 10, 1, 180);
        timer.remainMs = timer.minutes * 60000;
        timer.running = false;
        timer.finished = false;
        renderStudy(); paintTimer();
        break;
      case 'timer-custom': {
        var inp = $('#timer-custom');
        var min = clamp(parseInt(inp ? inp.value : '', 10) || 0, 0, 180);
        if (!min) { toast('분을 숫자로 적어 주세요'); break; }
        timer.minutes = min;
        timer.remainMs = min * 60000;
        timer.running = false;
        timer.finished = false;
        renderStudy(); paintTimer();
        toast(min + '분으로 맞췄어요');
        break;
      }

      case 'open-calendar': openCalendar(); break;
      case 'mission-done': toggleMission(); break;
      case 'mission-shuffle': shuffleMission(); break;
      case 'mission-manage': openMissionManage(); break;

      case 'ledger-filter':
        ui.ledgerFilter = id || 'all';
        renderSavings();
        break;
      case 'add-reward': openRewardModal({}); break;
      case 'edit-reward': {
        var rw = null;
        state.rewards.forEach(function (r) { if (r.id === id) rw = r; });
        if (rw) openRewardModal({ reward: rw });
        break;
      }
      case 'del-reward': deleteReward(id); break;

      case 'add-member': addMember(); break;
      case 'del-member': deleteMember(id); break;

      case 'save-region': saveRegion(); break;
      case 'refresh-weather': fetchWeather(true); break;

      case 'set-pin': {
        var pinEl = $('#pin-input');
        var pin = pinEl ? pinEl.value.trim() : '';
        if (!/^\d{4}$/.test(pin)) { toast('숫자 4자리로 정해 주세요'); break; }
        state.settings.pinSalt = uid('s');
        state.settings.pinHash = hashPin(pin, state.settings.pinSalt);
        save({ noSync: true });
        refreshSettings();
        toast('PIN 잠금을 켰어요. 다음에 열 때 물어봐요');
        break;
      }
      case 'lock-now':
        closeModal();
        showLock();
        break;
      case 'clear-pin':
        state.settings.pinHash = null;
        state.settings.pinSalt = null;
        save({ noSync: true });
        refreshSettings();
        hideLock();
        toast('PIN 잠금을 해제했어요');
        break;

      case 'export-json': exportJson(); break;
      case 'import-json': {
        var fileInput = $('#import-file');
        if (fileInput) fileInput.click();
        break;
      }
      case 'reset-sample': resetSample(); break;
      case 'reset-blank': resetBlank(); break;

      case 'copy-url': copyText(shareUrl()); break;
      case 'copy-code': {
        var codeEl = $('#share-code');
        if (codeEl) copyText(codeEl.value);
        break;
      }
      case 'load-code': {
        var ta = $('#import-code');
        if (ta) applyCode(ta.value);
        break;
      }

      case 'sync-apply': applySync(); break;
      case 'sync-off': clearSync(); break;

      default: break;
    }
  });

  document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'import-file') {
      importJsonFile(e.target.files && e.target.files[0]);
      e.target.value = '';
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && $('#modal-root').innerHTML) closeModal();
  });

  window.addEventListener('online', function () { if (weather.status === 'error') fetchWeather(true); });

  /* ======================= 초기화 ======================= */
  function openResetMenu() {
    var html = '<p class="help" style="margin-bottom:12px">지금 화면은 예시 데이터예요. 직접 기록을 시작하려면 아래에서 골라 주세요.</p>';
    html += '<div class="row-2"><button class="btn" data-action="reset-sample">예시로 되돌리기</button>';
    html += '<button class="btn btn--primary" data-action="reset-blank">기록 비우고 시작</button></div>';
    openModal({ title: '예시 데이터', body: html });
  }

  function toggleMission() {
    var t = todayKey();
    var m = missionToday();
    if (!m) return;
    if (state.missionDone[t] === m.id) {
      delete state.missionDone[t];
      save(); render();
      toast('오늘 미션 기록을 취소했어요');
    } else {
      state.missionDone[t] = m.id;
      save(); render();
      toast('함께 ' + missionDoneCount() + '번째 미션이에요');
    }
  }

  function shuffleMission() {
    var t = todayKey();
    var cur = missionToday();
    var pick = pickMission(cur ? cur.id : null);
    if (!pick) return;
    state.missionByDate[t] = pick.id;
    save(); render();
    toast('오늘의 미션을 새로 뽑았어요');
  }

  function checkDayRollover() {
    var t = todayKey();
    if (t !== ui.currentDay) {
      ui.currentDay = t;
      ensureTodayMission();
      render();
      toast('날짜가 바뀌었어요. 오늘 기록을 새로 시작해요');
    }
  }

  function boot() {
    ensureTodayMission();
    save({ noSync: true });
    render();
    startSync();
    fetchWeather(false);
    if (state.settings.pinHash) showLock();

    /* 공유 링크로 열었을 때 */
    var hash = location.hash || '';
    if (hash.indexOf('#data=') === 0) {
      var code = hash.slice(6);
      try {
        var incoming = decodeState(code);
        if (incoming && Array.isArray(incoming.members)) {
          openModal({
            title: '공유받은 기록이 있어요',
            sub: '이 링크에 담긴 기록을 이 기기로 불러올까요?',
            body: '<div class="row-2"><button class="btn" data-action="close-modal">그대로 두기</button>'
              + '<button class="btn btn--primary" id="take-shared">불러오기</button></div>',
            onMount: function (root) {
              root.querySelector('#take-shared').addEventListener('click', function () {
                state = normalize(incoming);
                state.updatedAt = Date.now();
                save({ noSync: true });
                history.replaceState(null, '', location.pathname + location.search);
                render();
                closeModal();
                toast('공유받은 기록을 불러왔어요');
              });
            }
          });
        }
      } catch (err) { /* 잘못된 링크는 무시 */ }
    }

    setInterval(checkDayRollover, 20000);
    setInterval(function () {
      if (timer.running) paintTimer();
    }, 1000);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') checkDayRollover();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
