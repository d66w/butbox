# 붙박스

**매일 반복해서 입력하는 문구를, 한 번 저장하고 어디서든 즉시 꺼내는 도구.**

찾고 → 클릭하고 → 끝. 크롬 사이드 패널과 웹 앱, 두 클라이언트가 같은 Supabase 백엔드를 공유합니다.

주 타깃은 고객센터·CS팀처럼 같은 안내 문구를 하루에 수십 번 다시 치는 사람들입니다.

다음에 할 일은 [ROADMAP.md](ROADMAP.md)에 있습니다.

---

## 핵심 기능

| 기능 | 설명 |
| --- | --- |
| 검색 | 이름·내용·태그를 한 번에. 띄어쓰기 무시, **한국어 초성 검색**(`ㅎㅂ` → 환불 안내), `#태그` 필터 |
| 키보드 | 검색창에서 `↑`/`↓` 이동, `Enter` 복사, `Esc` 초기화 |
| 복사 | 내용이 있는 박스를 클릭하면 클립보드에 복사 |
| 빠른 저장 | 빈 박스를 클릭하면 클립보드의 텍스트를 바로 저장 |
| **템플릿 변수** | `{{고객명}}` 처럼 적으면 복사할 때 값을 물어봄. `{{오늘}}`·`{{지금}}`은 자동 |
| 태그 · 즐겨찾기 | 박스당 태그, 개인별 즐겨찾기(팀원끼리 독립) |
| 정렬 | 내 순서 / 최근 사용 / 이름. 즐겨찾기는 항상 위 |
| 우클릭 저장 | 웹페이지에서 텍스트 선택 → 우클릭 → 붙박스에 저장 (출처 포함 선택 가능) |
| 단축키 | `Ctrl+Shift+K`로 사이드 패널 열고 검색창 포커스 |
| 화면 모드 | 헤더의 ☼/☾ 토글로 라이트↔다크 즉시 전환. 계정 시트에서 시스템 설정 따르기까지 선택 가능 |
| 팀 | 스페이스, 초대 링크, 역할(owner/admin/member), 실시간 동기화 |
| 요금제 | Free와 Pro 준비안 한도가 DB에 정의됨. Team과 가격·결제는 v1에서 노출하지 않음 |

파일·이미지 업로드는 **의도적으로 제외**했습니다. 브리핑 §9의 검증 게이트를 지킵니다.

---

## 0. 두 클라이언트, 하나의 코드

`src/` 아래 모든 로직(인증, API, 실시간, 화면 컨트롤러, 검증)은 확장과 웹이 **완전히 같은 파일**을 씁니다. 플랫폼이 갈리는 지점은 `src/auth.js`와 `src/store.js` 단 두 곳뿐이고, 둘 다 `chrome.identity`/`chrome.storage` 존재 여부로 자동 분기합니다.

- **확장**: `sidepanel.html` → `src/app.js`, 로그인은 `chrome.identity.launchWebAuthFlow` 팝업, 저장은 `chrome.storage.local`.
- **웹**: `app.html` → 같은 `src/app.js`, 로그인은 전체 페이지 리디렉션 후 `auth/callback.html`에서 코드 교환, 저장은 `localStorage`.

```text
index.html            소개 페이지 (사이트 홈)
join.html             초대 링크 수신
app.html              로그인 후 앱 화면
privacy.html          공개 개인정보처리방침
auth/callback.html    OAuth 콜백
tokens.css            디자인 토큰 (라이트/다크 한 벌, 확장·웹 공용)
web/site.css          웹 전용 스타일
web/landing.js        웹 전용 스크립트
web/callback.js
src/                  확장·웹 공용 로직
src/theme.js          라이트/다크 테마 토큰 적용과 저장
src/features/         검색·템플릿·정렬·통계
sidepanel.html        확장 진입점
styles.css            확장 전용 스타일
manifest.json
supabase/schema.sql
```

