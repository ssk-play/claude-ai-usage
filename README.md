# 📊 Claude AI Usage Monitor

> Chrome 확장 프로그램으로 Claude AI 사용량 변화를 감지하고 Telegram으로 알림을 보냅니다.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)
![License](https://img.shields.io/badge/License-MIT-blue)

## ✨ 기능

- ⏱️ **자동 모니터링** — 설정한 간격(기본 5분)마다 사용량 체크
- 🔔 **Telegram 알림** — 사용량 변동 감지 시 즉시 알림
- 📈 **일별 그래프** — 최대 7일간 사용량 추이를 차트로 확인
- 📩 **수동 리포트** — 버튼 하나로 현재 상태 즉시 전송
- 🎯 **비교 대상 선택** — 현재 세션 / 주간 All Models / 주간 Sonnet Only

## 🚀 설치

1. 이 저장소를 클론합니다
   ```bash
   git clone https://github.com/ssk-play/claude-ai-usage.git
   ```
2. Chrome에서 `chrome://extensions` 열기
3. 우측 상단 **개발자 모드** 켜기
4. **압축해제된 확장 프로그램을 로드합니다** → `extension/` 폴더 선택

## ⚙️ 설정

1. 확장 프로그램 아이콘 클릭
2. **Telegram 설정** 펼치기
   - **Bot Token** — [@BotFather](https://t.me/BotFather)에서 생성한 봇 토큰
   - **Chat ID** — 알림 받을 채팅 ID ([확인 방법](https://core.telegram.org/bots/api#getupdates))
3. **체크 간격** — 분 단위 (기본 5분)
4. **비교 대상** — 모니터링할 항목 선택
5. **저장**

> 💡 Telegram 봇과 먼저 `/start` 대화를 시작해야 메시지를 받을 수 있습니다.

## 📸 사용법

| 기능 | 설명 |
|------|------|
| **지금 체크** | 수동으로 즉시 사용량 체크 |
| **📩 리포트 전송** | 현재 상태를 Telegram으로 전송 |
| **그래프 탭** | 오늘 / 3일 / 7일 사용량 추이 차트 |

## 🔔 알림 예시

```
📊 Claude AI Usage 변동
⏰ 2026. 1. 30. 오후 7:35:00

📈 All Models: 3% → 5%
📈 Sonnet: 10% → 12%
```

## 🔒 보안

- **민감 정보 없음** — 소스코드에 토큰/키 미포함
- 모든 설정은 사용자의 브라우저 `chrome.storage`에만 저장
- Cloudflare 우회 없음 — 사용자의 실제 Chrome 브라우저 내에서 동작

## 📁 구조

```
extension/
├── manifest.json   # Manifest V3 설정
├── background.js   # Service Worker — 알람, 상태 비교, Telegram 전송
├── content.js      # Content Script — claude.ai/settings/usage 데이터 추출
├── chart.js        # Canvas 기반 사용량 차트
├── popup.html      # 팝업 UI
├── popup.js        # 팝업 로직
├── popup.css       # 팝업 스타일
└── icons/          # 확장 프로그램 아이콘
```

## 📄 License

MIT
