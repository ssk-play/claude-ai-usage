# Claude AI Usage Monitor

Chrome 확장 프로그램으로 Claude AI 사용량을 5분마다 체크하고, 변화가 감지되면 Telegram으로 알림.

## 작동 방식

1. Chrome 확장 프로그램이 5분마다 `claude.ai/settings/usage` 페이지를 백그라운드 탭으로 열어 스크래핑
2. 이전 데이터와 비교하여 변화 감지
3. 변화 발견 시 **Telegram Bot API**로 알림 전송

Cloudflare 봇 탐지 문제 없음 — 사용자의 실제 Chrome 브라우저 내에서 동작.

## 설치

1. Chrome에서 `chrome://extensions` 열기
2. **개발자 모드** 켜기 (우측 상단 토글)
3. **압축해제된 확장 프로그램을 로드합니다** 클릭
4. `extension/` 폴더 선택

## 설정

1. 확장 프로그램 아이콘 (📊) 클릭
2. **Bot Token**: Telegram 봇 토큰 입력
3. **Chat ID**: 알림 받을 Telegram Chat ID 입력
4. **저장** 클릭

## 사용

- 설치 + 설정 후 자동으로 5분마다 체크
- 팝업에서 **지금 체크** 버튼으로 수동 체크 가능
- 팝업에서 현재 상태/마지막 체크 시간 확인 가능

## 알림 예시

```
📊 Claude AI Usage 변동
⏰ 2026. 1. 30. 오후 7:35:00

📈 Opus 4: 3% → 5%
📈 Sonnet 4: 10% → 12%
```

## 프로젝트 구조

```
extension/
├── manifest.json      # Chrome Extension Manifest V3
├── background.js      # Service Worker (알람, 상태 관리, Telegram 전송)
├── content.js         # Content Script (usage 페이지 데이터 추출)
├── popup.html/js/css  # 팝업 UI (설정 + 상태)
└── icons/             # 확장 프로그램 아이콘
```
