# 붙박스 출시 전 해야 할 일 체크리스트

> 기준: 현재 `main` 브랜치 코드 리뷰 결과
> 목적: Chrome Web Store 베타 출시 전 검증 및 출시 준비
>
> **2026-08-26 검증 갱신** — 코드/테스트로 확인 가능한 항목을 실제로 실행해 표시했습니다.
> `[x]` = 실제로 실행해 통과 · `[ ]` = 사람이 실제 환경에서 해야 함
> 검증 방법: 목 Supabase + 목 chrome API 위에서 확장을 구동, 웹 화면은 실제 브라우저에서 구동.
> 상세와 이번에 찾은 버그: `RELEASE_STATUS.md` 참고.
>
> ⚠️ 이 갱신에서 **웹 앱이 부팅되지 않는 버그**와 **오류 메시지가 영문 코드로 노출되는 버그**를 찾아 고쳤습니다.
> 이전 판에서 `[x]`로 표시돼 있던 §8의 "이해 가능한 메시지" 항목은 실제로는 깨져 있었습니다.

---

## 🔴 1. 반드시 해결 — 출시 차단 항목

### 1-1. Google OAuth 실제 환경 테스트
- [ ] Google 로그인 정상 동작 확인
- [ ] 로그아웃 정상 동작 확인
- [ ] 로그아웃 후 재로그인 확인
- [ ] 세션 만료 후 재로그인 확인
- [ ] 웹 OAuth callback 정상 동작 확인
- [ ] Chrome Extension OAuth 정상 동작 확인

### 1-2. Chrome Extension ID 확정

> **해결됨**: `manifest.json`에 `key`를 넣어 확장 ID를 고정했습니다.
> 고정 ID `polkcadchekgljdfhadoabgcojpjpkgj`
> 등록할 주소 `https://polkcadchekgljdfhadoabgcojpjpkgj.chromiumapp.org/supabase-auth`
> 개발자마다 ID가 달라지던 문제가 사라졌습니다. 웹스토어 업로드 후에는 스토어 공개키로 교체해야 합니다.
- [ ] Chrome Web Store에 비공개/초안 상태로 확장 프로그램 업로드
- [ ] 최종 Extension ID 확인
- [x] `chrome.identity.getRedirectURL()` 기준 Redirect URL 확인
- [ ] Supabase Authentication → Redirect URLs에 Extension Redirect URL 등록
- [ ] Google Cloud OAuth 설정 확인

### 1-3. 실제 도메인 설정
- [ ] `config.js`의 `webOrigin`을 실제 도메인으로 변경
- [x] `YOUR_DOMAIN` 등 placeholder 검사 자동화 — `npm run check:release`가 배포물에 남아 있으면 **실패**시킵니다. CI는 `v*` 태그와 수동 실행에서 이 게이트를 돌립니다
- [x] `webOrigin`이 실제 도메인이 아니면 깨진 초대 링크를 만들지 않고 안내하도록 수정
- [ ] Supabase Site URL 설정
- [ ] Supabase Redirect URL 설정
- [ ] 웹 OAuth callback 실제 도메인에서 테스트

### 1-4. 개인정보처리방침 / 운영정보
- [ ] `PRIVACY.md`의 `[운영자]` 정보 입력
- [ ] `PRIVACY.md`의 `[이메일]` 입력
- [ ] `PRIVACY.md`의 `[프로젝트 리전]` 입력
- [ ] `privacy.html`도 실제 정보로 업데이트
- [ ] 실제 수집 데이터가 개인정보처리방침과 일치하는지 확인
- [ ] Google OAuth / Supabase / analytics 관련 내용 확인
- [ ] 개인정보 삭제/문의 방법 확인

---

# 🟠 2. 실제 기능 통합 테스트

## 2-1. 신규 사용자
- [x] 처음 로그인한 계정에서 자동으로 개인 Space가 생성되는지 확인
- [x] 개인 Space가 정상적으로 표시되는지 확인
- [x] 프로필 정보가 정상적으로 생성되는지 확인

## 2-2. 박스 CRUD
- [x] 박스 생성
- [x] 박스 이름 수정
- [x] 박스 내용 수정
- [x] 자동 저장 확인
- [ ] 저장 후 새로고침
- [ ] 새로고침 후 데이터 유지 확인
- [x] 박스 삭제
- [x] 박스 복제
- [x] 박스 순서 변경

## 2-3. 검색
- [x] 이름 검색
- [x] 내용 검색
- [x] 태그 검색
- [x] 띄어쓰기 무시 검색
- [x] 한국어 초성 검색
- [x] `#태그` 검색
- [x] 검색 결과 정렬 확인
- [x] 검색 결과가 없을 때 UI 확인