**배포**: 빌드 단계가 없습니다. **저장소 루트를 그대로 정적 호스트에 올리면** `https://<도메인>/`이 소개 페이지가 됩니다. 빌드 명령 없음, 출력 디렉터리는 루트(`.`).

Supabase Authentication → URL Configuration → Redirect URLs에 웹 콜백 주소를 추가하세요.

```text
https://<도메인>/auth/callback.html
```

확장과 웹은 같은 Supabase 프로젝트·같은 `config.js`를 씁니다 — Redirect URL만 각각 등록하면 됩니다.

호스팅 선택지와 트레이드오프는 [ROADMAP.md](ROADMAP.md)의 "호스팅" 절에 정리했습니다. 저장소가 Private이라 GitHub Pages는 유료 플랜이 필요합니다.

---

## 2. Supabase 준비

1. Supabase 프로젝트를 만듭니다.
2. SQL Editor에서 [`supabase/schema.sql`](supabase/schema.sql) **전체를 한 번** 실행합니다. 여러 번 실행해도 안전합니다.
3. Authentication → Providers → Google을 켜고 Google OAuth Client ID/Secret을 넣습니다.

`schema.sql`이 만드는 것: 테이블 10개, 뷰 4개, 함수 39개, 트리거 7개, RLS 정책 13개, Realtime publication 등록.

**이미 v1을 실행한 프로젝트라면** `schema.sql`을 그대로 다시 실행하면 됩니다. 모든 구문이 멱등(`if not exists` / `or replace`)이라 기존 데이터를 건드리지 않고 새 항목만 추가합니다. 델타만 적용하려면 `supabase/migrations/`를 번호 순으로 실행하세요.

> ⚠️ **[`004-column-grants.sql`](supabase/migrations/004-column-grants.sql)은 보안 수정입니다.** 적용 전에는 같은 스페이스 멤버가 스페이스 비밀번호 해시를 읽을 수 있고, PATCH로 태그를 직접 써서 플랜 한도를 우회할 수 있습니다. 기존 프로젝트라면 지금 실행하세요.

### 보안 점검용 SQL

| 파일 | 용도 |
| --- | --- |
| [`supabase/rls-audit.sql`](supabase/rls-audit.sql) | RLS·권한 설정 감사 15항목. 그대로 붙여넣어 실행 |
| [`supabase/rls-penetration.sql`](supabase/rls-penetration.sql) | A가 B를 공격하는 19가지 시나리오. 파일 맨 위에 실제 UUID 두 개를 넣고 실행. 끝에 `rollback` 하므로 데이터를 바꾸지 않음 |

---

## 2-1. 디자인 시스템

색·간격·유리 효과는 전부 [`tokens.css`](tokens.css) 한 곳에 있습니다. `styles.css`(확장)와 `web/site.css`(웹)는 토큰을 **쓰기만** 하고 정의하지 않습니다. 두 화면이 같은 값을 보도록 강제하려는 것이고, `npm run check`가 이 규칙을 검사합니다.

토큰 이름은 역할로 짓습니다 — `--bg` `--surface` `--surface-hover` `--surface-raised` `--text-primary` `--text-secondary` `--text-muted` `--border` `--glass-highlight` `--shadow` `--accent`. 라이트와 다크가 **같은 이름**을 쓰고 값만 다릅니다.

유리 효과는 blur 단계를 셋으로 제한했습니다. 카드 14px, 상하단 바 24px, 모달 32px. `backdrop-filter`는 비싼 속성이라 단계를 늘리지 마세요.

테마는 `:root[data-theme="light"|"dark"]`로 정해집니다. 아무것도 없으면 `prefers-color-scheme`을 따르는데, 그 블록은 반드시 `:root:not([data-theme])`로 감싸야 사용자가 고른 테마를 시스템이 덮어쓰지 않습니다.

