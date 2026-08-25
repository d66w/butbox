# 출시 체크리스트 — 현재 상태 점검 결과

점검일: 2026-08-25 · 대상: `BUTBOX_RELEASE_CHECKLIST.md`
점검 방법: 코드 정적 분석 + `npm run check` + `npm test` 실제 실행

---

## 요약

| 구분 | 개수 | 설명 |
| --- | --- | --- |
| ✅ 코드로 확인 완료 | 21 | 아래 A 목록. 지금 검증됨 |
| 🤖 내가 더 할 수 있음 | 9 | 아래 B 목록. 말해주면 바로 함 |
| 👤 사람만 가능 | 대다수 | 아래 C 목록. 실제 브라우저·계정·대시보드 필요 |

**핵심**: 체크리스트의 실제 기능 테스트(2~8장)는 **거의 전부 사람이 실제 Chrome에서 두 개의 Google 계정으로** 해야 합니다. 제가 목(mock)으로 검증한 적은 있지만 그건 실제 환경 검증을 대체하지 못합니다.

---

## A. 지금 확인 완료 (21항목)

### §10 정적 검사 — 전부 통과
- [x] `npm run check` 통과 (파일 51개)
- [x] `npm test` 통과 (48개 전부)
- [x] manifest 참조 파일 정상
- [x] JS import 경로 정상
- [x] 전체 JS 문법 정상
- [x] HTML 링크 정상
- [x] CSP 정상 — `connect-src`에 supabase https/wss 포함
- [x] 과도한 Chrome 권한 없음 — `tabs`/`history`/`cookies`/`webNavigation`/`<all_urls>` **모두 없음**
- [x] config에 secret/service_role key 없음 — 클라이언트 코드 전체 검색 결과 0건
- [x] Supabase schema 필수 구문 정상
- [x] RLS 활성화 확인 — **10개 테이블 전부**: `analytics_events` `box_user_state` `boxes` `invitations` `plans` `profiles` `space_members` `spaces` `subscriptions` `upgrade_intents`
- [x] anon 권한 회수 확인 — `revoke all ... from anon, authenticated` 14건
- [x] placeholder 문자열 검색 — 실행함 (결과는 C-1 참고, **미완 항목 있음**)

### §1-2 Extension ID
- [x] `chrome.identity.getRedirectURL()` 기준 Redirect URL 확인 완료
- [x] Extension ID 고정 완료 — `manifest.json`에 `key` 추가
  - 확장 ID: `polkcadchekgljdfhadoabgcojpjpkgj`
  - 등록할 주소: `https://polkcadchekgljdfhadoabgcojpjpkgj.chromiumapp.org/supabase-auth`
- [x] Google Cloud OAuth 설정 확인 — 확장 ID와 무관함을 확인. Supabase 콜백만 필요

### §7 한도 상수 (브리핑 §10 대조)
- [x] Free 박스 한도 = 10, 스페이스 1
- [x] Pro = 박스 50, 스페이스 3
- [x] Team = 박스 100, 스페이스 10
- [x] 10KB 텍스트 제한 — DB 제약 `octet_length <= 10240` + 클라이언트 `TEXT_MAX_BYTES`
- [x] Space member limit — `null` = **무제한** (브리핑 §3 "참여는 무제한"과 일치)

### 권한 최소화
- [x] `permissions`: `activeTab` `clipboardWrite` `contextMenus` `identity` `scripting` `sidePanel` `storage`
- [x] `host_permissions`: `https://*.supabase.co/*` 만
- [x] 웹사이트 접근은 `optional_host_permissions` — 사용자가 삽입 기능 쓸 때만 동의

---

## B. 내가 더 할 수 있는 것 (지시하면 바로)

- [ ] **B-1. 브랜치 정리** — 현재 로컬과 원격이 **각각 1커밋씩 갈라져 있음**(ahead 1, behind 1). 병합하고 푸시
- [ ] **B-2. 커밋 안 된 협업자 작업 정리** — 13개 수정 파일 + 새 파일 4개가 미커밋 상태. 검토 후 커밋
- [ ] **B-3. `webOrigin` 채우기** — 배포 도메인만 알려주면 `config.js` 수정
- [ ] **B-4. 개인정보처리방침 실명 입력** — 운영자명/이메일/사업자 정보 주면 `PRIVACY.md`와 `privacy.html` 동시 반영 + 리전은 `ap-northeast-2` 등으로 채움
- [ ] **B-5. §9 자동 테스트 강화** — 체크리스트가 요청한 것 중 순수 로직은 가능:
  - API 함수 테스트 (mock fetch)
  - 초대 로직 테스트
  - 템플릿+복사 통합 테스트
  - (Realtime/E2E는 실제 환경 필요 → C로)
