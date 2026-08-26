# 붙박스 인수인계 문서

작성일: 2026-08-26 (갱신) · 이 문서를 읽는 사람(또는 AI)이 바로 이어서 작업할 수 있도록 정리했습니다.

---

## 0. 먼저 읽을 것

**요구사항의 원천은 이 저장소가 아니라 브리핑 PDF입니다.**

```
C:\Users\HEESEOP\OneDrive\문서\카카오톡 받은 파일\AI-인수인계-프로젝트브리핑.pdf
```

> ⚠️ 이 PDF는 Adobe-Korea1 CMap이라 `pdftotext`로 열면 글자가 깨집니다. **PyMuPDF(`pip install pymupdf`)로 읽어야** 정상적으로 나옵니다.

브리핑이 스스로 정한 규칙:
- **§3 확정 사항 표**는 결정된 사실로 취급하고, 충돌하는 제안을 할 때는 먼저 충돌을 지적할 것
- **§12 미결정 사항**은 추측하지 말고 사용자에게 질문할 것
- **§9 검증 게이트**를 건너뛰고 파일/결제 기능부터 만들자고 하지 말 것

과거에 이 규칙을 어겨서 되돌린 이력이 있습니다(아래 §6).

---

## 1. 제품 한 줄

매일 반복해서 쓰는 문구를 이름표 붙은 "박스"에 저장하고, 검색해서 바로 복사하는 도구. 빈 박스를 누르면 클립보드 텍스트를 바로 저장합니다. 같은 스페이스의 팀원이 실시간으로 공유합니다.

주 타깃은 **고객센터·CS팀** — 같은 안내 문구를 하루에 수십 번 다시 치는 사람들.

포지셔닝(§2): 경쟁자는 카톡 "나에게 보내기". 차별점은 **"이름표 붙은 고정 자리"** 하나뿐입니다. 이것과 충돌하는 기능(예: 텍스트에 만료 걸기)은 만들지 않습니다.

---

## 2. 지금 어디까지 왔나

### 동작하는 것 (실제로 눌러서 검증 완료)
- Google OAuth 로그인 (PKCE, `chrome.identity.launchWebAuthFlow`), 리디렉션 설정 오류를 사람이 읽을 안내로 변환
- 첫 로그인 시 `내 공간` 자동 생성
- 박스 CRUD, 순서 변경, 복제, 텍스트 10KB 상한(초과 시 몇 바이트 줄여야 하는지 안내), 자동저장, 충돌 배지
- Supabase Realtime 동기화 — 생성·수정·삭제 즉시 반영, 동시 수정 시 내 입력 보존, 탭 전환 시 구독 해제
- 검색: 이름·내용·태그, 띄어쓰기 무시, **한국어 초성**(`ㅎㅂ` → 환불 안내), `#태그` 필터
- 키보드: `↑`/`↓` 이동, `Enter` 복사, `Esc` 초기화
- 빈 박스 클릭 시 클립보드 텍스트 바로 저장, 이름은 박스 위에서 바로 편집
- 템플릿 변수 `{{고객명}}` — 복사할 때 값을 물어봄. `{{오늘}}`은 자동. 같은 변수 반복·잘못된 형식 모두 안전 처리
- 우클릭 "붙박스에 저장", `Ctrl+Shift+K` 단축키
- 태그, 개인별 즐겨찾기, 최근 사용 정렬
- 초대 링크, 역할(owner/admin/member)
- RLS 10개 테이블 전부 적용, anon 권한 회수 14건, service_role 클라이언트 노출 0건

### 안 만든 것 (의도적)
- **파일·이미지 업로드(R2)** — §9 검증 게이트 대상. 게이트 통과 전엔 금지
- **결제** — §12에서 가격이 미결정. 지금은 `upgrade_intents`로 수요만 셈
- **owner 소유권 위임 UI** — §12 미결정
- **다국어** — 한국어 전용

