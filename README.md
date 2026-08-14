# 찰캌 아카이브

카카오톡 오픈채팅방에서 함께 나눈 사진을 날짜와 주제별로 다시 볼 수 있는 모바일 우선 사진 아카이브입니다.

## 기능

- 주소에 날짜가 없으면 오늘 날짜를 표시하고, 이전·다음 날짜 이동 및 날짜 직접 선택
- 날짜가 포함된 공유 URL (`?date=2026-08-05`)
- 반응형 masonry 사진 갤러리와 큰 사진 보기
- 관리자 비밀번호 화면
- 사진 여러 장 선택, 미리보기, 순서 변경
- GitHub 저장소에 이미지와 `gallery.json`을 한 커밋으로 게시
- 관리자 화면에서 날짜별 익명 방문자와 조회수 확인
- GitHub Actions 기반 Pages 자동 배포

## 로컬 실행

```bash
npm install
npm run dev
```

프로덕션 빌드:

```bash
npm run build
```

## 관리자 게시 설정

GitHub Pages는 정적 호스팅이므로 화면 진입 비밀번호만으로 업로드 권한을 안전하게 보호할 수 없습니다. 실제 게시에는 관리자 본인의 fine-grained personal access token을 사용합니다.

토큰 설정:

1. GitHub의 **Fine-grained personal access tokens**에서 새 토큰을 만듭니다.
2. Repository access를 **Only select repositories**로 설정하고 `smiinii/chalkak-prototype`만 선택합니다.
3. Repository permissions에서 **Contents: Read and write**만 허용합니다.
4. 관리자 화면의 게시 단계에 토큰을 붙여 넣습니다.

토큰은 앱 상태에만 존재하며 브라우저 저장소나 저장소 파일에 보관되지 않습니다. 공유 컴퓨터에서는 게시 후 탭을 닫아 주세요.

## 데이터

공개 데이터는 [`public/data/gallery.json`](public/data/gallery.json)에 저장됩니다. 관리자가 올린 이미지는 `public/photos/YYYY-MM-DD/` 아래에 들어갑니다.

## 방문 통계 설정

방문 기록은 PostHog에 이름이나 사진 내용 없이 페이지뷰만 전송합니다. 공개 수집 키와 Project ID `557484`는 사이트에 연결되어 있습니다. 통계를 읽는 개인 API 키만 반드시 GitHub Actions secret으로 보관해야 합니다.

1. PostHog Personal API key를 `Query: Read` 권한만 주어 만듭니다.
2. 저장소 secret `POSTHOG_PERSONAL_API_KEY`에 그 키를 추가합니다.
3. GitHub Actions의 `Deploy to GitHub Pages`를 한 번 실행합니다.

통계 파일은 약 10분마다 갱신되며 서울 시간 기준 최근 30일을 집계합니다. 관리자 화면은 최신 파일을 1분마다 확인하고 최근 7일을 그래프로 보여 줍니다. GitHub Actions 예약 실행 상황에 따라 갱신이 몇 분 늦어질 수 있으며, 비밀키가 없거나 PostHog 조회가 일시적으로 실패해도 사진 아카이브 배포는 계속됩니다.

## GitHub Pages

저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 선택하면 `main` 브랜치 변경 때마다 자동 배포됩니다.