## 2-4. 즐겨찾기 / 사용 기록
- [x] 즐겨찾기 추가
- [x] 즐겨찾기 해제
- [ ] 즐겨찾기 상태 새로고침 후 유지
- [x] 팀원이 설정한 즐겨찾기가 서로 독립적인지 확인
- [x] 최근 사용 정렬 확인

## 2-5. 템플릿
- [x] `{{고객명}}` 같은 변수 인식
- [x] 변수 입력 UI 확인
- [x] 여러 변수 처리
- [x] 같은 변수가 여러 번 등장할 때 처리
- [x] `{{오늘}}` 자동 입력
- [x] `{{지금}}` 자동 입력
- [x] 복사 시 변수 처리
- [x] 잘못된 템플릿 형식 처리

---

# 🟠 3. Chrome Extension 실제 테스트

## 3-1. 사이드 패널
- [ ] 확장 아이콘 클릭 시 사이드 패널 열림
- [ ] 패널 새로고침 후 상태 정상
- [ ] 로그인 상태 유지
- [ ] 로그아웃 상태 정상
- [x] 검색창 자동 포커스 확인
- [x] UI 스크롤 정상
- [x] 좁은 패널에서도 레이아웃 깨지지 않음

## 3-2. 키보드
- [ ] `Ctrl+Shift+K`로 사이드 패널 열기
- [ ] 검색창 포커스
- [x] `↑` / `↓` 검색 결과 이동
- [x] `Enter` 복사
- [x] `Esc` 검색 초기화

## 3-3. 복사
- [x] 복사 버튼 동작
- [x] 카드 본문 클릭 복사
- [x] 클립보드 권한/실패 상황 확인
- [x] 복사 성공 피드백 확인

---

# 🔴 5. Team / Realtime 통합 테스트

Google 계정 A와 B 두 개를 사용해서 테스트한다.

## 5-1. 초대
- [ ] A가 초대 링크 생성
- [ ] B가 초대 링크 열기
- [ ] 초대 정보 표시
- [ ] B가 Space 참여
- [ ] 잘못된 초대 링크 처리
- [ ] 만료된 초대 처리
- [ ] 초대 사용 횟수 제한 확인

## 5-2. 권한
- [ ] owner 권한 확인
- [ ] admin 권한 확인
- [ ] member 권한 확인
- [ ] member가 관리자 기능에 접근할 수 없는지 확인
- [ ] admin이 owner 전용 기능에 접근할 수 없는지 확인
- [ ] owner 역할 변경 방지 확인
- [ ] 다른 사용자의 Space 데이터 접근 차단 확인

## 5-3. Realtime
- [x] A가 박스 생성 → B에 즉시 표시
- [x] A가 박스 수정 → B에 즉시 반영
- [x] A가 박스 삭제 → B에 즉시 반영
- [ ] B가 박스 수정 → A에 즉시 반영
- [x] 동시에 수정했을 때 충돌 UI 확인
- [ ] 네트워크가 잠깐 끊겼다가 복구될 때 재연결
- [ ] 브라우저 탭/사이드 패널을 닫았다가 다시 열었을 때 정상
- [x] Space를 변경했을 때 이전 Space 구독이 해제되는지 확인

---

# 🔴 6. RLS / 보안 테스트

실제 계정 A/B를 이용해 테스트한다.

> **침투 테스트 SQL을 만들어 두었습니다**: [`supabase/rls-penetration.sql`](supabase/rls-penetration.sql)
> 아래 항목 전부를 실제 역할로 전환해 시도하고 PASS/FAIL 표를 냅니다. 끝에 `rollback` 하므로 데이터를 바꾸지 않습니다.
> **실행은 사람이 해야 합니다.** 파일 맨 위 `v_attacker` / `v_victim`에 실제 UUID 두 개를 넣으세요.

- [ ] A가 B의 개인 Space를 조회할 수 없는지 *(SQL 준비됨, 실행 대기)*
- [ ] A가 B의 박스를 직접 조회할 수 없는지 *(SQL 준비됨, 실행 대기)*
- [ ] A가 B의 박스를 수정할 수 없는지 *(SQL 준비됨, 실행 대기)*
- [ ] A가 B의 박스를 삭제할 수 없는지 *(SQL 준비됨, 실행 대기)*
- [ ] member가 owner/admin 전용 RPC를 악용할 수 없는지 *(SQL 준비됨, 실행 대기)*
- [ ] anon 사용자가 보호된 데이터를 조회할 수 없는지 *(SQL 준비됨, 실행 대기)*
- [ ] 초대 토큰을 임의로 조작할 수 없는지 *(SQL 준비됨, 실행 대기)*
- [x] 클라이언트에서 service_role key가 노출되지 않는지 — 테스트로도 확인
- [x] 민감한 Supabase DB 권한이 anon/authenticated에 과도하게 열려 있지 않은지