---

## 3. 구조

`src/` 아래 모든 로직을 **확장과 웹이 같은 파일로 공유**합니다. 플랫폼이 갈리는 곳은 두 곳뿐:

| 파일 | 분기 방식 |
| --- | --- |
| `src/auth.js` | `chrome.identity` 있으면 팝업 OAuth, 없으면 페이지 리디렉션 |
| `src/store.js` | `chrome.storage.local` 있으면 그것, 없으면 `localStorage` |
| `src/theme.js` | 저장은 `store.js`가 담당. 첫 페인트 전에 색을 정해야 해서 `localStorage`에 같은 값을 동기 미러로 하나 더 씁니다 |

```
index.html            소개 페이지 (사이트 홈)
app.html              로그인 후 앱 화면 (웹)
join.html             초대 링크 수신
privacy.html          공개 개인정보처리방침
auth/callback.html    웹 OAuth 콜백
sidepanel.html        확장 진입점
styles.css            확장 전용 스타일 (liquid glass, 라이트/다크)
web/site.css          웹 전용 스타일 (같은 디자인 언어, 토큰 이름만 다름)
src/                  공용 로직
src/features/         search · templates · sorting · analytics
supabase/schema.sql   전체 스키마 (멱등, 다시 실행해도 안전)
supabase/migrations/  델타 마이그레이션 (004가 최신 — 아직 운영 DB에 미적용)
supabase/rls-audit.sql       보안 감사 SQL — Supabase SQL Editor에 붙여넣어 실행
supabase/rls-penetration.sql RLS 침투 테스트 19종 — UUID 두 개 넣고 실행, 끝에 rollback
tests/                 검색·템플릿·정렬·형식·스토리지·인증·API·분석·클립보드·실시간·오류·manifest
```

**배포**: 빌드 단계 없음. 저장소 루트를 정적 호스트에 그대로 올리면 `https://도메인/`이 소개 페이지가 됩니다.

---

## 4. 환경 설정 상태

| 항목 | 상태 |
| --- | --- |
| Supabase 프로젝트 | **완료** — `laqjyeszsvzjbwgptcmb` |
| `schema.sql` 실행 | **완료** |
| Google OAuth 클라이언트 | **완료** (웹 애플리케이션 유형) |
| Supabase Google Provider | **완료** (활성화됨) |
| `config.js` | **완료** (Supabase URL + anon key 입력됨) |
| Supabase Redirect URLs | **확인 필요** — §5 |
| `004-column-grants.sql` 실행 | **미완** — 보안 구멍 3건이 지금 열려 있음. `RELEASE_STATUS.md` C-2~C-4 |
| GitHub 푸시 | **완료** — `origin/main`과 동기화됨 |
| 호스팅 배포 | **미완** — 저장소가 Private이라 GitHub Pages는 유료. Cloudflare Pages / Vercel / Netlify 중 택일 |
| `privacy.html`의 `[운영자]` `[이메일]` `[프로젝트 리전]` `[사업자 정보]` | **미완** — 웹스토어 심사에 필요. `npm run check`가 매번 목록으로 알려줌 |
| `config.js`의 `webOrigin` | **미완** — 아직 `https://YOUR_DOMAIN` |
| 웹스토어 등록 | **미완** |

---

## 5. 확장 ID — 해결된 문제

`manifest.json`에 `key`가 없으면 Chrome이 **설치 경로를 해시해서 확장 ID를 만듭니다.** 그래서 같은 코드를 받아도 사람마다 ID가 달라졌고, 한 사람만 로그인할 수 있었습니다.

**해결**: `manifest.json`에 RSA 공개키(`key`)를 박아 **확장 ID를 고정**했습니다.

**고정된 확장 ID**
```
polkcadchekgljdfhadoabgcojpjpkgj
```

**Supabase → Authentication → URL Configuration → Redirect URLs에 등록할 주소**
```
https://polkcadchekgljdfhadoabgcojpjpkgj.chromiumapp.org/supabase-auth
```

