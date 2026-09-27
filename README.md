<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/kiki-logo-1-dark.png">
    <img src="assets/kiki-logo-1.png" alt="KIKI" width="360">
  </picture>
</p>

# KIST 포탈 자동화 스킬 패키지 

<br>

## 구성
| skill | 용도 | 기능 | 권장모델 |
|-------|------|------|:--------:|
| **kk-pay** | 지급신청 | 세금계산서 지급신청서 자동작성,<br>카드결제건 RPA 자동처리 | Opus / Sol<br>(RPA는 Sonnet / Luna) |
| **kk-meeting** | 회의비처리 | 회의록, 회의비 지급신청서 자동 작성  | Opus / Sol |
| **kk-inspect** | 물품검수 | 소액 검수 신청서 자동 작성 | Sonnet / Sol |
| **kk-budget** | 예산조회 | 과제 예실대비표 예산현황 자동조회  | Sonnet / Luna |
| **kk-mail** | 메일관리 | 자연어 메일검색, 자동 폴더분류,<br>불건전 학회/저널 메일 자동스팸 | Opus / Sol<br>(분류, 스팸처리 Sonnet / Luna) |
| **kk-wiki** | 규정, 담당자 검색 | KIST WIKI, 업무담당자 자연어 검색 | Opus / Sol |

<br><br>

## 설치
claude code (claude 데스크탑 앱에서 code), codex 대화창에  

```
https://github.com/angmond1/kk 설치해줘
```

설치지침: claude는 [CLAUDE.md](CLAUDE.md), codex는 [CODEX.md](CODEX.md)  

<br><br>

## 준비물

### 1. claude 또는 chatgpt 유료 계정과 데스크탑 앱 (또는 CLI) 설치
- claude 설치 https://claude.com/download  
- codex (chatgpt) 설치 https://openai.com/ko-KR/codex/  

<br>

### 2. chrome 브라우저 + 확장 프로그램 설치
- chrome 브라우저 설치 https://www.google.com/chrome/  
- claude: https://chromewebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn  

  그러고 나서 claude app 좌하단 이니셜 클릭 → "설정" 클릭 → 좌측 탭에서 "Claude in Chrome 설정" 클릭 → Claude in Chrome 사용설정 켜기  

- codex: https://chromewebstore.google.com/detail/chatgpt/hehggadaopoacecdllhhajmbjkdcmajg?pli=1  

  그리고 나서 codex app에서 좌하단 이니셜 클릭 → 설정 → 좌측 탭의 "컴퓨터 사용" → Google Chrome 사용설정 켜기  

<br>

### 3. chrome-devtools-mcp 설치 (파일첨부용)
- 대화창에 "chrome-devtools mcp 설치해서 사용 가능하게 해줘" → claude 또는 codex 재시작  

<br>

### 4. chrome 브라우저로 KIST 포탈·Dooray 로그인 필요
- kk-mail, kk-budget 스킬은 먼저 chrome 브라우저로 KIST 포탈에 로그인해 둔 채로 진행  
- 파일첨부 스킬 (kk-pay 세금계산서, kk-meeting, kk-inspect)은 새 chrome 브라우저에서 재 로그인을 요구함  

<br>

### 5. Dooray 토큰 (카드결제건 RPA 업로드용)
토큰 생성페이지 https://kist.gov-dooray.com/setting/api/token 에서 토큰 생성하고  
kiki 설치폴더에 token.txt 파일에(예 `C:\kiki\token.txt`) 토큰 값 붙여넣고 저장,  
claude code 대화창에 "두레이 토큰 저장했다"  
⚠️ 토큰·API 키를 채팅창에 입력하면 타인에게 노출될 수 있습니다.  

<br><br>
## 사용법 예시
KIST 포탈 로그인 후

| skill | 채팅창 기입 |
|-------|------------|
| **kk-pay** | 세금계산서/카드결제내역 파일·폴더 경로를 알려주면서<br>"여기 폴더에 있는 결제건들 지급신청하자" |
| **kk-meeting** | "이번달 카드결제내역 파악해서 회의비 지급신청하자" |
| **kk-inspect** | 계산서/영수증, 검수물품 사진 파일·폴더 경로를 알려주면서<br>"여기 폴더에 있는 결제건들 검수신청해줘" |
| **kk-budget** | "내가 참여하고 있는 과제에서 재료비 잔액 알려줘"<br>"2E11111 과제에서 김키키가 사용한 금액 파악해줘" |
| **kk-mail** | "지난달 김키키와 논문작성건으로 주고받은 메일 파악해서 내용 정리해줘"<br>"시그마 알드리치에서 오는 메일은 시약 폴더를 만들어서 자동분류되게 해줘"<br>"지난 1주일간 메일 내역 파악해서 불량 학회/저널에서 온 메일 스팸처리해줘" |
| **kk-wiki** | "3천만원 연구장비 구매요구서 작성시 필요서류와 결제선은?"<br>"해외출장중 공식일정 없는 토/일요일은 어떻게 처리해? 담당자는?" |

⚠️ 파일첨부 스킬(pay 세금계산서, meeting, inspect)은 새 chrome 브라우저에서 재로그인을 요구합니다.  
⚠️ 최초 2-3회는 과정을 지켜봐주면서 실수를 알려주길 권장합니다.

<br><br>

## 문의
이동기 / 청정에너지연구센터 e-chemical 연구팀  
dnklee@kist.re.kr