- [ ] **B-6. placeholder 검사를 `npm run check`에 추가** — 배포물에 `[운영자]`/`YOUR_DOMAIN`이 남으면 실패하게
- [ ] **B-7. Web Store 제출용 설명·권한 사유 문안 작성** — 심사에서 요구하는 각 권한의 정당화 문구
- [ ] **B-8. RLS 침투 테스트 SQL 작성** — A가 B 데이터에 접근 시도하는 쿼리 모음. 사람이 Supabase SQL Editor에 붙여넣어 실행
- [ ] **B-9. 웹 앱 화면 톤 통일** — `web/site.css`가 아직 예전 초록 팔레트. 확장의 slow roads 톤으로 맞출지 미결정

---

## C. 사람만 가능 — 우선순위 순

### 🔴 C-1. 지금 당장 (출시 차단)

**Supabase Redirect URL 등록**
```
https://polkcadchekgljdfhadoabgcojpjpkgj.chromiumapp.org/supabase-auth
```
→ Supabase → Authentication → URL Configuration → Redirect URLs

**확장 재로드** — ID가 바뀌었으므로 **제거 후 다시 로드**(새로고침만으론 안 됨). 친구도 동일.

**남아 있는 placeholder** (검색 결과)
| 파일 | 내용 |
| --- | --- |
| `config.js:4` | `webOrigin: "https://YOUR_DOMAIN"` |
| `privacy.html:26,148,161,184` | `[운영자]` `[이메일]` `[프로젝트 리전]` `[사업자 정보]` |
| `PRIVACY.md:5,73,81,105` | 동일 |

> `config.example.js`, `README.md`, `src/auth.js`의 placeholder는 **정상**입니다. 각각 템플릿·문서·설정 감지용이라 그대로 둬야 합니다.

### 🔴 C-2. 실제 환경 테스트 (제가 대신 못 함)

- OAuth 로그인/로그아웃/재로그인/세션 만료 (§1-1)
- **Google 계정 2개로 Team·Realtime 테스트** (§5) — 초대, 권한, 실시간 반영, 충돌 UI
- **RLS 침투 테스트** (§6) — A가 B 데이터 접근 시도
- 실제 사이트 삽입 테스트 (§4) — React/Vue/Google/Naver/Slack/iframe
- 네트워크 장애 테스트 (§8)

### 🟠 C-3. 배포 준비

- 호스팅 선택 (Cloudflare Pages / Vercel / Netlify) — 저장소가 Private이라 GitHub Pages는 유료
- 도메인 연결 → `webOrigin` 확정 → Supabase Site URL/Redirect URL 갱신
- Chrome Web Store 개발자 계정, 스크린샷, 심사 제출
- **웹스토어 업로드 후 `key` 교체** — 스토어가 발급한 공개키로 바꾸고 Redirect URL 재등록

### 🟢 C-4. 베타 (§13)

- 실사용자 1~3명 배포 → 2주 관찰
- **판정 기준**: 3일 이상 자발적으로 쓰는 사용자가 있는가 (브리핑 §9 게이트)

---

## 발견한 문제

**브랜치가 갈라져 있음** — 로컬 `main`이 원격보다 1 앞서고 1 뒤처져 있습니다. 협업자가 체크리스트를 푸시했고, 저는 확장 ID 커밋을 로컬에만 갖고 있습니다. **정리 전에 서로 다른 코드를 보고 있을 수 있으니 먼저 병합하는 것을 권합니다.**

**미커밋 변경 다수** — 13개 파일 수정 + 4개 신규 파일이 커밋되지 않았습니다. 되돌리면 유실되니 주의하세요.

---

## 체크리스트에 없지만 짚어야 할 것

체크리스트 §9가 "인증 흐름 테스트"를 요청했는데 **이미 있습니다** — `tests/auth.test.js`가 OAuth 오류 매핑을 검증합니다. 그 외에 `tests/insert.test.js`, `tests/manifest.test.js`도 추가돼 현재 48개입니다. 체크리스트에 적힌 "현재 단위 테스트: format/search/store/templates"는 최신 상태가 아닙니다.