### 이번 점검에서 찾은 권한 구멍 (수정 완료, 운영 DB 적용 대기)
- [x] 같은 스페이스 멤버가 `spaces.password_hash`를 읽을 수 있던 문제 — 컬럼 단위 권한으로 차단
- [x] 멤버가 PATCH로 `boxes.tags`를 직접 써서 플랜 태그 한도를 우회하던 문제 — `update (name, text_content)`로 축소
- [x] `effective_plan(uuid)`로 남의 플랜을 조회할 수 있던 문제 — `authenticated`에서 회수
- [ ] **`supabase/migrations/004-column-grants.sql`을 운영 DB에서 실행** ← 사람이 해야 함

---

# 🟠 7. 한도 / 예외 상황 테스트

- [x] Free 박스 한도 테스트
- [x] 박스 한도 도달 시 정상적인 오류 메시지
- [x] 10KB 텍스트 제한 테스트
- [x] 10KB 초과 입력 처리
- [ ] Space member limit 테스트
- [ ] locked 박스 수정 차단 확인
- [ ] 잘못된 UUID/ID 입력 처리
- [ ] 존재하지 않는 박스 접근 처리
- [ ] 존재하지 않는 Space 접근 처리

---

# 🟠 8. 네트워크 / 장애 테스트

- [ ] 인터넷 연결 끊김
- [ ] 인터넷 재연결
- [ ] Supabase 요청 실패
- [x] 저장 요청 실패
- [ ] Realtime 연결 실패
- [ ] OAuth 실패
- [ ] API timeout
- [ ] 페이지 새로고침 중 저장
- [ ] 저장 중 브라우저 종료
- [x] 오류 발생 시 사용자에게 이해 가능한 메시지 표시 — **이전 판에서 잘못 표시돼 있었고 이번에 실제로 고쳤습니다.** 서버가 던진 `WRONG_PASSWORD` 같은 코드와 Postgres 제약 위반 문구가 토스트에 그대로 뜨던 문제. 회귀 테스트 4개 추가
- [x] 세션 만료 시 토큰을 한 번 갱신하고 같은 요청을 재시도 — `tests/api.test.js`
- [x] 갱신도 실패하면 세션을 지우고 로그인 화면으로 — `tests/api.test.js`

---

# 🟡 9. 자동 테스트 강화

현재 단위 테스트 **93개** (`analytics` `api` `auth` `clipboard` `errors` `format` `manifest` `realtime` `search` `sorting` `store` `templates`).

- [x] 인증 흐름 테스트 — `tests/auth.test.js`
- [x] **API 함수 테스트** — `tests/api.test.js` 11개. 헤더·토큰 갱신 재시도·id 인코딩·오류 변환·204 처리
- [x] Realtime 이벤트 테스트 — `tests/realtime.test.js`. 파싱, 재연결 backoff, suspend/resume
- [x] 오류 메시지 회귀 테스트 — `tests/errors.test.js`. 영문 코드가 사용자에게 새지 않는지
- [ ] Space 권한 테스트 — RLS/RPC 영역이라 `supabase/rls-penetration.sql`로 대체. 실행 대기
- [ ] 초대 로직 테스트 — 전량 SQL(plpgsql)에 있어 단위 테스트로 덮이지 않음. 위 SQL로 대체
- [ ] 박스 CRUD 통합 테스트
- [ ] 템플릿 + 복사 통합 테스트

가능하다면 최종적으로:
- [ ] Playwright 또는 Chrome 기반 E2E 테스트 추가

---

# 🟡 10. 정적 검사

출시 직전에 반드시 실행:

```bash
npm run check
```

```bash
npm test
```

```bash
npm run check:release
```

확인할 것:

- [x] manifest 참조 파일 정상
- [x] JS import 경로 정상
- [x] 전체 JS 문법 정상
- [x] HTML 링크 정상
- [x] CSP 정상
- [x] 과도한 Chrome 권한 없음
- [x] config에 secret/service_role key 없음
- [x] Supabase schema 필수 구문 정상
- [x] RLS 활성화 확인
- [x] anon 권한 회수 확인
- [x] 컬럼 단위 권한 확인 (테이블 전체 열기 금지)
- [x] `grant all ... to anon/authenticated` 금지
- [x] placeholder 문자열 검색 — **출시 모드에서는 실패로 처리**
- [x] `sidepanel.html`과 `app.html`의 id 집합 대조
- [x] 어떤 JS도 HTML 문자열을 주입하지 않음
- [x] SQL 전체가 실제 Postgres 파서로 파싱됨 (pglast)