`npm run check`가 이 값을 항상 그대로 출력합니다.

### 주의
- `manifest.json`의 `key`를 지우거나 바꾸면 **팀 전원의 로그인이 동시에 깨집니다.**
- `key`는 공개키라 커밋해도 안전합니다.
- 확장 ID가 이미 바뀌었으므로 각자 **확장을 제거 후 다시 로드**해야 하고 재로그인이 필요합니다.
- 웹스토어 배포 시엔 스토어가 발급한 공개키로 `key`를 교체하고 Redirect URL을 다시 등록해야 합니다.

---

## 6. Git 상태

로컬 `main`과 `origin/main`이 **동기화돼 있습니다.** 작업 트리도 깨끗합니다.
`npm run check`, `npm test`(93개) 전부 통과 확인됨.

`workflow` 스코프가 없는 토큰으로는 `.github/workflows/` 변경을 푸시할 수 없습니다. 거부당하면:

```bash
gh auth refresh -h github.com -s workflow
```

### 이전에 있었던 브랜치 분기 (참고용, 이미 해결됨)

한때 로컬과 원격이 각각 1커밋씩 갈라져 있었습니다(협업자가 `BUTBOX_RELEASE_CHECKLIST.md`를 원격에 푸시, 나는 확장 ID 고정 커밋을 로컬에만 갖고 있었음). 겹치는 파일이 없어 충돌 없이 병합했습니다(`d6e9218`).

### 이전에 되돌려진 값 (교훈)

이전 세션에서 AI가 브리핑의 **§12 미결정 사항을 임의로 확정한 실수**가 있었고, 그것을 협업자가 브리핑 기준으로 되돌렸습니다.

| 항목 | 임의로 정했던 값 | 되돌린 값 (브리핑 기준) |
| --- | --- | --- |
| Pro 박스/스페이스 | 300개 / 5개 | **50개 / 3개** (§10) |
| Team 박스/스페이스 | 1,000개 / 20개 | **100개 / 10개** (§10) |
| 가격 | 월 4,900 / 12,900원 | **0** (§12 미결정) |
| 스페이스 멤버 한도 | 3~200명 | **null = 무제한** (§3 "참여는 무제한") |
| 초대 토큰 | 알파벳 루프 | `gen_random_bytes(18)` |

**교훈: §12 미결정 항목(가격, Team 티어 판매 여부, owner 위임, 다국어)은 추측해서 채우지 말고 물어볼 것.**

---

## 7. 깨뜨리면 안 되는 규칙

0. **테마는 첫 페인트 전에 정해집니다.** `src/theme.js`는 모듈 최상단에서 `applyTheme()`를 동기 호출합니다. 그 앞에 `await`를 넣으면 잘못된 테마로 한 번 그려졌다가 바뀌는 깜빡임이 돌아옵니다. `store.js`가 진짜 저장소이고, `localStorage` 미러는 오직 이 동기 읽기를 위해 존재합니다.

1. **코드에 주석을 넣지 않습니다.** JS `//` `/* */`, CSS, HTML `<!-- -->`, SQL `--` 전부. Markdown 문서는 예외. `npm run check`가 검사합니다.
2. **§9 검증 게이트를 건너뛰지 않습니다.** 실제 팀에서 2주 써보고 "아무도 시키지 않았는데 3일 이상 계속 쓰는 사람"이 나오기 전엔 파일 업로드를 만들지 않습니다.
3. **RLS를 약화시키지 않습니다.** 클라이언트에서 `service_role` 금지, anon key만 사용.
4. **텍스트는 영구 보관.** 만료를 걸면 §2 포지셔닝이 무너집니다.
5. **박스는 최신 1개 덮어쓰기.** 여러 항목을 쌓는 구조가 아닙니다.

---

## 8. 과거에 실제로 터졌던 버그 (재발 주의)

