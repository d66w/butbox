# 출시 체크리스트 — 현재 상태 점검 결과

점검일: 2026-08-26 · 대상: `BUTBOX_RELEASE_CHECKLIST.md`
점검 방법: 코드 정적 분석 + `npm run check` + `npm test` + 실제 브라우저에서 웹 화면 구동

---

## 요약

| 구분 | 개수 | 설명 |
| --- | --- | --- |
| ✅ 코드로 확인 완료 | 34 | 아래 A |
| 🐛 이번에 찾아 고친 버그 | 4 | 아래 B |
| 👤 사람만 가능 | 대다수 | 아래 D |

**핵심**: 체크리스트의 실제 기능 테스트(2~8장)는 여전히 **사람이 실제 Chrome에서 두 개의 Google 계정으로** 해야 합니다. 목(mock) 검증은 실제 환경 검증을 대체하지 못합니다.

**이번 점검에서 웹 앱이 아예 부팅되지 않는 버그를 찾았습니다.** 아래 B-1을 먼저 읽으세요.

---

## A. 지금 확인 완료

### §10 정적 검사 — 전부 통과
- [x] `npm run check` 통과 (파일 61개)
- [x] `npm test` 통과 (**95개** 전부)
- [x] manifest 참조 파일 정상
- [x] JS import 경로 정상
- [x] 전체 JS 문법 정상
- [x] HTML 링크 정상
- [x] CSP 정상 — `connect-src`에 supabase https/wss 포함
- [x] 과도한 Chrome 권한 없음 — `tabs`/`history`/`cookies`/`webNavigation`/`<all_urls>` 모두 없음
- [x] config에 secret/service_role key 없음
- [x] Supabase schema 필수 구문 정상
- [x] RLS 활성화 확인 — 10개 테이블 전부
- [x] anon 권한 회수 확인
- [x] placeholder 검색 — **이제 `npm run check:release`에서 실패로 처리됩니다** (§C-1)
- [x] SQL 전체가 실제 Postgres 파서(libpg_query)로 파싱됨

### 이번에 추가된 검사
- [x] `sidepanel.html`과 `app.html`의 id 집합이 갈라지면 실패 (B-1 재발 방지)
- [x] `src/app.js`가 확장 전용 id를 확인 없이 쓰면 실패
- [x] 어떤 JS도 `innerHTML`/`insertAdjacentHTML`/`document.write`를 쓰지 않음
- [x] `boxes`/`spaces`에 테이블 단위 쓰기·읽기 권한이 다시 열리면 실패
- [x] `grant all ... to anon/authenticated/public`이 생기면 실패

### §1-2 Extension ID
- [x] Extension ID 고정 — `manifest.json`의 `key`
  - 확장 ID: `polkcadchekgljdfhadoabgcojpjpkgj`
  - 등록할 주소: `https://polkcadchekgljdfhadoabgcojpjpkgj.chromiumapp.org/supabase-auth`
- [x] `chrome.identity.getRedirectURL()` 기준 Redirect URL이 위 값과 일치
- [x] 소스 어디에도 확장 ID를 하드코딩하지 않음 (테스트로 확인)

### §7 한도 정책 (브리핑 §10 대조) — 코드·DB·랜딩 3곳 모두 일치
- [x] Free = 박스 10 · 스페이스 1
- [x] Pro = 박스 50 · 스페이스 3
- [x] Team = 박스 100 · 스페이스 10
- [x] 텍스트 10KB — DB 제약 `octet_length <= 10240` + 클라이언트 `TEXT_MAX_BYTES`
- [x] Space member limit = `null` (무제한, 브리핑 §3)
- [x] 가격 = 0 / "가격 미정" (브리핑 §12 미결정)

### §9 자동 테스트
- [x] 인증 흐름 (OAuth 오류 매핑)
- [x] **API 함수 (신규 `tests/api.test.js` 11개)** — 헤더, 토큰 갱신 재시도, id 인코딩, 오류 변환
- [x] analytics 개인정보 불변식
- [x] clipboard 사용자 제스처 규칙
- [x] realtime 이벤트 파싱 · 재연결 backoff
- [x] 오류 메시지 (신규 4개 포함)

---

## B. 이번 점검에서 찾아 고친 버그

### 🔴 B-1. 웹 앱이 부팅 자체를 못 하고 있었음
`src/app.js`의 `boot()`이 `#signin-redirect-url`을 확인 없이 건드리는데 그 요소는 `sidepanel.html`에만 있습니다. `app.html`에서는 첫 줄에서 TypeError가 나고 `wireStaticHandlers()`가 실행되지 않아 **"Google로 시작하기" 버튼이 아무 동작도 하지 않았습니다.** 웹 앱 전체가 죽어 있었습니다.