**대비는 디자인보다 우선입니다.** 모든 텍스트 토큰은 유리 위·배경 위·반투명 표면 위 세 경우 모두에서 WCAG AA(4.5:1)를 넘도록 맞춰져 있습니다. 색을 바꾸면 세 경우를 다시 재보세요.

---

## 3. 확장 ID와 리디렉션 주소 (순서 주의)

브리핑 §13의 경고대로, **확장 ID가 먼저 확정돼야 OAuth가 깨지지 않습니다.**

`manifest.json`에 **`key`가 박혀 있습니다.** 이 값이 확장 ID를 결정하므로, 저장소를 받은 사람은 **누구든 같은 확장 ID**를 갖습니다. 개발자마다 ID가 달라져서 로그인이 깨지는 문제를 막기 위한 것입니다.

현재 확장 ID와 등록해야 할 주소는 `npm run check`가 그대로 출력합니다.

```bash
npm run check
```

Supabase → Authentication → URL Configuration → Redirect URLs에 그 주소를 **한 번만** 등록하면 팀 전원이 그대로 씁니다.

```text
https://<npm run check가 출력한 ID>.chromiumapp.org/supabase-auth
```

> ⚠️ `manifest.json`의 `key`를 지우거나 바꾸면 확장 ID가 바뀌어 **팀 전원의 로그인이 동시에 깨집니다.** 건드리지 마세요. `key`는 공개키라 저장소에 커밋해도 안전합니다(비밀키가 아닙니다).

**웹스토어에 올릴 때**: 스토어가 자체 키로 ID를 정합니다. 최초 업로드 후 대시보드에서 스토어가 발급한 공개키를 받아 `key` 값을 그것으로 교체하면, 개발 환경과 배포 환경의 ID가 같아집니다. 교체한 뒤에는 새 ID로 Redirect URLs를 다시 등록해야 합니다.

로그인 창에서 `Authorization page could not be loaded.`가 나오면 위 주소가 Redirect URLs에 없거나 현재 확장 ID와 다르다는 뜻입니다. 확장 로그인 화면에 표시되는 `로그인 연결 설정 확인`을 열고 실제 콜백 주소를 복사해 등록하세요.

Google Cloud Console의 OAuth 클라이언트 → 승인된 리디렉션 URI:

```text
https://<프로젝트REF>.supabase.co/auth/v1/callback
```

---

## 4. 공개 설정 입력

[`config.js`](config.js)에 Project URL과 anon key를 넣습니다.

```js
export const CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT_REF.supabase.co",
  supabaseAnonKey: "YOUR_SUPABASE_ANON_KEY",
  webOrigin: "https://YOUR_DOMAIN"
};
```

`webOrigin`은 확장에서 초대 링크를 만들 때 쓰는 웹 주소입니다. 웹 앱은 현재 주소를 자동으로 씁니다. 실제 https 도메인이 들어가기 전까지 확장은 **초대 링크를 만들지 않고** 코드·비밀번호 초대로 안내합니다 — 못 쓰는 링크를 만들면서 초대 토큰만 소모하지 않기 위해서입니다.

anon key는 RLS와 함께 클라이언트에서 쓰라고 만들어진 공개 키입니다. `service_role` key, DB 비밀번호, (나중에 추가될) R2 access key는 **절대** 넣지 마세요. 브리핑 §6대로 R2 키는 Edge Function에만 둡니다. `npm run check`가 이 파일에 비밀 키로 보이는 값이 있으면 실패합니다.

---

## 5. Chrome에서 실행

1. `chrome://extensions` → 개발자 모드 켜기
2. `압축해제된 확장 프로그램을 로드합니다` → 이 폴더 선택
3. 툴바 아이콘을 누르면 사이드 패널이 열립니다

`manifest.json`이나 `config.js`를 바꾼 뒤에는 확장 카드의 새로고침 버튼을 누르세요.

---

## 6. 검사