| 증상 | 원인 | 위치 |
| --- | --- | --- |
| 저장 중 입력한 내용이 조용히 사라짐 | `saveBox`가 in-flight면 early return만 하고 재시도 예약 안 함 | `src/app.js` `runSave` |
| 스페이스 설정 버튼 전부 먹통 | `dialog.close()`가 close 이벤트를 **비동기로 큐잉** → 앞 모달의 이벤트가 다음 모달 리스너에 잡힘 | `src/ui.js` `openModal` |
| `hidden` 속성이 안 먹힘 | `.box__badge { display: block }`이 UA의 `[hidden]`을 이김 | `styles.css` 전역 `[hidden]` 규칙 |
| `42P16: cannot change name of view column` | `CREATE OR REPLACE VIEW`는 컬럼을 **끝에만** 추가 가능 | `schema.sql` `space_summaries` |
| 스페이스 전환 시 편집 유실 | 저장 대기 중인 draft를 flush 안 하고 뷰를 버림 | `src/app.js` `selectSpace` |
| 개발자마다 확장 ID가 달라 로그인 실패 | `manifest.json`에 `key` 없음 → Chrome이 설치 경로로 ID 생성 | §5 참고, 해결됨 |
| 10KB 초과 안내가 "10KB / 지금 10KB"로 동어반복 | 반올림 때문에 한도와 현재값이 같은 문자열이 됨 | `src/format.js` `validateBoxText` — 초과량을 알려주도록 수정됨 |
| **웹 앱이 통째로 죽어 있었음** | `boot()`이 사이드 패널에만 있는 `#signin-redirect-url`을 확인 없이 건드림 → TypeError로 핸들러 배선 전체가 중단 | `src/app.js` `boot` — 이제 `npm run check`가 두 HTML의 id 집합을 대조 |
| 오류 토스트에 `WRONG_PASSWORD` 같은 영문 코드가 그대로 뜸 | `errorMessage()`가 `AppError`면 매핑을 건너뛰고 원문을 반환. `api.js`는 서버 원문을 `AppError`에 담아 던짐 | `src/errors.js` — 모든 경로가 `translate()`를 거치도록 수정 |
| **CI가 테스트를 한 번도 안 돌림** | `node --test tests/**/*.test.js` — Linux 셸은 `globstar`가 꺼져 있어 `**`가 `*`처럼 동작, 매칭 0건 | `package.json` — `tests/*.test.js`로 수정. `npm run check`가 `**` 재등장을 막음 |

SQL은 배포 전 **실제 Postgres 파서로 검증**하세요. libpg_query 바인딩(`pip install pglast`)으로 top-level과 plpgsql 본문을 둘 다 검사할 수 있습니다.

---

## 9. 검사

```bash
npm run check
```

```bash
npm test
```

```bash
npm run check:release
```

`npm run check`: manifest 참조·과도한 권한·`key` 존재·CSP·인라인 스크립트·깨진 링크·깨진 import·config.js 비밀 키·schema.sql 필수 구문(용량 트리거 3종, auth 트리거, replica identity, 신규 테이블 RLS와 anon 권한 회수, **컬럼 단위 권한**)·**두 HTML의 id 집합 대조**·**HTML 문자열 주입 금지**·JS 문법·주석 부재·**출시 전 채워야 할 placeholder 목록**.

`npm run check:release`: 위 전부 + **placeholder가 하나라도 남아 있으면 실패**. 배포물(`src/`·`web/`·`auth/`·루트의 html/js/css, `config.js`, `PRIVACY.md`)만 검사하고 `config.example.js`·문서·테스트·SQL은 제외합니다.

`npm test`: **95개**. 검색(초성·띄어쓰기·태그), 템플릿 변수, 정렬, 바이트 계산, 스토리지 폴백, OAuth 오류 매핑, **API 계층(토큰 갱신 재시도·id 인코딩·오류 변환)**, manifest key, analytics 개인정보 불변식, clipboard 사용자 제스처 규칙, realtime 이벤트 파싱·재연결, 에러 메시지.

