# 붙박스 로드맵

브리핑 §9의 검증 게이트가 순서를 정합니다. **위에서부터 순서대로** 하고, 게이트를 건너뛰지 않습니다.

---

## 0단계 — 지금 당장 (출시 전 준비)

코드는 끝났고, 남은 건 전부 계정·설정 작업입니다. 코드를 더 쓸 필요가 없습니다.

- [ ] **Supabase 프로젝트 생성** → SQL Editor에서 `supabase/schema.sql` 전체 실행
- [ ] **Google OAuth 설정** — Supabase Authentication > Providers > Google 활성화, Google Cloud Console에서 클라이언트 생성
- [ ] **Redirect URLs 등록** (Supabase Authentication > URL Configuration)
  - 웹: `https://<도메인>/auth/callback.html`
  - 확장: `https://<확장ID>.chromiumapp.org/supabase-auth`
- [ ] **`config.js` 채우기** — Project URL + anon key. `service_role` key는 절대 넣지 않기
- [ ] **호스팅 결정 후 배포** (아래 참조)
- [ ] **`PRIVACY.md` / `privacy.html`의 `[운영자]` `[이메일]` `[프로젝트 리전]` 채우기** — 개인정보처리방침은 실명·연락처가 없으면 법적으로 의미가 없습니다
- [ ] **Google 계정 2개로 통합 테스트** — 스페이스 참여, 실시간 동기화, RLS 차단(남의 스페이스 못 보는지)

### 호스팅 — 결정이 필요합니다

저장소가 **Private**이라 **GitHub Pages는 유료 플랜(Pro/Team)이 필요합니다.** 무료로 하려면 아래 중 하나:

| 선택지 | 비용 | 메모 |
| --- | --- | --- |
| Cloudflare Pages | 무료 | Private 저장소 연결 가능. 대역폭 무제한 |
| Vercel | 무료 | Private 저장소 연결 가능. 개인 프로젝트 한정 |
| Netlify | 무료 | 월 100GB 대역폭 |
| GitHub Pages | 유료 | 저장소를 Public으로 바꾸면 무료. anon key는 공개돼도 안전한 키라 기술적으로는 문제없음 |

빌드 단계가 없으니 어느 쪽이든 **저장소 루트를 그대로 배포**하면 됩니다. 빌드 명령 없음, 출력 디렉터리는 루트(`.`).

> ⚠️ 루트를 통째로 배포하면 `supabase/schema.sql`, `README.md`, `manifest.json`도 도메인에서 열립니다. 보안 구멍은 아니지만(보안은 RLS가 담당) 신경 쓰이면 호스트의 ignore 설정으로 제외하세요.

---

## 1단계 — 검증 게이트 (브리핑 §9, 건너뛰기 금지)

> 텍스트 기능만 완성되면 거기서 멈추고 실제 팀에서 2주간 사용해본다.
> **아무도 시키지 않았는데 3일 이상 계속 쓰는 사람이 있는가?**

- [ ] 실제 CS팀에 배포 (반복 안내 문구를 쓰는 사람)
- [ ] 2주간 관찰
- [ ] 판정: **있다** → 2단계로 / **없다** → 여기서 멈춤

이제 판정에 쓸 데이터가 코드 안에 있습니다.

```sql
select user_id, count(*) filter (where event = 'box_copied') as copies,
       count(distinct date_trunc('day', created_at)) as active_days
from analytics_events
where created_at > now() - interval '14 days'
group by user_id
order by active_days desc;
```

`active_days >= 3`인 사용자가 한 명이라도 있으면 게이트 통과입니다. `upgrade_intents`에 쌓인 관심도 함께 봅니다.

## 2단계 — 파일·이미지 (게이트 통과 후에만)

스키마에 자리는 이미 있습니다: `boxes.kind`가 `image`/`file`을 받고, `r2_key`·`byte_size`·`expires_at` 컬럼과 `boxes_kind_shape` 제약, `spaces.quota_bytes`(50MB) 초과 검사, `plans.file_max_bytes`(Free 15MB)가 전부 동작합니다.

새로 만들어야 할 것:

