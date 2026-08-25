# 붙박스 인수인계 문서

작성일: 2026-08-25 · 이 문서를 읽는 사람(또는 AI)이 바로 이어서 작업할 수 있도록 정리했습니다.

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

과거에 이 규칙을 어겨서 되돌린 이력이 있습니다(아래 §6 참고).

---

## 1. 제품 한 줄

매일 반복해서 입력하는 문구를 이름표 붙은 "박스"에 저장하고, 검색해서 바로 복사하거나 입력창에 넣는 도구. 같은 스페이스의 팀원이 실시간으로 공유합니다.

주 타깃은 **고객센터·CS팀** — 같은 안내 문구를 하루에 수십 번 다시 치는 사람들.

포지셔닝(§2): 경쟁자는 카톡 "나에게 보내기". 차별점은 **"이름표 붙은 고정 자리"** 하나뿐입니다. 이것과 충돌하는 기능(예: 텍스트에 만료 걸기)은 만들지 않습니다.

---

## 2. 지금 어디까지 왔나

### 동작하는 것
- Google OAuth 로그인 (PKCE, `chrome.identity.launchWebAuthFlow`)
- 첫 로그인 시 `내 공간` 자동 생성
- 박스 CRUD, 순서 변경, 텍스트 10KB 상한, 자동저장, 충돌 배지
- Supabase Realtime 동기화 (보고 있는 스페이스 하나만 구독)
- 검색: 이름·내용·태그, 띄어쓰기 무시, **한국어 초성**(`ㅎㅂ` → 환불 안내), `#태그` 필터
- 키보드: `↑`/`↓` 이동, `Enter` 복사, `Shift+Enter` 삽입, `Esc` 초기화
- 템플릿 변수 `{{고객명}}` — 복사·삽입할 때 값을 물어봄. `{{오늘}}`은 자동
- 입력창 삽입 (선택 권한, 실패 시 복사로 대체)
- 우클릭 "붙박스에 저장", `Ctrl+Shift+K` 단축키
- 태그, 개인별 즐겨찾기, 최근 사용 정렬, 박스 복제
- 초대 링크, 역할(owner/admin/member)
- RLS 전면 적용

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

```
index.html            소개 페이지 (사이트 홈)
app.html              로그인 후 앱 화면 (웹)
join.html             초대 링크 수신
privacy.html          공개 개인정보처리방침
auth/callback.html    웹 OAuth 콜백
sidepanel.html        확장 진입점
styles.css            확장 전용 스타일 (slow roads 톤)
web/site.css          웹 전용 스타일 (아직 예전 초록 팔레트)
src/                  공용 로직
src/features/         search · templates · sorting · analytics · insert
supabase/schema.sql   전체 스키마 (멱등, 다시 실행해도 안전)
supabase/migrations/  델타 마이그레이션
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
| Supabase Redirect URLs | **확인 필요** — 아래 §5 참고 |
| 호스팅 배포 | **미완** — 저장소가 Private이라 GitHub Pages는 유료. Cloudflare Pages / Vercel / Netlify 중 택일 |
| `privacy.html`의 `[운영자]` `[이메일]` | **미완** — 웹스토어 심사에 필요 |
| 웹스토어 등록 | **미완** |

`config.js`의 `webOrigin`은 아직 `https://YOUR_DOMAIN` 플레이스홀더입니다. 배포 도메인이 정해지면 채워야 확장에서 만든 초대 링크가 올바른 주소를 가리킵니다.

---

## 5. 확장 ID — 가장 최근에 해결한 문제

### 무슨 일이 있었나
`manifest.json`에 `key`가 없으면 Chrome이 **설치 경로를 해시해서 확장 ID를 만듭니다.** 그래서 같은 코드를 받아도 사람마다 ID가 달라졌고, Supabase Redirect URLs에 등록된 한 사람만 로그인할 수 있었습니다.

### 어떻게 고쳤나
`manifest.json`에 RSA 공개키(`key`)를 박아 **확장 ID를 고정**했습니다. 저장소를 받은 사람은 누구나 같은 ID를 갖습니다.

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
- `key`는 공개키라 커밋해도 안전합니다(비밀키 아님).
- 확장 ID가 바뀌었으므로 각자 **확장을 제거 후 다시 로드**해야 하고, 세션은 ID별로 저장돼 재로그인이 필요합니다.
- 웹스토어 배포 시엔 스토어가 발급한 공개키로 `key`를 교체하고 Redirect URL을 다시 등록해야 합니다.
- Google Cloud Console은 확장 ID와 무관합니다. 거긴 Supabase 콜백(`https://laqjyeszsvzjbwgptcmb.supabase.co/auth/v1/callback`) 하나만 있으면 됩니다.