CI: `.github/workflows/check.yml`이 main 푸시와 PR마다 `npm run check`/`npm test`를 돌리고, `v*` 태그 또는 수동 실행일 때 `npm run check:release`까지 돌립니다.

SQL은 `npm run check`가 문자열로만 훑습니다. 문법은 **실제 Postgres 파서**로 따로 검증하세요 (`pip install pglast`). 아래를 임시 파일로 저장해 돌리면 됩니다.

```python
import io, glob
from pglast import parse_sql, parse_plpgsql

for path in glob.glob("supabase/**/*.sql", recursive=True):
    source = io.open(path, encoding="utf-8").read()
    parse_sql(source)
    print("ok", path)
```

`parse_sql`은 top-level 구문을, `parse_plpgsql`은 함수 본문을 검사합니다. 이번 점검에서 SQL 6개 파일 전부 통과를 확인했습니다.

---

## 10. 다음에 할 일 (우선순위 순)

1. **`supabase/migrations/004-column-grants.sql` 실행** — 지금 운영 DB에 보안 구멍 3건이 열려 있습니다. 비밀번호 해시 노출, 태그로 플랜 한도 우회, 남의 플랜 조회. 자세한 내용은 `RELEASE_STATUS.md` C-2~C-4
2. **Supabase Redirect URL 등록** (§5 주소) — 안 하면 로그인이 안 됨
3. **양쪽 PC에서 확장 재로드 후 로그인 확인**
4. **`supabase/rls-audit.sql` 실행** — 15가지 보안 항목 자동 점검
5. **`supabase/rls-penetration.sql` 실행** — 실제 계정 두 개로 19가지 공격 시도. 실패가 하나라도 나오면 출시 중단
6. **Google 계정 2개로 팀·실시간 실사용 테스트** — `BUTBOX_RELEASE_CHECKLIST.md`의 미체크 대부분이 이 범주
7. **호스팅 결정 후 배포** — Cloudflare Pages / Vercel / Netlify
8. **`privacy.html`·`config.js` 실명·도메인 채우기** — `npm run check:release`가 통과해야 출시 가능
9. **§9 검증 게이트** — 실제 CS팀에 2주 배포. 판정 쿼리:
   ```sql
   select user_id, count(distinct date_trunc('day', created_at)) as active_days
   from analytics_events
   where created_at > now() - interval '14 days'
   group by user_id;
   ```
   `active_days >= 3`인 사용자가 있으면 통과 → 파일 업로드 단계로. 없으면 **거기서 멈춤**.

---

## 11. 참고 문서 (이 저장소 안)

| 파일 | 용도 |
| --- | --- |
| `README.md` | 설치·설정 가이드 |
| `ROADMAP.md` | 기능 로드맵, 브리핑 §8·§12 대조 |
| `BUTBOX_RELEASE_CHECKLIST.md` | 출시 체크리스트 |
| `RELEASE_STATUS.md` | 체크리스트 항목별 검증 결과 + **찾아 고친 버그 · 남겨둔 판단 사항** |
| `PRIVACY.md` | 개인정보처리방침 원본 (placeholder 포함) |
| `HANDOFF.md` | 이 문서 |

먼저 읽을 것: **`RELEASE_STATUS.md`**. 지금 무엇이 막혀 있고 무엇이 사람 손을 기다리는지가 거기 정리돼 있습니다.

---

## 12. 저장소

- GitHub: `d66w/butbox` (Private)
- 협업자: `aircloud09` (admin 권한, 초대 수락 완료)
- 로컬: `C:\Users\HEESEOP\OneDrive\바탕 화면\확장프로그램`
- 고정 확장 ID: `polkcadchekgljdfhadoabgcojpjpkgj`