Node.js 20 이상. 설치할 패키지가 없습니다.

```bash
npm run check
```

```bash
npm test
```

`npm run check`가 검사하는 것: manifest 참조 파일과 **과도한 권한**(tabs·history·cookies·`<all_urls>`), CSP의 `wss://`, 모든 HTML의 인라인 스크립트와 깨진 링크, JS의 깨진 import 경로, config.js의 비밀 키, schema.sql의 필수 구문(용량 트리거 3종·auth 트리거·replica identity·신규 테이블의 RLS와 anon 권한 회수·**컬럼 단위 권한**), **`sidepanel.html`과 `app.html`의 id 집합 대조**, **HTML 문자열 주입 금지**, 전체 JS 문법, 그리고 **모든 코드 파일에 주석이 없는지**.

`npm test`는 검색(초성·띄어쓰기·태그), 템플릿 변수, 정렬, 바이트 계산, 스토리지 폴백, OAuth 오류 매핑, API 계층(토큰 갱신 재시도·id 인코딩·오류 변환), manifest key, analytics 개인정보 불변식, clipboard 읽기·쓰기 규칙, realtime 파싱·재연결, 오류 메시지를 다룹니다.

### 출시 직전

```bash
npm run check:release
```

`npm run check`의 모든 항목에 더해, **배포물에 `YOUR_DOMAIN`·`[운영자]` 같은 자리표시자가 하나라도 남아 있으면 실패**합니다. 검사 대상은 `src/`·`web/`·`auth/`·루트의 `.html`/`.js`/`.css`와 `config.js`, `PRIVACY.md`입니다. `config.example.js`와 문서·테스트·SQL은 자리표시자를 그대로 둬도 됩니다.

CI(`.github/workflows/check.yml`)는 main 푸시와 PR마다 `check`/`test`를, `v*` 태그를 밀거나 수동 실행할 때 `check:release`까지 돌립니다.

SQL 문법은 `npm run check`가 문자열로만 훑습니다. 스키마를 고쳤다면 실제 Postgres 파서로 따로 검증하세요 — `pip install pglast` 후 `parse_sql`(top-level)과 `parse_plpgsql`(함수 본문)을 돌리면 됩니다. `HANDOFF.md` §9에 스크립트가 있습니다.

---

## 7. 브리핑 확정 사항이 코드 어디에 있는지