브라우저에서 재현 → 수정 → 재확인했습니다. 같은 실수가 다시 나오지 않도록 `npm run check`에 id 대조 검사를 넣었고, 일부러 되돌려서 검사가 잡는 것까지 확인했습니다.

### 🟠 B-2. 서버 오류가 사용자에게 영문 코드 그대로 노출
`src/api.js`가 서버 오류를 `AppError("REQUEST_FAILED", 원문)`으로 감쌌는데 `errorMessage()`가 `AppError`면 원문을 그대로 돌려줬습니다. 결과: 비밀번호를 틀리면 토스트에 `WRONG_PASSWORD`, 한도가 차면 `BOX_LIMIT_REACHED`가 그대로 떴습니다. Postgres 제약 위반 문구도 그대로 노출됐습니다.

체크리스트 §8이 이미 `[x]`로 표시해 둔 항목이지만 실제로는 깨져 있었습니다. 이제 모든 경로가 매핑을 거치고, 한글이 없는 기술적 문구는 일반 문장으로 대체됩니다. 원문 코드는 `error.message`에 그대로 남아 있어 기존 분기 로직은 영향받지 않습니다.

### 🟠 B-3. 초대 링크가 `https://YOUR_DOMAIN/join.html?t=...`로 만들어짐
`webOrigin()`이 설정값을 검증하지 않아 못 쓰는 링크를 만들면서 초대 토큰만 소모했습니다. 하드코딩된 `https://butbox.app` 대체값도 있었습니다(실제 소유 도메인 아님). 이제 실제 https 도메인이 설정돼 있을 때만 링크를 만들고, 아니면 코드·비밀번호 초대로 안내합니다.

### 🟡 B-4. `el()`의 `innerHTML` 경로
`src/ui.js`의 DOM 헬퍼에 쓰이지 않는 `html:` 옵션이 있어 HTML 문자열을 그대로 주입할 수 있었습니다. 제거하고, `innerHTML`/`outerHTML`/`srcdoc`을 프로퍼티로도 못 넣게 막았습니다.

---

## C. 보안 강화 (SQL 반영 완료, 적용은 사람이)

### C-1. placeholder가 배포물에 남으면 실패
```bash
npm run check:release
```
`config.js`, `PRIVACY.md`, `privacy.html`, 그리고 `src/`·`web/`·`auth/`·루트의 모든 `.html`/`.js`/`.css`를 검사합니다. `config.example.js`와 문서·테스트·SQL은 제외합니다. CI에서는 `v*` 태그를 밀거나 수동 실행할 때 돌아갑니다. 평소 `npm run check`는 목록만 보여주고 통과시킵니다.

### C-2. 스페이스 비밀번호 해시를 멤버가 읽을 수 있었음
`grant select on public.spaces`가 전체 컬럼에 걸려 있어 같은 스페이스 멤버가 `password_hash`(bcrypt)를 읽을 수 있었습니다. `space_summaries` 뷰는 `join_enabled` 불리언만 노출하도록 만들어져 있었는데, 기반 테이블 권한이 그 의도를 무너뜨렸습니다.

`space_join_enabled()` security definer 함수를 만들어 뷰가 해시를 직접 읽지 않게 하고, `spaces`의 select를 컬럼 단위로 좁혔습니다.

### C-3. 멤버가 태그를 직접 써서 플랜 한도를 우회할 수 있었음
`grant update on public.boxes`가 전체 컬럼이라 PostgREST PATCH로 `tags`를 직접 쓸 수 있었고, `set_box_tags()`의 정규화와 플랜별 `tag_limit`이 통째로 우회됐습니다. 태그 배열에는 길이 제약이 없어 용량 우회 경로이기도 했습니다. 이제 `update (name, text_content)`만 열려 있습니다.

### C-4. `effective_plan(uuid)` 권한 회수
아무 사용자의 UUID로 그 사람의 플랜을 조회할 수 있었습니다. 클라이언트는 쓰지 않고 내부 security definer 함수만 쓰므로 `authenticated`에서 회수했습니다.

> **적용 방법 (사람이 해야 함)**: Supabase SQL Editor에서
> [`supabase/migrations/004-column-grants.sql`](supabase/migrations/004-column-grants.sql)을 실행하세요.
> 새 프로젝트라면 `schema.sql`에 이미 반영돼 있습니다.

### C-5. RLS 침투 테스트 SQL 작성 완료
[`supabase/rls-penetration.sql`](supabase/rls-penetration.sql) — A가 B의 데이터를 조회·수정·삭제, 다른 스페이스 접근, 초대 토큰 위조, 권한 승격, 구독 조작, 비밀번호 해시 읽기, anon 접근까지 **19가지 공격**을 실제 역할로 전환해 시도하고 PASS/FAIL 표를 냅니다. 마지막에 `rollback` 하므로 데이터를 바꾸지 않습니다.

