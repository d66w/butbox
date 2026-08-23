# 붙박스

자주 쓰는 문구를 이름표 붙은 "박스"에 넣어두고, 같은 스페이스에 속한 팀원이 다른 기기에서 꺼내 씁니다. Chrome MV3 사이드 패널 확장 프로그램과 웹사이트, 두 클라이언트가 같은 Supabase 백엔드를 공유합니다.

브리핑 §9의 검증 게이트를 지켜 **v1은 텍스트 기능만** 구현했습니다. 파일·이미지 업로드(R2)와 결제는 들어 있지 않습니다. 이 게이트는 확장과 웹 모두에 동일하게 적용됩니다.

다음에 할 일은 [ROADMAP.md](ROADMAP.md)에 있습니다.

---

## 0. 두 클라이언트, 하나의 코드

`src/` 아래 모든 로직(인증, API, 실시간, 화면 컨트롤러, 검증)은 확장과 웹이 **완전히 같은 파일**을 씁니다. 플랫폼이 갈리는 지점은 `src/auth.js`와 `src/store.js` 단 두 곳뿐이고, 둘 다 `chrome.identity`/`chrome.storage` 존재 여부로 자동 분기합니다.

- **확장**: `sidepanel.html` → `src/app.js`, 로그인은 `chrome.identity.launchWebAuthFlow` 팝업, 저장은 `chrome.storage.local`.
- **웹**: `app.html` → 같은 `src/app.js`, 로그인은 전체 페이지 리디렉션 후 `auth/callback.html`에서 코드 교환, 저장은 `localStorage`.

```text
index.html            소개 페이지 (사이트 홈)
app.html              로그인 후 앱 화면
privacy.html          공개 개인정보처리방침
auth/callback.html    OAuth 콜백
web/site.css          웹 전용 스타일
web/landing.js        웹 전용 스크립트
web/callback.js
src/                  확장·웹 공용 로직
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

## 1. 지금 되는 것

| 기능 | 상태 |
| --- | --- |
| Google OAuth 로그인 (PKCE) | 구현 |
| 첫 로그인 시 `내 공간` 자동 생성 | 구현 |
| 텍스트 박스 붙여넣기 · 덮어쓰기 · 복사 | 구현 |
| Supabase Realtime로 팀원 화면 실시간 반영 | 구현 |
| 스페이스 코드 + 비밀번호로 참여 | 구현 |
| 스페이스/멤버 관리, 박스 순서 바꾸기 | 구현 |
| 박스 한도 도달 시 `upgrade_intents` 클릭 로깅 | 구현 |
| 파일·이미지 업로드 | **미구현 (§9 게이트 통과 후)** |
| 결제·유료 플랜 UI | **미구현 (v2)** |

플랜 한도(Free/Pro/Team)는 `plans` 테이블과 상수에 전부 들어 있지만, v1 UI는 Free만 노출합니다. 나중에 Pro/Team을 켤 때 스키마 마이그레이션이 필요 없도록 미리 넣어둔 것입니다.

---

## 2. Supabase 준비

1. Supabase 프로젝트를 만듭니다.
2. SQL Editor에서 [`supabase/schema.sql`](supabase/schema.sql) **전체를 한 번** 실행합니다. 여러 번 실행해도 안전합니다.
3. Authentication → Providers → Google을 켜고 Google OAuth Client ID/Secret을 넣습니다.

`schema.sql`이 만드는 것: 테이블 6개, 뷰 2개, RPC 17개, 트리거 5개, RLS 정책 8개, Realtime publication 등록.

---

## 3. 확장 ID와 리디렉션 주소 (순서 주의)

브리핑 §13의 경고대로, **확장 ID가 먼저 확정돼야 OAuth가 깨지지 않습니다.**

- **공개 배포가 목적이라면**: 먼저 Chrome Web Store에 draft를 올려 확장 ID를 확정한 뒤 아래 주소를 등록하세요.
- **로컬 확인만 할 거라면**: `chrome://extensions`에 폴더를 로드한 뒤 표시되는 ID를 씁니다. 설정 화면의 `복사` 버튼이 같은 값을 보여줍니다.

Supabase → Authentication → URL Configuration → Redirect URLs:

```text
https://<확장ID>.chromiumapp.org/supabase-auth
```

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
  supabaseAnonKey: "YOUR_SUPABASE_ANON_KEY"
};
```

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

`npm run check`는 manifest 참조 파일, CSP의 `wss://`, 모든 HTML의 인라인 스크립트와 깨진 링크, JS의 깨진 import 경로, config.js의 비밀 키, schema.sql의 필수 구문(용량 트리거 3종·auth 트리거·replica identity·RLS), 전체 JS 문법, 그리고 **모든 코드 파일에 주석이 없는지**를 검사합니다.

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
- **한국어 전용**, 문구는 하드코딩입니다 (§12 미결정 → 한국어만으로 결정).
- **사용량 통계는 `upgrade_intents`만** 수집합니다 (§12 미결정 → 최소 수집으로 결정).

---

## 9. 다음에 할 일

전부 [ROADMAP.md](ROADMAP.md)에 있습니다. 요약하면:

1. **0단계 — 출시 준비**: Supabase 프로젝트, Google OAuth, `config.js`, 호스팅, 개인정보처리방침 실명 채우기. 코드 작업은 없고 전부 계정·설정 작업입니다.
2. **1단계 — 검증 게이트(브리핑 §9, 건너뛰기 금지)**: 실제 팀에서 2주간 써보고 "아무도 시키지 않았는데 3일 이상 계속 쓰는 사람이 있는가"를 봅니다. 없으면 여기서 멈춥니다.
3. **2단계 — 파일·이미지**: 게이트를 통과한 뒤에만. R2 + Edge Function.
4. **3단계 — 결제**: v2. 지금은 `upgrade_intents` 클릭 로그만 쌓습니다.

브리핑 §12의 미결정 사항과 알려진 리스크도 ROADMAP에 정리돼 있습니다.