| 브리핑 | 위치 |
| --- | --- |
| §3 박스 = 최신 1개, 덮어쓰기 | `boxes.text_content` 단일 컬럼, `saveBoxText`의 PATCH |
| §3 텍스트 영구 보관 | `boxes.expires_at`은 텍스트일 때 항상 NULL (`boxes_kind_shape` 제약) |
| §3 온보딩 자동 생성 | `ensure_personal_space()` RPC |
| §7 텍스트 10KB 상한 | `boxes_text_size` 제약 + `validateBoxText` |
| §13 용량 트리거 INSERT/UPDATE/**DELETE** | `boxes_sync_usage` 트리거 (세 분기 모두) |
| §13 클립보드 Promise 규칙 | `src/clipboard.js`의 `copyTextFrom` |
| §13 R2에 RLS 안 걸림 | 해당 없음 (v1은 R2 미사용) |
| §13 Realtime은 사이드 패널에서 | `src/realtime.js`, 서비스 워커는 패널 열기만 담당 |
| §13 스페이스 하나만 구독, 안 보이면 끊기 | `BoxRealtime.watch` + `visibilitychange` → `suspend()` |
| §13 profiles 트리거 | `on_auth_user_created` + 기존 사용자 백필 |
| §10 결제 없이 수요 측정 | `upgrade_intents` + `offerUpgrade()` |
| §11 다운그레이드 시 초과분 읽기 전용 | `boxes.locked` + 트리거의 `BOX_LOCKED` |

---

## 8. 브리핑에 없어서 내가 제안한 것 (확정 아님)

브리핑 지침 5번에 따라, 문서에 없던 세부사항은 아래처럼 정하고 표시해 둡니다. 마음에 안 들면 바꾸면 됩니다.

- **비밀번호 최소 6자.** 브리핑에 길이 규정이 없었습니다.
- **스페이스는 비밀번호가 없는 상태로 시작합니다.** `내 공간`이 자동 생성될 때 비밀번호를 묻지 않아야 "5초 안에 시작"(§3 온보딩)이 지켜지는데, 해시로 저장하면 자동 생성한 비밀번호를 주인도 볼 수 없습니다. 그래서 `password_hash`를 NULL로 두고 = 참여 잠김, 주인이 `팀원 초대 열기`를 누를 때 비밀번호를 정하고 그 자리에서 한 번만 보여주는 구조로 만들었습니다.
- **박스 개수 한도는 스페이스 단위**이고, 스페이스를 만든 사람의 플랜을 따릅니다 (`spaces.box_limit`). Free는 스페이스 1개라 §7의 "1인 = 10박스" 계산과 같은 값이 됩니다.
- **박스 이름 중복 허용.** 유니크 제약을 걸면 이름 바꾸기가 자주 실패해서 뺐습니다.
- **자동 저장은 입력 후 0.7초, 붙여넣기는 즉시.** 포커스가 빠질 때도 저장합니다.
- **충돌 처리**: 내가 편집 중인 박스에 팀원 수정이 들어오면 덮어쓰지 않고 `팀원이 수정함 · 불러오기` 배지를 띄웁니다.
- **용량 막대는 바이트가 아니라 박스 개수를 표시합니다.** v1은 텍스트뿐이라 50MB 대비 사용량이 항상 0%에 붙어 막대가 무의미하기 때문입니다. 파일 단계가 오면 바이트 막대로 바꾸고, 그때 §7이 요구한 "주당 50MB씩 계속" 문구를 넣어야 합니다.
- **owner는 스페이스를 나갈 수 없습니다** (삭제만 가능). 위임 UI는 §12 미결정이라 만들지 않았습니다.
- **v1 UI는 한국어 전용**입니다. 다국어 지원 범위는 여전히 미결정이며 검증 이후 정합니다.
- **사용량 통계는 검증 게이트에 필요한 최소 이벤트만 수집**합니다. 문구 내용은 보내지 않고, 이벤트 이름은 DB CHECK로, 속성 키·자료형·길이는 `log_event()`에서 다시 제한합니다.
- **즐겨찾기·사용 기록은 개인별**(`box_user_state`)입니다. 팀원끼리 서로의 즐겨찾기가 섞이지 않습니다.
- **가격과 Team 노출은 보류**했습니다. Pro 준비안은 브리핑 확정값인 박스 50개·스페이스 3개만 표시하고, 가격은 실제 사용 검증 이후 정합니다.

---

## 9. 다음에 할 일

전부 [ROADMAP.md](ROADMAP.md)에 있습니다. 요약하면:

1. **0단계 — 출시 준비**: Supabase 프로젝트, Google OAuth, `config.js`, 호스팅, 개인정보처리방침 실명 채우기. 코드 작업은 없고 전부 계정·설정 작업입니다.
2. **1단계 — 검증 게이트(브리핑 §9, 건너뛰기 금지)**: 실제 팀에서 2주간 써보고 "아무도 시키지 않았는데 3일 이상 계속 쓰는 사람이 있는가"를 봅니다. 없으면 여기서 멈춥니다.
3. **2단계 — 파일·이미지**: 게이트를 통과한 뒤에만. R2 + Edge Function.
4. **3단계 — 결제**: v2. 지금은 `upgrade_intents` 클릭 로그만 쌓습니다.

브리핑 §12의 미결정 사항과 알려진 리스크도 ROADMAP에 정리돼 있습니다.