- [ ] Cloudflare R2 버킷 (비공개)
- [ ] Supabase Edge Function — 멤버십 확인 후 60초짜리 서명 URL 발급. **R2 액세스 키는 여기에만** 두고 확장/웹 번들에는 절대 넣지 않습니다 (브리핑 §6)
- [ ] 업로드/다운로드는 브라우저 ↔ R2 직접 통신. **파일 바이트가 Supabase를 거치면 안 됩니다** — 거치는 순간 이그레스 무료의 이점이 사라집니다 (§5)
- [ ] 7일 만료 정리 작업 (cron)
- [ ] 클라이언트 이미지 리사이즈(장변 1600px) + WebP 변환 — 안 하면 체감 용량이 3~5배 늘어납니다 (§7)
- [ ] UI에서 파일을 텍스트/이미지와 다르게 취급 — **파일은 클립보드로 못 씁니다.** 다운로드 버튼으로만 (§3, 브라우저 플랫폼 제약)
- [ ] 용량 막대를 박스 개수 → 바이트로 전환. 이때 문구는 "50MB까지"가 아니라 **"주당 50MB씩 계속"** (§7 — 7일 만료라 총량이 아니라 동시 점유량입니다)

---

## 3단계 — 결제

DB 구조는 이미 준비돼 있습니다: `subscriptions`(plan, status, trial_ends_at, current_period_end, cancel_at_period_end, provider, external_id)와 `sync_profile_plan` 트리거가 구독 상태를 `profiles.plan`과 스페이스 한도에 자동 반영합니다. 남은 건 결제 provider 연결뿐입니다.

**실제 수요가 확인되면** 그때 만듭니다. 지금은 `upgrade_intents`와 `analytics_events`의 `upgrade_clicked`/`upgrade_started`로 수요를 셉니다.

- [ ] Lemon Squeezy(MoR) 연동 — Stripe 직접 쓰면 해외 소비세 신고 의무가 생깁니다
- [ ] 애드온은 기존 구독에 얹는 방식(proration)으로만 — 별도 결제로 팔면 $0.50 고정 수수료가 저가 상품을 잠식합니다
- [ ] 다운그레이드 처리: 초과 박스를 **자동 삭제 금지**. 읽기 전용으로 전환하고 사용자가 직접 정리 (§11). `boxes.locked` 필드가 이미 준비돼 있습니다

---

## 아직 결정 안 된 것 (브리핑 §12)

답이 필요해지면 추측하지 말고 상의합니다.

- [ ] Team 티어 — DB에는 브리핑 확정 한도(100박스·10스페이스)만 보존하고 v1 UI에서는 숨김
- [ ] 가격 — 구체적인 금액을 노출하지 않으며 검증 이후 결정
- [x] 사용량 통계 범위 — 검증용 최소 이벤트와 허용 속성만 수집. 문구 내용 제외, DB 함수에서 재검증
- [ ] **스페이스 owner 위임 UI** — owner는 여전히 나갈 수 없고 삭제만 가능. admin 역할은 추가됐지만 소유권 이전은 미구현
- [ ] 다국어 — v1은 한국어 전용, 이후 지원 범위는 검증 후 결정
- [ ] AI 기능(문구 다듬기·번역) — API 비용 때문에 초기엔 넣지 않음. Pro 차별화가 필요해지면 재검토

---

## 알려진 리스크 (브리핑 §8)

| 리스크 | 대응 |
| --- | --- |
| 회사 PC에서 크롬 확장 자체가 차단 (금융·공공·대기업) | **웹 버전이 이 리스크의 회피책입니다.** 확장이 막힌 환경에선 웹으로 씁니다 |
| 카톡·구글드라이브와의 경쟁 | §2 포지셔닝("이름표 붙은 고정 자리")으로 차별화. 이것과 충돌하는 기능은 만들지 않습니다 |
| 유료 전환 동기 부족 | 박스 개수를 2번째 과금 축으로 (§10) |

---

## 기술 부채 / 나중에

- [ ] 스페이스 참여 비밀번호 무차별 대입 제한 — 현재 없음. 공개 배포 규모가 커지면 필요
- [ ] 확장 웹스토어 draft 생성 → 확정된 확장 ID로 OAuth 최종 확인 (§13: ID가 먼저 확정돼야 인증이 안 깨집니다)
- [ ] `web/site.css`와 `styles.css`(확장) 중복 — 지금은 레이아웃이 달라 분리가 맞지만, 토큰(색/간격)은 공유할 수 있습니다