---

## 6. 지금 작업 트리에 남아 있는 것 ⚠️

**커밋되지 않은 변경이 다수 있습니다. 다른 사람이 작업 중인 내용이므로 함부로 되돌리지 마세요.**

```
 M PRIVACY.md, ROADMAP.md, index.html, privacy.html, sidepanel.html
 M src/app.js, src/auth.js, src/errors.js, src/features/insert.js
 M styles.css, web/site.css
 M supabase/schema.sql, supabase/migrations/002-v2.sql
?? .github/, supabase/migrations/003-policy-alignment.sql
?? tests/auth.test.js, tests/insert.test.js
```

또한 로컬 커밋 1개가 **아직 푸시되지 않았습니다** (`main`이 `origin/main`보다 1 앞섬) — 확장 ID 고정 커밋입니다.

### 이 변경들이 무엇을 되돌렸나 (중요)

이전 세션에서 AI가 브리핑의 미결정 사항을 **임의로 확정한 실수**가 있었고, 그것이 되돌려졌습니다.

| 항목 | 임의로 정했던 값 | 되돌린 값 (브리핑 기준) |
| --- | --- | --- |
| Pro 박스/스페이스 | 300개 / 5개 | **50개 / 3개** (§10) |
| Team 박스/스페이스 | 1,000개 / 20개 | **100개 / 10개** (§10) |
| 가격 | 월 4,900 / 12,900원 | **0** (§12에서 미결정) |
| 스페이스 멤버 한도 | 3~200명 | **null = 무제한** (§3 "참여는 무제한") |
| 초대 토큰 | 알파벳 루프 | `gen_random_bytes(18)` (암호학적으로 안전) |

**교훈: §12 미결정 항목(가격, Team 티어 판매 여부, owner 위임, 다국어)은 추측해서 채우지 말고 물어볼 것.**

---

## 7. 깨뜨리면 안 되는 규칙

1. **코드에 주석을 넣지 않습니다.** JS `//` `/* */`, CSS, HTML `<!-- -->`, SQL `--` 전부. Markdown 문서는 예외. `npm run check`가 이걸 검사합니다.
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

SQL은 배포 전 **실제 Postgres 파서로 검증**하세요. libpg_query 바인딩(`pip install pglast`)으로 top-level과 plpgsql 본문을 둘 다 검사할 수 있습니다.

---

## 9. 검사

```bash
npm run check
```

```bash
npm test
```

`npm run check`: manifest 참조·과도한 권한·`key` 존재·CSP·인라인 스크립트·깨진 링크·깨진 import·config.js 비밀 키·schema.sql 필수 구문(용량 트리거 3종, auth 트리거, replica identity, 신규 테이블 RLS와 anon 권한 회수)·JS 문법·**주석 부재**.

`npm test`: 48개. 검색(초성·띄어쓰기·태그), 템플릿 변수, 정렬, 바이트 계산, 스토리지 폴백, OAuth 오류 매핑, manifest key.

---

## 10. 다음에 할 일

`ROADMAP.md`에 단계별로 정리돼 있습니다. 요약:

1. **Redirect URL 등록** — §5의 주소를 Supabase에 넣고 양쪽 PC에서 로그인 확인
2. **호스팅 결정 후 배포** — Cloudflare Pages / Vercel / Netlify 중 택일
3. **`privacy.html` 실명 채우기** — 없으면 웹스토어 심사 불가
4. **§9 검증 게이트** — 실제 CS팀에 2주 배포. 판정 쿼리는 `ROADMAP.md`에 있음:
   ```sql
   select user_id, count(distinct date_trunc('day', created_at)) as active_days
   from analytics_events
   where created_at > now() - interval '14 days'
   group by user_id;
   ```
   `active_days >= 3`인 사용자가 있으면 통과 → 파일 업로드 단계로. 없으면 **거기서 멈춤**.

---

## 11. 알려진 미완 사항

- `web/site.css`는 아직 예전 초록 팔레트입니다. 확장(`styles.css`)만 slow roads 톤으로 재디자인됐고, 웹 앱 화면은 구조만 맞춰둔 상태입니다. 톤 통일 여부는 결정되지 않았습니다.
- `config.js`의 `webOrigin`이 플레이스홀더입니다.
- 스페이스 참여 비밀번호 무차별 대입 제한이 없습니다.
- 저장소가 Private이라 GitHub Pages 무료 배포가 불가합니다.

---

## 12. 저장소

- GitHub: `d66w/butbox` (Private)
- 협업자: `aircloud09` (admin 권한, 초대 수락 완료)
- 로컬: `C:\Users\HEESEOP\OneDrive\바탕 화면\확장프로그램`