---

# 🟡 11. Chrome Web Store 출시 준비

- [ ] Extension 이름 확정
- [ ] 설명 작성
- [ ] 아이콘 최종 확인
- [ ] 스크린샷 준비
- [ ] 개인정보처리방침 URL 준비
- [ ] 지원 이메일 준비
- [ ] 홈페이지 URL 준비
- [ ] Chrome Web Store Developer 계정 준비
- [ ] Extension draft 업로드
- [ ] Extension ID 확정
- [ ] OAuth Redirect URL 최종 확인
- [ ] Store 정책 위반 요소 확인
- [ ] 권한 설명 준비
- [ ] 심사 제출

---

# 🟡 12. 웹 서비스 출시 준비

- [ ] Cloudflare Pages / Vercel / Netlify 중 호스팅 선택
- [ ] 실제 도메인 연결
- [ ] HTTPS 확인
- [ ] `webOrigin` 변경
- [ ] Supabase Site URL 변경
- [ ] Supabase Redirect URL 등록
- [ ] Google OAuth Redirect URL 확인
- [ ] 웹 로그인 테스트
- [ ] 웹 앱 기능 테스트
- [ ] 모바일/데스크톱 레이아웃 확인

---

# 🟢 13. 베타 출시

## 베타 출시 전 최종 체크

- [ ] 모든 🔴 항목 완료
- [ ] 모든 🟠 핵심 항목 완료
- [ ] `npm run check` 통과
- [ ] `npm test` 통과
- [ ] Google 계정 2개 테스트 통과
- [ ] 실제 Chrome에서 테스트 통과
- [ ] 개인정보처리방침 완료
- [ ] OAuth 설정 완료
- [ ] 실제 도메인 연결
- [ ] Chrome Web Store draft 완료

## 베타 운영

- [ ] 실제 사용자 1~3명에게 먼저 배포
- [ ] 사용 중 발생한 오류 기록
- [ ] analytics 이벤트 확인
- [ ] 반복적으로 사용하는지 확인
- [ ] 3일 이상 자발적으로 사용하는 사용자가 있는지 확인
- [ ] 가능하면 2주간 실제 사용 관찰

---

# 🚫 지금은 만들지 말 것

실제 사용자 검증 전에는 다음 기능을 추가하지 않는다.

- [ ] AI 기능
- [ ] 파일 업로드
- [ ] 이미지 업로드
- [ ] 결제 시스템
- [ ] 다국어
- [ ] 대규모 `app.js` 리팩터링
- [ ] 새로운 DB 구조
- [ ] UI 전체 재설계

> 먼저 텍스트 기능을 실제 사용자에게 검증하고, 사용성이 확인된 뒤 다음 기능으로 넘어간다.

---

# 출시 판정 기준

## 🟢 출시 가능

다음 조건을 모두 만족하면 베타 출시:

1. Google OAuth 정상
2. 개인 Space 정상
3. 박스 CRUD 정상
4. 검색 정상
5. 복사 정상
6. 템플릿 정상
7. 2계정 Team 기능 정상
8. Realtime 정상
9. RLS 검증 완료
10. 개인정보처리방침 완료
11. 실제 도메인/OAuth 설정 완료
12. `npm run check` 통과
13. `npm test` 통과

## 🔴 출시 보류

다음 중 하나라도 발견되면 수정 후 출시:

- 다른 사용자의 데이터 접근 가능
- OAuth 로그인 실패
- Team 데이터 동기화 실패
- 박스 데이터 유실
- 저장 실패가 사용자에게 숨겨짐
- Extension ID와 OAuth Redirect 불일치
- 개인정보처리방침 미완성
- placeholder가 실제 배포물에 남아 있음

---

# 최종 우선순위

1. **OAuth + Extension ID 확정**
2. **실제 Chrome 통합 테스트**
3. **2계정 Team / Realtime 테스트**
4. **RLS 보안 테스트**
5. **예외/네트워크 테스트**
6. **개인정보처리방침/도메인 설정**
7. **Web Store 제출 준비**
8. **베타 출시**
9. **실사용 데이터 검증**
10. 그 이후에 파일/AI/결제 기능 개발