**실행은 사람이 해야 합니다.** 파일 맨 위 `v_attacker` / `v_victim`에 실제 UUID 두 개를 넣고 SQL Editor에서 돌리세요.

---

## D. 사람만 가능 — 우선순위 순

### 🔴 D-1. 지금 당장 (출시 차단)

**1. Supabase Redirect URL 등록**
```
https://polkcadchekgljdfhadoabgcojpjpkgj.chromiumapp.org/supabase-auth
```
→ Supabase → Authentication → URL Configuration → Redirect URLs

**2. `supabase/migrations/004-column-grants.sql` 실행** — C-2·C-3·C-4 보안 구멍이 지금 운영 DB에 열려 있습니다.

**3. 확장 재로드** — ID가 바뀌었으므로 **제거 후 다시 로드**(새로고침만으론 안 됨).

**4. `supabase/rls-penetration.sql` 실행** — 실패 항목이 하나라도 나오면 출시 중단.

**5. 남아 있는 placeholder 9건**
| 파일 | 내용 |
| --- | --- |
| `config.js` | `webOrigin: "https://YOUR_DOMAIN"` |
| `privacy.html` | `[운영자]` `[이메일]` `[프로젝트 리전]` `[사업자 정보]` |
| `PRIVACY.md` | 동일 |

### 🔴 D-2. 실제 환경 테스트 (대신 못 함)

- OAuth 로그인/로그아웃/재로그인/세션 만료 (§1-1)
- **Google 계정 2개로 Team·Realtime 테스트** (§5) — 초대, 권한, 실시간 반영, 충돌 UI
- 실제 사이트 삽입 테스트 (§4) — React/Vue/Google/Naver/Slack/iframe
- 네트워크 장애 테스트 (§8)
- 새로고침 후 데이터 유지 (§2-2, §2-4)

### 🟠 D-3. 배포 준비

- 호스팅 선택 (Cloudflare Pages / Vercel / Netlify) — 저장소가 Private이라 GitHub Pages는 유료
- 도메인 연결 → `webOrigin` 확정 → Supabase Site URL/Redirect URL 갱신
- Chrome Web Store 개발자 계정, 스크린샷, 심사 제출
- **웹스토어 업로드 후 `key` 교체** — 스토어 공개키로 바꾸고 Redirect URL 재등록

### 🟢 D-4. 베타 (§13)

- 실사용자 1~3명 배포 → 2주 관찰
- **판정 기준**: 3일 이상 자발적으로 쓰는 사용자가 있는가 (브리핑 §9 게이트)

---

## E. 고치지 않고 남겨둔 것 (판단이 필요해서)

### E-1. 로그아웃 상태에서 초대 미리보기가 동작하지 않음
`join.html`은 로그인 전에 `peek_invite`로 스페이스 이름과 인원을 보여주려 하지만, `peek_invite`는 `authenticated`에게만 열려 있어 **항상 실패하고 일반 문구로 대체**됩니다. 즉 이 미리보기는 유일한 사용처에서 절대 동작하지 않습니다.

고치려면 `peek_invite`를 `anon`에게도 열어야 합니다. 토큰이 36자 hex라 추측은 불가능하고 노출되는 정보는 스페이스 이름과 인원수뿐이지만, **인증 없는 RPC를 여는 보안 결정**이라 임의로 하지 않았습니다. 지금도 크래시 없이 동작은 합니다.

### E-2. admin 역할을 UI에서 부여할 방법이 없음
`src/app.js`의 `changeMemberRole()`이 정의만 되고 **어디서도 호출되지 않습니다.** 초대 링크도 `"member"`로 고정돼 있습니다. DB는 owner/admin/member를 모두 지원하지만 실제로 admin이 되는 경로가 없어, 체크리스트 §5-2의 admin 권한 테스트는 지금 상태로는 수행 자체가 불가능합니다.

기능을 붙일지, admin을 v1에서 빼고 문서를 맞출지는 제품 결정이라 남겨 뒀습니다.

### E-3. 쓰이지 않는 코드
`api.describeSpace`, `auth.onSessionChange`, `constants.FILE_RETENTION_DAYS`가 어디서도 호출되지 않습니다. `FILE_RETENTION_DAYS`는 브리핑 §9 게이트로 만들지 않기로 한 파일 업로드 잔재라 특히 오해를 부를 수 있습니다.

### E-4. `invitations` 읽기는 owner만
`create_invite`/`revoke_invites`는 admin도 허용하는데 `invitations_read_admin` 정책은 owner만 허용합니다. 더 좁은 쪽이라 보안 구멍은 아니지만 일관되지 않습니다.
